// src/routes/auth.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

const passwordRules = body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters');

router.post('/register', [
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('phone').matches(/^0[7-9][01]\d{8}$/).withMessage('Enter a valid Nigerian phone number'),
  passwordRules,
], ctrl.register);

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], ctrl.login);

router.post('/refresh', ctrl.refresh);
router.post('/logout',  ctrl.logout);
router.get('/me', protect, ctrl.me);

module.exports = router;


// ──────────────────────────────────────────────
// src/routes/product.routes.js  (append below)
