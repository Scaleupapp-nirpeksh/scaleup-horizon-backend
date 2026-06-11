// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const { protect, requireActiveOrganization } = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');

router.use(protect);
router.use(requireActiveOrganization);

router.get('/', notificationController.getNotifications);
router.post('/read-all', notificationController.markAllRead);
router.post('/:id/read', notificationController.markRead);

module.exports = router;
