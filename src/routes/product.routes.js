// src/routes/product.routes.js
const router  = require('express').Router();
const ctrl    = require('../controllers/product.controller');
const { protect, adminOnly, staffOrMore } = require('../middleware/auth.middleware');

router.get('/',              ctrl.getProducts);
router.get('/inventory',     protect, staffOrMore, ctrl.getInventoryStats);
router.get('/:slug',         ctrl.getProduct);
router.post('/',             protect, adminOnly,   ctrl.createProduct);
router.put('/:id',           protect, adminOnly,   ctrl.updateProduct);
router.patch('/:id',         protect, adminOnly,   ctrl.updateProduct);
router.delete('/:id',        protect, adminOnly,   ctrl.deleteProduct);

module.exports = router;
