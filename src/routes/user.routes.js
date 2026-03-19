// src/routes/user.routes.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth.middleware');
const prisma = new PrismaClient();

// Update profile
router.patch('/me', protect, async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data:  { firstName, lastName, phone },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Update failed.' });
  }
});

// Addresses
router.get('/addresses', protect, async (req, res) => {
  const addresses = await prisma.address.findMany({ where: { userId: req.user.id } });
  res.json(addresses);
});

router.post('/addresses', protect, async (req, res) => {
  try {
    const { label, street, city, state, landmark, isDefault } = req.body;
    if (isDefault) {
      await prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
    }
    const address = await prisma.address.create({
      data: { userId: req.user.id, label, street, city, state, landmark, isDefault: isDefault || false },
    });
    res.status(201).json(address);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add address.' });
  }
});

router.delete('/addresses/:id', protect, async (req, res) => {
  await prisma.address.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
  res.json({ message: 'Address removed.' });
});

// Notifications
router.get('/notifications', protect, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where:   { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  res.json(notifications);
});

router.patch('/notifications/read', protect, async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id },
    data:  { isRead: true },
  });
  res.json({ message: 'All marked as read.' });
});

// Admin: list all users
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 30, search } = req.query;
    const where = {};
    if (search) {
      where.OR = [
        { email:     { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
        { phone:     { contains: search } },
      ];
    }
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, firstName: true, lastName: true,
          email: true, phone: true, role: true, tier: true,
          loyaltyPoints: true, isActive: true, createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ users, total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

module.exports = router;
