// routes/investorReportRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const investorReportController = require('../controllers/investorReportController');

router.use(protect); // All routes are protected

// @route   POST /api/horizon/investor-reports
// @desc    Create a new investor report/narrative update
// @access  Private (Founders)
router.post('/', investorReportController.createInvestorReport);

// @route   GET /api/horizon/investor-reports
// @desc    Get all saved investor reports/narrative updates
// @access  Private (Founders)
router.get('/', investorReportController.getInvestorReports);

// @route   GET /api/horizon/investor-reports/live-dashboard-data
// @desc    Get aggregated data for the live investor dashboard view
// @access  Private (Founders)
router.get('/live-dashboard-data', investorReportController.getLiveDashboardData);

// @route   GET /api/horizon/investor-reports/:id
// @desc    Get a specific saved investor report by ID
// @access  Private (Founders)
router.get('/:id', investorReportController.getInvestorReportById);

// @route   PUT /api/horizon/investor-reports/:id
// @desc    Update a saved investor report/narrative update
// @access  Private (Founders)
router.put('/:id', investorReportController.updateInvestorReport);

// @route   DELETE /api/horizon/investor-reports/:id
// @desc    Delete a saved investor report
// @access  Private (Founders)
router.delete('/:id', investorReportController.deleteInvestorReport);

module.exports = router;