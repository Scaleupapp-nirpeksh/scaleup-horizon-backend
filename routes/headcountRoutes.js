


// routes/headcountRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const headcountController = require('../controllers/headcountController');

// Apply authentication to all routes
router.use(protect);

// @route   POST /api/horizon/headcount
// @desc    Create a new headcount entry
// @access  Private
router.post('/', headcountController.createHeadcount);

// @route   GET /api/horizon/headcount
// @desc    Get all headcount entries with optional filtering
// @access  Private
router.get('/', headcountController.getHeadcounts);

// @route   GET /api/horizon/headcount/summary
// @desc    Get headcount summary statistics
// @access  Private
router.get('/summary', headcountController.getHeadcountSummary);

// @route   GET /api/horizon/headcount/org-chart
// @desc    Get org chart data
// @access  Private
router.get('/org-chart', headcountController.getOrgChart);

// @route   GET /api/horizon/headcount/:id
// @desc    Get a single headcount entry by ID
// @access  Private
router.get('/:id', headcountController.getHeadcountById);

// @route   PUT /api/horizon/headcount/:id
// @desc    Update a headcount entry
// @access  Private
router.put('/:id', headcountController.updateHeadcount);

// @route   DELETE /api/horizon/headcount/:id
// @desc    Delete a headcount entry
// @access  Private
router.delete('/:id', headcountController.deleteHeadcount);

// @route   PATCH /api/horizon/headcount/:id/hiring-status
// @desc    Update hiring status for a position
// @access  Private
router.patch('/:id/hiring-status', headcountController.updateHiringStatus);

// @route   POST /api/horizon/headcount/:id/convert-to-employee
// @desc    Convert an open requisition to an active employee
// @access  Private
router.post('/:id/convert-to-employee', headcountController.convertToEmployee);

// @route   POST /api/horizon/headcount/:id/link-expenses
// @desc    Link expenses to a headcount entry
// @access  Private
router.post('/:id/link-expenses', headcountController.linkExpenses);

module.exports = router;



