// src/routes/order.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/order.controller');
const { protect, adminOnly, staffOrMore } = require('../middleware/auth.middleware');

router.post('/',                   protect,              ctrl.createOrder);
router.get('/mine',                protect,              ctrl.getMyOrders);
router.get('/all',                 protect, staffOrMore, ctrl.getAllOrders);
router.get('/stats',               protect, staffOrMore, ctrl.getRevenueStats);
router.get('/:reference',          protect,              ctrl.getOrder);
router.patch('/:id/status',        protect, staffOrMore, ctrl.updateOrderStatus);

module.exports = router;
