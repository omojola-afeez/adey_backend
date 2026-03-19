// src/routes/admin.routes.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { protect, staffOrMore, adminOnly } = require('../middleware/auth.middleware');
const prisma = new PrismaClient();

// Full dashboard summary
router.get('/summary', protect, staffOrMore, async (req, res) => {
  try {
    const now      = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.setHours(0,0,0,0));

    const [
      totalRevenue, monthRevenue, todayRevenue,
      totalOrders, pendingOrders, processingOrders,
      totalProducts, lowStock, outOfStock,
      totalUsers, newUsersMonth,
      activeShipments,
    ] = await Promise.all([
      prisma.order.aggregate({ where: { paymentStatus: 'PAID' },                                              _sum: { total: true } }),
      prisma.order.aggregate({ where: { paymentStatus: 'PAID', createdAt: { gte: monthStart } },             _sum: { total: true } }),
      prisma.order.aggregate({ where: { paymentStatus: 'PAID', createdAt: { gte: todayStart } },             _sum: { total: true } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'PROCESSING' } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({ where: { availability: 'LOW_STOCK' } }),
      prisma.product.count({ where: { availability: 'OUT_OF_STOCK' } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: monthStart } } }),
      prisma.shipment.count({ where: { status: { in: ['IN_TRANSIT','CUSTOMS_CLEARANCE','ARRIVED_PORT'] } } }),
    ]);

    // Recent orders for table
    const recentOrders = await prisma.order.findMany({
      take:    8,
      orderBy: { createdAt: 'desc' },
      include: {
        user:  { select: { firstName: true, lastName: true } },
        items: { take: 1, include: { product: { select: { name: true } } } },
      },
    });

    // Top products by revenue
    const topProducts = await prisma.orderItem.groupBy({
      by: ['productId'],
      _sum:   { totalPrice: true },
      _count: { id: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: 5,
    });

    const topProductIds = topProducts.map(p => p.productId);
    const topProductDetails = await prisma.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, name: true, images: true, sellingPrice: true },
    });

    const topProductsEnriched = topProducts.map(tp => ({
      ...tp,
      product: topProductDetails.find(p => p.id === tp.productId),
    }));

    res.json({
      revenue: {
        total:   totalRevenue._sum.total   || 0,
        month:   monthRevenue._sum.total   || 0,
        today:   todayRevenue._sum.total   || 0,
      },
      orders: {
        total: totalOrders, pending: pendingOrders, processing: processingOrders,
      },
      inventory: {
        total: totalProducts, lowStock, outOfStock,
      },
      users: {
        total: totalUsers, newThisMonth: newUsersMonth,
      },
      shipments: { active: activeShipments },
      recentOrders,
      topProducts: topProductsEnriched,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load admin summary.' });
  }
});

// Coupon management
router.post('/coupons', protect, adminOnly, async (req, res) => {
  try {
    const { code, type, value, minOrderValue, maxUses, expiresAt } = req.body;
    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(), type, value,
        minOrderValue: minOrderValue || 0,
        maxUses:   maxUses   || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    res.status(201).json(coupon);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Coupon code already exists.' });
    res.status(500).json({ error: 'Failed to create coupon.' });
  }
});

router.get('/coupons', protect, staffOrMore, async (req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(coupons);
});

module.exports = router;
