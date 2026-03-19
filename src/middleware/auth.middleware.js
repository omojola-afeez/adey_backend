// src/middleware/auth.middleware.js

const jwt     = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma  = new PrismaClient();

// ── Verify access token ────────────────────────
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided. Please sign in.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true, email: true, phone: true,
        firstName: true, lastName: true,
        role: true, tier: true, isActive: true,
      },
    });

    if (!user)          return res.status(401).json({ error: 'User not found.' });
    if (!user.isActive) return res.status(403).json({ error: 'Account is deactivated.' });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please refresh.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

// ── Role guard ─────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      error: `Access denied. Required role: ${roles.join(' or ')}.`,
    });
  }
  next();
};

// ── Shorthand guards ───────────────────────────
const adminOnly   = requireRole('ADMIN', 'SUPERADMIN');
const staffOrMore = requireRole('STAFF', 'ADMIN', 'SUPERADMIN');

module.exports = { protect, requireRole, adminOnly, staffOrMore };
