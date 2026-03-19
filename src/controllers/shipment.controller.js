// src/controllers/shipment.controller.js

const { PrismaClient } = require('@prisma/client');
const { sendSMS }      = require('../utils/sms');
const { logger }       = require('../utils/logger');
const prisma = new PrismaClient();

// ── Get all shipments (admin) ──────────────────
exports.getShipments = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = status ? { status } : {};

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: { product: { select: { name: true, images: true } } },
          },
        },
      }),
      prisma.shipment.count({ where }),
    ]);

    res.json({ shipments, total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shipments.' });
  }
};

// ── Create shipment (admin) ────────────────────
exports.createShipment = async (req, res) => {
  try {
    const { reference, vessel, departedAt, etaLagos, items, notes } = req.body;

    const shipment = await prisma.shipment.create({
      data: {
        reference,
        vessel,
        departedAt: departedAt ? new Date(departedAt) : null,
        etaLagos:   etaLagos   ? new Date(etaLagos)   : null,
        notes,
        items: items ? { create: items } : undefined,
      },
      include: { items: { include: { product: true } } },
    });

    // Mark included products as IN_TRANSIT
    if (items?.length) {
      const productIds = items.map(i => i.productId);
      await prisma.product.updateMany({
        where: { id: { in: productIds } },
        data:  { availability: 'IN_TRANSIT' },
      });
    }

    logger.info(`Shipment created: ${reference}`);
    res.status(201).json(shipment);
  } catch (err) {
    logger.error('createShipment error:', err);
    res.status(500).json({ error: 'Failed to create shipment.' });
  }
};

// ── Update shipment status (admin) ────────────
exports.updateShipmentStatus = async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    const shipment = await prisma.shipment.update({
      where: { id },
      data:  {
        status,
        ...(status === 'DEPARTED'           ? { departedAt: new Date() }  : {}),
        ...(status === 'ARRIVED_PORT'       ? { arrivedAt:  new Date() }  : {}),
        ...(status === 'CLEARED'            ? { clearedAt:  new Date() }  : {}),
      },
      include: { items: { include: { product: true } } },
    });

    // When cleared — mark products back IN_STOCK and notify pre-order customers
    if (status === 'CLEARED') {
      const productIds = shipment.items.map(i => i.productId);

      await prisma.product.updateMany({
        where: { id: { in: productIds } },
        data:  { availability: 'IN_STOCK' },
      });

      // Find all pre-orders for these products and notify customers
      const preOrders = await prisma.order.findMany({
        where: {
          status: 'PRE_ORDER',
          items:  { some: { productId: { in: productIds } } },
        },
        include: {
          user:  { select: { phone: true, firstName: true } },
          items: { include: { product: { select: { name: true } } } },
        },
      });

      for (const order of preOrders) {
        const productNames = order.items.map(i => i.product.name).join(', ');
        await sendSMS(order.user.phone,
          `🎉 Great news, ${order.user.firstName}! Your pre-ordered item(s) [${productNames}] have cleared customs. Pay your balance to confirm delivery: adeyimports.com/orders`
        );
        await prisma.order.update({
          where: { id: order.id },
          data:  { status: 'PROCESSING' },
        });
      }
    }

    logger.info(`Shipment ${id} updated to ${status}`);
    res.json(shipment);
  } catch (err) {
    logger.error('updateShipmentStatus error:', err);
    res.status(500).json({ error: 'Failed to update shipment.' });
  }
};

// ── Public: track by order reference ──────────
exports.trackByOrder = async (req, res) => {
  try {
    const { reference } = req.params;

    const order = await prisma.order.findUnique({
      where: { reference },
      select: {
        reference: true, status: true, createdAt: true,
        paidAt: true, dispatchedAt: true, deliveredAt: true,
        items: {
          include: { product: { select: { name: true, images: true } } },
        },
      },
    });

    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Build timeline
    const timeline = [
      { stage: 'Order Placed',        done: true,              time: order.createdAt },
      { stage: 'Payment Confirmed',   done: !!order.paidAt,    time: order.paidAt },
      { stage: 'Processing',          done: ['PROCESSING','IN_TRANSIT','CUSTOMS_CLEARANCE','OUT_FOR_DELIVERY','DELIVERED'].includes(order.status) },
      { stage: 'In Transit',          done: ['IN_TRANSIT','CUSTOMS_CLEARANCE','OUT_FOR_DELIVERY','DELIVERED'].includes(order.status) },
      { stage: 'Customs Clearance',   done: ['CUSTOMS_CLEARANCE','OUT_FOR_DELIVERY','DELIVERED'].includes(order.status) },
      { stage: 'Out for Delivery',    done: ['OUT_FOR_DELIVERY','DELIVERED'].includes(order.status), time: order.dispatchedAt },
      { stage: 'Delivered',           done: order.status === 'DELIVERED', time: order.deliveredAt },
    ];

    res.json({ order, timeline });
  } catch (err) {
    res.status(500).json({ error: 'Tracking failed.' });
  }
};
