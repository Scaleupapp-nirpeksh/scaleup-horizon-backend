// routes/investorReportRoutes.js
const express = require('express');
const router = express.Router();
// --- MULTI-TENANCY: Import all necessary middleware ---
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware');
const investorReportController = require('../controllers/investorReportController');

// --- MULTI-TENANCY: Apply global protection and require an active organization for all routes ---
router.use(protect);
router.use(requireActiveOrganization);

// @route   POST /api/horizon/investor-reports
// @desc    Create a new investor report/narrative update
// @access  Private - Organization members
router.post('/', authorizeOrganizationRole(['owner', 'member']), investorReportController.createInvestorReport);

// @route   GET /api/horizon/investor-reports
// @desc    Get all saved investor reports/narrative updates
// @access  Private - Organization members
router.get('/', authorizeOrganizationRole(['owner', 'member']), investorReportController.getInvestorReports);

// @route   GET /api/horizon/investor-reports/live-dashboard-data
// @desc    Get aggregated data for the live investor dashboard view
// @access  Private - Organization members
router.get('/live-dashboard-data', authorizeOrganizationRole(['owner', 'member']), investorReportController.getLiveDashboardData);

// @route   GET /api/horizon/investor-reports/:id
// @desc    Get a specific saved investor report by ID
// @access  Private - Organization members
router.get('/:id', authorizeOrganizationRole(['owner', 'member']), investorReportController.getInvestorReportById);

// @route   PUT /api/horizon/investor-reports/:id
// @desc    Update a saved investor report/narrative update
// @access  Private - Organization members
router.put('/:id', authorizeOrganizationRole(['owner', 'member']), investorReportController.updateInvestorReport);

// @route   DELETE /api/horizon/investor-reports/:id
// @desc    Delete a saved investor report
// @access  Private - Organization members
router.delete('/:id', authorizeOrganizationRole(['owner', 'member']), investorReportController.deleteInvestorReport);

module.exports = router;