// src/controllers/product.controller.js

const { PrismaClient } = require('@prisma/client');
const { logger }       = require('../utils/logger');
const prisma = new PrismaClient();

// ── List products (with filters + pagination) ──
exports.getProducts = async (req, res) => {
  try {
    const {
      page = 1, limit = 24,
      category, search, minPrice, maxPrice,
      availability, sort = 'createdAt',
      order = 'desc', featured,
    } = req.query;

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const where = { isActive: true };

    if (category)     where.category = { slug: category };
    if (featured)     where.isFeatured = true;
    if (availability) where.availability = availability;
    if (minPrice || maxPrice) {
      where.sellingPrice = {};
      if (minPrice) where.sellingPrice.gte = parseFloat(minPrice);
      if (maxPrice) where.sellingPrice.lte = parseFloat(maxPrice);
    }
    if (search) {
      where.OR = [
        { name:        { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags:        { has: search.toLowerCase() } },
      ];
    }

    const sortMap = {
      price_asc:  { sellingPrice: 'asc' },
      price_desc: { sellingPrice: 'desc' },
      rating:     { rating: 'desc' },
      popular:    { soldCount: 'desc' },
      newest:     { createdAt: 'desc' },
    };
    const orderBy = sortMap[sort] || { createdAt: 'desc' };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where, skip, take: parseInt(limit), orderBy,
        include: {
          category: { select: { name: true, slug: true, icon: true } },
          variants:  { select: { name: true, value: true, priceAdj: true, stockQty: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      products,
      pagination: {
        total, page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    logger.error('getProducts error:', err);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
};

// ── Single product ─────────────────────────────
exports.getProduct = async (req, res) => {
  try {
    const { slug } = req.params;

    const product = await prisma.product.findUnique({
      where: { slug, isActive: true },
      include: {
        category: true,
        variants: true,
        reviews: {
          where:   { isApproved: true },
          orderBy: { createdAt: 'desc' },
          take:    10,
        },
      },
    });

    if (!product) return res.status(404).json({ error: 'Product not found.' });

    // Related products
    const related = await prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        isActive:   true,
        id:         { not: product.id },
      },
      take:    4,
      orderBy: { soldCount: 'desc' },
      include: { category: { select: { name: true, slug: true } } },
    });

    res.json({ product, related });
  } catch (err) {
    logger.error('getProduct error:', err);
    res.status(500).json({ error: 'Failed to fetch product.' });
  }
};

// ── Create product (admin) ─────────────────────
exports.createProduct = async (req, res) => {
  try {
    const {
      sku, name, slug, description, categoryId,
      costPrice, sellingPrice, comparePrice,
      stockQty, availability, images, tags,
      weight, isFeatured, variants,
    } = req.body;

    const product = await prisma.product.create({
      data: {
        sku, name, slug, description, categoryId,
        costPrice, sellingPrice, comparePrice,
        stockQty: parseInt(stockQty) || 0,
        availability: availability || 'IN_STOCK',
        images: images || [],
        tags:   tags   || [],
        weight, isFeatured: isFeatured || false,
        variants: variants
          ? { create: variants }
          : undefined,
      },
      include: { category: true, variants: true },
    });

    logger.info(`Product created: ${name} by admin ${req.user.id}`);
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'SKU or slug already exists.' });
    }
    logger.error('createProduct error:', err);
    res.status(500).json({ error: 'Failed to create product.' });
  }
};

// ── Update product (admin) ─────────────────────
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const data   = req.body;

    // Auto-set availability based on stock
    if (data.stockQty !== undefined) {
      const qty = parseInt(data.stockQty);
      if (qty === 0 && !data.availability) data.availability = 'OUT_OF_STOCK';
      else if (qty <= 5 && !data.availability) data.availability = 'LOW_STOCK';
      else if (qty > 0 && !data.availability) data.availability = 'IN_STOCK';
    }

    const product = await prisma.product.update({
      where: { id },
      data,
      include: { category: true, variants: true },
    });

    logger.info(`Product updated: ${id}`);
    res.json(product);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Product not found.' });
    logger.error('updateProduct error:', err);
    res.status(500).json({ error: 'Failed to update product.' });
  }
};

// ── Delete product (admin) ─────────────────────
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    // Soft delete
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    logger.info(`Product soft-deleted: ${id}`);
    res.json({ message: 'Product removed.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product.' });
  }
};

// ── Inventory stats (admin) ────────────────────
exports.getInventoryStats = async (req, res) => {
  try {
    const [total, inStock, lowStock, outOfStock, inTransit, preOrder] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({ where: { availability: 'IN_STOCK' } }),
      prisma.product.count({ where: { availability: 'LOW_STOCK' } }),
      prisma.product.count({ where: { availability: 'OUT_OF_STOCK' } }),
      prisma.product.count({ where: { availability: 'IN_TRANSIT' } }),
      prisma.product.count({ where: { availability: 'PRE_ORDER' } }),
    ]);

    res.json({ total, inStock, lowStock, outOfStock, inTransit, preOrder });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory stats.' });
  }
};
