// src/server.js — ADEY Backend Entry Point

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const compression  = require('compression');
const rateLimit    = require('express-rate-limit');
const { logger }   = require('./utils/logger');

// ── Route imports ──────────────────────────────
const authRoutes      = require('./routes/auth.routes');
const productRoutes   = require('./routes/product.routes');
const orderRoutes     = require('./routes/order.routes');
const shipmentRoutes  = require('./routes/shipment.routes');
const userRoutes      = require('./routes/user.routes');
const paymentRoutes   = require('./routes/payment.routes');
const adminRoutes     = require('./routes/admin.routes');
const wishlistRoutes  = require('./routes/wishlist.routes');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security middleware ────────────────────────
app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ── Paystack webhook — needs raw body ─────────
// Must be before express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ── Body parsing ────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ── Global rate limit ──────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 100,
  message:  { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders:   false,
});
app.use('/api/', globalLimiter);

// ── Strict limits for auth endpoints ──────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// ── Health check ───────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'ADEY API',
    version: '1.0.0',
    env:      process.env.NODE_ENV,
    time:     new Date().toISOString(),
  });
});

// ── API Routes ─────────────────────────────────
app.use('/api/auth',      authLimiter, authRoutes);
app.use('/api/products',  productRoutes);
app.use('/api/orders',    orderRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/wishlist',  wishlistRoutes);

// ── 404 handler ────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ───────────────────────
app.use((err, req, res, next) => {
  logger.error({
    message: err.message,
    stack:   err.stack,
    path:    req.path,
    method:  req.method,
  });

  const status  = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Something went wrong'
    : err.message;

  res.status(status).json({ error: message });
});

// ── Start ──────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🚀 ADEY API running on port ${PORT} [${process.env.NODE_ENV}]`);
});

module.exports = app;
