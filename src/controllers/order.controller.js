// src/controllers/order.controller.js

const { PrismaClient } = require('@prisma/client');
const { generateOrderRef } = require('../utils/helpers');
const { sendSMS }          = require('../utils/sms');
const { sendEmail }        = require('../utils/email');
const { logger }           = require('../utils/logger');

const prisma = new PrismaClient();

// ── Create order ───────────────────────────────
exports.createOrder = async (req, res) => {
  try {
    const {
      items,           // [{ productId, variantInfo, quantity }]
      addressId,
      deliveryMethod,
      deliveryFee,
      couponCode,
      notes,
      isPreOrder,
    } = req.body;

    if (!items?.length) return res.status(400).json({ error: 'Order must have at least one item.' });

    // Fetch products and validate stock
    const productIds = items.map(i => i.productId);
    const products   = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = productMap[item.productId];
      if (!product) return res.status(404).json({ error: `Product ${item.productId} not found.` });

      const available = product.stockQty - product.reservedQty;
      if (!isPreOrder && available < item.quantity) {
        return res.status(400).json({
          error: `Not enough stock for "${product.name}". Available: ${available}.`,
        });
      }

      const unitPrice  = product.sellingPrice;
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        productId:   item.productId,
        variantInfo: item.variantInfo || null,
        quantity:    item.quantity,
        unitPrice,
        totalPrice,
        isPreOrder:  isPreOrder || product.availability === 'PRE_ORDER',
      });
    }

    // Validate coupon
    let discount = 0;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: couponCode.toUpperCase(), isActive: true },
      });
      if (coupon && (!coupon.expiresAt || coupon.expiresAt > new Date())) {
        if (subtotal >= coupon.minOrderValue) {
          discount = coupon.type === 'percent'
            ? subtotal * (coupon.value / 100)
            : coupon.value;
          await prisma.coupon.update({
            where: { code: couponCode.toUpperCase() },
            data:  { usedCount: { increment: 1 } },
          });
        }
      }
    }

    const total       = subtotal - discount + (parseFloat(deliveryFee) || 0);
    const depositPaid = isPreOrder ? total * 0.3 : 0;
    const balanceDue  = isPreOrder ? total * 0.7 : 0;

    // Create order in transaction
    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          reference:     generateOrderRef(),
          userId:        req.user.id,
          addressId:     addressId || null,
          deliveryMethod: deliveryMethod || 'STANDARD',
          deliveryFee:   parseFloat(deliveryFee) || 0,
          subtotal,
          discount,
          total,
          depositPaid,
          balanceDue,
          couponCode:    couponCode || null,
          notes:         notes || null,
          status:        'PENDING',
          paymentStatus: isPreOrder ? 'UNPAID' : 'UNPAID',
          items: { create: orderItems },
        },
        include: { items: { include: { product: true } }, address: true },
      });

      // Reserve stock
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data:  { reservedQty: { increment: item.quantity } },
        });
      }

      return o;
    });

    logger.info(`Order created: ${order.reference} by user ${req.user.id}`);
    res.status(201).json(order);

  } catch (err) {
    logger.error('createOrder error:', err);
    res.status(500).json({ error: 'Failed to create order.' });
  }
};

// ── Get my orders ──────────────────────────────
exports.getMyOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const where = { userId: req.user.id };
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: { product: { select: { name: true, images: true, slug: true } } },
          },
          address: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ orders, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
};

// ── Get single order ───────────────────────────
exports.getOrder = async (req, res) => {
  try {
    const { reference } = req.params;
    const order = await prisma.order.findFirst({
      where: {
        reference,
        // customers can only see their own; admins can see all
        ...(req.user.role === 'CUSTOMER' ? { userId: req.user.id } : {}),
      },
      include: {
        items:   { include: { product: true } },
        address: true,
        payments: true,
        user:    { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    });

    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order.' });
  }
};

// ── Update order status (admin/staff) ─────────
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    const order = await prisma.order.update({
      where: { id },
      data:  { status },
      include: {
        user: { select: { phone: true, email: true, firstName: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    });

    // Send SMS on key status changes
    const smsMessages = {
      CONFIRMED:         `Hi ${order.user.firstName}! Your ADEY order ${order.reference} is confirmed. We'll update you when it ships.`,
      OUT_FOR_DELIVERY:  `🚚 Your ADEY order ${order.reference} is out for delivery! Our rider will contact you shortly.`,
      DELIVERED:         `✅ Order ${order.reference} delivered! Enjoy your purchase. Rate us: adeyimports.com/review`,
      CUSTOMS_CLEARANCE: `🛃 Your order ${order.reference} is in customs clearance at Apapa Port. Expected delivery soon.`,
    };

    if (smsMessages[status]) {
      await sendSMS(order.user.phone, smsMessages[status]);
    }

    // Create in-app notification
    await prisma.notification.create({
      data: {
        userId: order.userId,
        type:   'order_update',
        title:  `Order ${status.replace(/_/g, ' ')}`,
        body:   smsMessages[status] || `Your order ${order.reference} status has been updated.`,
      },
    });

    logger.info(`Order ${id} status updated to ${status}`);
    res.json(order);
  } catch (err) {
    logger.error('updateOrderStatus error:', err);
    res.status(500).json({ error: 'Failed to update order status.' });
  }
};

// ── Admin: all orders ──────────────────────────
exports.getAllOrders = async (req, res) => {
  try {
    const {
      page = 1, limit = 20, status,
      search, from, to,
    } = req.query;

    const where = {};
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
    }
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { phone: { contains: search } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user:  { select: { firstName: true, lastName: true, email: true, phone: true } },
          items: { include: { product: { select: { name: true } } } },
          address: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ orders, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
};

// ── Admin: revenue analytics ───────────────────
exports.getRevenueStats = async (req, res) => {
  try {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1); // start of month

    const [
      totalRevenue, monthRevenue, totalOrders, monthOrders,
      pendingOrders, deliveredOrders,
    ] = await Promise.all([
      prisma.order.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { total: true } }),
      prisma.order.aggregate({ where: { paymentStatus: 'PAID', createdAt: { gte: start } }, _sum: { total: true } }),
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: start } } }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'DELIVERED' } }),
    ]);

    res.json({
      totalRevenue:   totalRevenue._sum.total || 0,
      monthRevenue:   monthRevenue._sum.total  || 0,
      totalOrders,
      monthOrders,
      pendingOrders,
      deliveredOrders,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch revenue stats.' });
  }
};
