// src/controllers/auth.controller.js

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { sendSMS }      = require('../utils/sms');
const { sendEmail }    = require('../utils/email');
const { logger }       = require('../utils/logger');

const prisma = new PrismaClient();

// ── Generate tokens ────────────────────────────
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
};

// ── Register ───────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password } = req.body;

    // Check duplicates
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });
    if (existing) {
      const field = existing.email === email ? 'email' : 'phone';
      return res.status(409).json({ error: `This ${field} is already registered.` });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { firstName, lastName, email, phone, passwordHash },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
    });

    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId:    user.id,
        token:     refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Welcome SMS
    await sendSMS(phone, `Welcome to ADEY! 🎉 Your account is ready. Shop quality imports at the best prices in Lagos.`);

    logger.info(`New user registered: ${email}`);
    res.status(201).json({ user, accessToken, refreshToken });

  } catch (err) {
    logger.error('register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

// ── Login ──────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true, email: true, phone: true,
        firstName: true, lastName: true,
        passwordHash: true, role: true, tier: true,
        isActive: true, isVerified: true,
      },
    });

    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.isActive) return res.status(403).json({ error: 'Account is deactivated. Contact support.' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const { accessToken, refreshToken } = generateTokens(user.id);

    await prisma.refreshToken.create({
      data: {
        userId:    user.id,
        token:     refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const { passwordHash, ...safeUser } = user;

    logger.info(`User logged in: ${email}`);
    res.json({ user: safeUser, accessToken, refreshToken });

  } catch (err) {
    logger.error('login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};

// ── Refresh token ──────────────────────────────
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required.' });

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { accessToken, refreshToken: newRefresh } = generateTokens(decoded.userId);

    // Rotate refresh token
    await prisma.refreshToken.delete({ where: { token: refreshToken } });
    await prisma.refreshToken.create({
      data: {
        userId:    decoded.userId,
        token:     newRefresh,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({ accessToken, refreshToken: newRefresh });
  } catch (err) {
    res.status(401).json({ error: 'Token refresh failed.' });
  }
};

// ── Logout ─────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed.' });
  }
};

// ── Get current user ───────────────────────────
exports.me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, phone: true,
        firstName: true, lastName: true,
        role: true, tier: true, loyaltyPoints: true,
        isVerified: true, avatarUrl: true, createdAt: true,
        addresses: { where: { isDefault: true } },
      },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch user.' });
  }
};
