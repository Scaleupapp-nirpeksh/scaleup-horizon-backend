// routes/headcountRoutes.js
const express = require('express');
const router = express.Router();
// --- MULTI-TENANCY: Import all necessary middleware ---
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware');
const headcountController = require('../controllers/headcountController');

// --- MULTI-TENANCY: Apply global protection and require an active organization for all routes ---
router.use(protect);
router.use(requireActiveOrganization);

// @route   POST /api/horizon/headcount
// @desc    Create a new headcount entry
// @access  Private - Organization members
router.post('/', authorizeOrganizationRole(['owner', 'member']), headcountController.createHeadcount);

// @route   GET /api/horizon/headcount
// @desc    Get all headcount entries with optional filtering
// @access  Private - Organization members
router.get('/', authorizeOrganizationRole(['owner', 'member']), headcountController.getHeadcounts);

// @route   GET /api/horizon/headcount/summary
// @desc    Get headcount summary statistics
// @access  Private - Organization members
router.get('/summary', authorizeOrganizationRole(['owner', 'member']), headcountController.getHeadcountSummary);

// @route   GET /api/horizon/headcount/org-chart
// @desc    Get org chart data
// @access  Private - Organization members
router.get('/org-chart', authorizeOrganizationRole(['owner', 'member']), headcountController.getOrgChart);

// @route   GET /api/horizon/headcount/:id
// @desc    Get a single headcount entry by ID
// @access  Private - Organization members
router.get('/:id', authorizeOrganizationRole(['owner', 'member']), headcountController.getHeadcountById);

// @route   PUT /api/horizon/headcount/:id
// @desc    Update a headcount entry
// @access  Private - Organization members
router.put('/:id', authorizeOrganizationRole(['owner', 'member']), headcountController.updateHeadcount);

// @route   DELETE /api/horizon/headcount/:id
// @desc    Delete a headcount entry
// @access  Private - Organization members
router.delete('/:id', authorizeOrganizationRole(['owner', 'member']), headcountController.deleteHeadcount);

// @route   PATCH /api/horizon/headcount/:id/hiring-status
// @desc    Update hiring status for a position
// @access  Private - Organization members
router.patch('/:id/hiring-status', authorizeOrganizationRole(['owner', 'member']), headcountController.updateHiringStatus);

// @route   POST /api/horizon/headcount/:id/convert-to-employee
// @desc    Convert an open requisition to an active employee
// @access  Private - Organization members
router.post('/:id/convert-to-employee', authorizeOrganizationRole(['owner', 'member']), headcountController.convertToEmployee);

// @route   POST /api/horizon/headcount/:id/link-expenses
// @desc    Link expenses to a headcount entry
// @access  Private - Organization members
router.post('/:id/link-expenses', authorizeOrganizationRole(['owner', 'member']), headcountController.linkExpenses);

module.exports = router;