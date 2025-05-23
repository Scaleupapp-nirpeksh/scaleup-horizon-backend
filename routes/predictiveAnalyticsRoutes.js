// routes/predictiveAnalyticsRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const PredictiveAnalyticsController = require('../controllers/predictiveAnalyticsController');

// Apply authentication to all routes
router.use(protect);

// --- Runway Scenarios ---
// @route   POST /api/horizon/analytics/runway-scenarios
// @desc    Create a new runway scenario with projections
// @access  Private
router.post('/runway-scenarios', PredictiveAnalyticsController.createRunwayScenario);

// @route   GET /api/horizon/analytics/runway-scenarios
// @desc    Get all runway scenarios
// @access  Private
router.get('/runway-scenarios', PredictiveAnalyticsController.getRunwayScenarios);

// @route   GET /api/horizon/analytics/runway-scenarios/compare
// @desc    Compare all runway scenarios
// @access  Private
router.get('/runway-scenarios/compare', PredictiveAnalyticsController.compareRunwayScenarios);

// --- Fundraising Predictions ---
// @route   POST /api/horizon/analytics/fundraising-predictions
// @desc    Create a fundraising timeline prediction
// @access  Private
router.post('/fundraising-predictions', PredictiveAnalyticsController.createFundraisingPrediction);

// --- Cash Flow Forecasts ---
// @route   POST /api/horizon/analytics/cash-flow-forecasts
// @desc    Create a cash flow forecast
// @access  Private
router.post('/cash-flow-forecasts', PredictiveAnalyticsController.createCashFlowForecast);

// --- Revenue Cohorts ---
// @route   POST /api/horizon/analytics/revenue-cohorts
// @desc    Create or update a revenue cohort
// @access  Private
router.post('/revenue-cohorts', PredictiveAnalyticsController.createRevenueCohort);

// @route   POST /api/horizon/analytics/revenue-cohorts/:cohortId/projections
// @desc    Generate projections for a cohort
// @access  Private
router.post('/revenue-cohorts/:cohortId/projections', PredictiveAnalyticsController.generateCohortProjections);

// @route   GET /api/horizon/analytics/revenue-cohorts/compare
// @desc    Compare all cohorts
// @access  Private
router.get('/revenue-cohorts/compare', PredictiveAnalyticsController.getCohortsComparison);

module.exports = router;