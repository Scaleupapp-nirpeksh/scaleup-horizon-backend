// routes/deviceRoutes.js
const express = require('express');
const router = express.Router();
const { protect, requireActiveOrganization } = require('../middleware/authMiddleware');
const deviceController = require('../controllers/deviceController');

router.use(protect);
router.use(requireActiveOrganization);

router.post('/', deviceController.registerDevice);
router.delete('/:token', deviceController.unregisterDevice);

module.exports = router;
