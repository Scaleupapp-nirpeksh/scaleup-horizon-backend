// routes/kpiRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const kpiController = require('../controllers/kpiController');

// Apply protect middleware to all routes
router.use(protect);

// --- Manual KPI Snapshot Management ---
// @route   POST /api/horizon/kpis/snapshots
// @desc    Create a new manual KPI snapshot for a specific date
// @access  Private (Founders)
router.post('/snapshots', kpiController.createManualKpiSnapshot);

// @route   GET /api/horizon/kpis/snapshots/:date
// @desc    Get a manual KPI snapshot for a specific date (YYYY-MM-DD)
// @access  Private (Founders)
router.get('/snapshots/:date', kpiController.getManualKpiSnapshotByDate);

// @route   GET /api/horizon/kpis/snapshots
// @desc    Get all manual KPI snapshots (paginated, sorted by date)
// @access  Private (Founders)
router.get('/snapshots', kpiController.getAllManualKpiSnapshots);

// @route   PUT /api/horizon/kpis/snapshots/:id
// @desc    Update an existing manual KPI snapshot by its ID
// @access  Private (Founders)
router.put('/snapshots/:id', kpiController.updateManualKpiSnapshot);

// @route   DELETE /api/horizon/kpis/snapshots/:id
// @desc    Delete a manual KPI snapshot by its ID
// @access  Private (Founders)
router.delete('/snapshots/:id', kpiController.deleteManualKpiSnapshot);


// --- Derived KPI Endpoints (will now use ManualKpiSnapshotModel) ---
// @route   GET /api/horizon/kpis/user-growth
// @desc    Get user growth metrics (Total Users, New Users, DAU, MAU) from latest snapshot
// @access  Private (Founders)
router.get('/user-growth', kpiController.getUserGrowthMetrics);

// @route   GET /api/horizon/kpis/dau-mau-history
// @desc    Get historical DAU and MAU data for charts from snapshots
// @access  Private (Founders)
router.get('/dau-mau-history', kpiController.getDauMauHistory);

// @route   GET /api/horizon/kpis/feature-usage
// @desc    Get usage statistics for key features from latest snapshot
// @access  Private (Founders)
router.get('/feature-usage', kpiController.getFeatureUsageStats);

// @route   GET /api/horizon/kpis/retention
// @desc    Get basic user retention metrics from latest snapshot
// @access  Private (Founders)
router.get('/retention', kpiController.getRetentionMetrics);

// @route   GET /api/horizon/kpis/active-user-definition
// @desc    Get the current definition of an "active user" (informational)
// @access  Private (Founders)
router.get('/active-user-definition', kpiController.getActiveUserDefinition);


module.exports = router;
