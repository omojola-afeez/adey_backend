// src/routes/wishlist.routes.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth.middleware');
const prisma = new PrismaClient();

router.get('/', protect, async (req, res) => {
  const items = await prisma.wishlistItem.findMany({
    where:   { userId: req.user.id },
    include: { product: { include: { category: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(items);
});

router.post('/:productId', protect, async (req, res) => {
  try {
    const item = await prisma.wishlistItem.create({
      data: { userId: req.user.id, productId: req.params.productId },
      include: { product: true },
    });
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Already in wishlist.' });
    res.status(500).json({ error: 'Failed to add to wishlist.' });
  }
});

router.delete('/:productId', protect, async (req, res) => {
  await prisma.wishlistItem.deleteMany({
    where: { userId: req.user.id, productId: req.params.productId },
  });
  res.json({ message: 'Removed from wishlist.' });
});

module.exports = router;
