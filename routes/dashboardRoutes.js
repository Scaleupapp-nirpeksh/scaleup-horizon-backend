// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { protect, requireActiveOrganization } = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

router.use(protect);
router.use(requireActiveOrganization);

router.get('/command-center', dashboardController.getCommandCenter);
router.get('/portfolio', dashboardController.getPortfolio);
router.get('/briefing/preview', dashboardController.previewBriefing);
router.post('/briefing/send', dashboardController.sendBriefing);

module.exports = router;
