// src/routes/shipment.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/shipment.controller');
const { protect, staffOrMore, adminOnly } = require('../middleware/auth.middleware');

router.get('/',              protect, staffOrMore, ctrl.getShipments);
router.post('/',             protect, adminOnly,   ctrl.createShipment);
router.patch('/:id/status',  protect, staffOrMore, ctrl.updateShipmentStatus);
router.get('/track/:reference',                    ctrl.trackByOrder); // public

module.exports = router;
