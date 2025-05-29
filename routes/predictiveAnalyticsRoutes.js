// routes/predictiveAnalyticsRoutes.js
const express = require('express');
const router = express.Router();
// --- MULTI-TENANCY: Import all necessary middleware ---
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware');
const PredictiveAnalyticsController = require('../controllers/predictiveAnalyticsController');

// --- MULTI-TENANCY: Apply global protection and require an active organization for all routes ---
router.use(protect);
router.use(requireActiveOrganization);

// --- Runway Scenarios ---
// @route   POST /api/horizon/analytics/runway-scenarios
// @desc    Create a new runway scenario with projections
// @access  Private - Organization members
router.post('/runway-scenarios', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.createRunwayScenario);

// @route   GET /api/horizon/analytics/runway-scenarios
// @desc    Get all runway scenarios
// @access  Private - Organization members
router.get('/runway-scenarios', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.getRunwayScenarios);

// @route   GET /api/horizon/analytics/runway-scenarios/compare
// @desc    Compare all runway scenarios
// @access  Private - Organization members
router.get('/runway-scenarios/compare', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.compareRunwayScenarios);

// --- Fundraising Predictions ---
// @route   POST /api/horizon/analytics/fundraising-predictions
// @desc    Create a fundraising timeline prediction
// @access  Private - Organization members
router.post('/fundraising-predictions', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.createFundraisingPrediction);

// @route   GET /api/horizon/analytics/fundraising-readiness
// @desc    Analyze current fundraising readiness
// @access  Private - Organization members
// Note: PredictiveAnalyticsController.analyzeCurrentFundraisingReadiness might need to be adapted
// to send a response directly (e.g., res.json(data)) or a new wrapper method created.
router.get('/fundraising-readiness', authorizeOrganizationRole(['owner', 'member']), async (req, res) => {
    try {
        // Assuming analyzeCurrentFundraisingReadiness is adapted or wrapped
        // to handle req, res or a wrapper is used.
        // For direct use, it would be:
        // const readinessMetrics = await PredictiveAnalyticsController.analyzeCurrentFundraisingReadiness();
        // res.json(readinessMetrics);
        // For now, directly calling if you intend to refactor it:
        PredictiveAnalyticsController.analyzeCurrentFundraisingReadiness()
            .then(data => res.json(data))
            .catch(err => {
                console.error('Error in fundraising-readiness route:', err);
                res.status(500).json({ msg: 'Server Error' });
            });
    } catch (err) {
        console.error('Error in fundraising-readiness route:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   GET /api/horizon/analytics/market-comparables
// @desc    Get market comparables for fundraising
// @access  Private - Organization members
// Example Query: /market-comparables?roundType=Seed&targetSize=1000000
// Note: PredictiveAnalyticsController.getMarketComparables might need to be adapted
// to take req, res and parse query params or a new wrapper method created.
router.get('/market-comparables', authorizeOrganizationRole(['owner', 'member']), async (req, res) => {
    try {
        const { roundType, targetSize } = req.query;
        if (!roundType || !targetSize) {
            return res.status(400).json({ msg: 'roundType and targetSize query parameters are required.' });
        }
        // Assuming getMarketComparables is adapted or wrapped:
        const marketData = await PredictiveAnalyticsController.getMarketComparables(roundType, parseFloat(targetSize));
        res.json(marketData);
    } catch (err) {
        console.error('Error in market-comparables route:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// --- Cash Flow Forecasts ---
// @route   POST /api/horizon/analytics/cash-flow-forecasts
// @desc    Create a cash flow forecast
// @access  Private - Organization members
router.post('/cash-flow-forecasts', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.createCashFlowForecast);

// @route   GET /api/horizon/analytics/cash-flow-data/historical
// @desc    Get historical cash flow data
// @access  Private - Organization members
// Note: PredictiveAnalyticsController.getHistoricalCashFlowData might need to be adapted
// to send a response directly or a new wrapper method created.
router.get('/cash-flow-data/historical', authorizeOrganizationRole(['owner', 'member']), async (req, res) => {
    try {
        // Assuming getHistoricalCashFlowData is adapted or wrapped:
        const historicalData = await PredictiveAnalyticsController.getHistoricalCashFlowData();
        res.json(historicalData);
    } catch (err) {
        console.error('Error in historical-cash-flow-data route:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   GET /api/horizon/analytics/cash-position/current
// @desc    Get current cash position
// @access  Private - Organization members
// Note: PredictiveAnalyticsController.getCurrentCashPosition might need to be adapted
// to send a response directly or a new wrapper method created.
router.get('/cash-position/current', authorizeOrganizationRole(['owner', 'member']), async (req, res) => {
    try {
        // Assuming getCurrentCashPosition is adapted or wrapped:
        const currentPosition = await PredictiveAnalyticsController.getCurrentCashPosition();
        res.json(currentPosition);
    } catch (err) {
        console.error('Error in current-cash-position route:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// --- Revenue Cohorts ---
// @route   POST /api/horizon/analytics/revenue-cohorts
// @desc    Create or update a revenue cohort
// @access  Private - Organization members
router.post('/revenue-cohorts', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.createRevenueCohort);

// @route   POST /api/horizon/analytics/revenue-cohorts/:cohortId/projections
// @desc    Generate projections for a cohort
// @access  Private - Organization members
router.post('/revenue-cohorts/:cohortId/projections', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.generateCohortProjections);

// @route   GET /api/horizon/analytics/revenue-cohorts/compare
// @desc    Compare all cohorts
// @access  Private - Organization members
router.get('/revenue-cohorts/compare', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.getCohortsComparison);

// --- Fundraising Predictions (Complete CRUD) ---
// @route   GET /api/horizon/analytics/fundraising-predictions
// @desc    Get all fundraising predictions
// @access  Private - Organization members
router.get('/fundraising-predictions', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.getFundraisingPredictions);

// @route   GET /api/horizon/analytics/fundraising-predictions/:id
// @desc    Get single fundraising prediction
// @access  Private - Organization members
router.get('/fundraising-predictions/:id', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.getFundraisingPredictionById);

// @route   DELETE /api/horizon/analytics/fundraising-predictions/:id
// @desc    Delete fundraising prediction
// @access  Private - Organization members
router.delete('/fundraising-predictions/:id', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.deleteFundraisingPrediction);

// --- Cash Flow Forecasts (Complete CRUD) ---
// @route   GET /api/horizon/analytics/cash-flow-forecasts
// @desc    Get all cash flow forecasts
// @access  Private - Organization members
router.get('/cash-flow-forecasts', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.getCashFlowForecasts);

// @route   GET /api/horizon/analytics/cash-flow-forecasts/:id
// @desc    Get single cash flow forecast
// @access  Private - Organization members
router.get('/cash-flow-forecasts/:id', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.getCashFlowForecastById);

// @route   DELETE /api/horizon/analytics/cash-flow-forecasts/:id
// @desc    Delete cash flow forecast
// @access  Private - Organization members
router.delete('/cash-flow-forecasts/:id', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.deleteCashFlowForecast);

// --- Revenue Cohorts (Complete CRUD) ---
// @route   GET /api/horizon/analytics/revenue-cohorts
// @desc    Get all revenue cohorts
// @access  Private - Organization members
router.get('/revenue-cohorts', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.getRevenueCohorts);

// @route   GET /api/horizon/analytics/revenue-cohorts/:id
// @desc    Get single revenue cohort
// @access  Private - Organization members
router.get('/revenue-cohorts/:id', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.getRevenueCohortById);

// @route   DELETE /api/horizon/analytics/revenue-cohorts/:id
// @desc    Delete revenue cohort
// @access  Private - Organization members
router.delete('/revenue-cohorts/:id', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.deleteRevenueCohort);

// @route   PATCH /api/horizon/analytics/revenue-cohorts/:id/metrics
// @desc    Update metrics for a revenue cohort
// @access  Private - Organization members
router.patch('/revenue-cohorts/:id/metrics', authorizeOrganizationRole(['owner', 'member']), PredictiveAnalyticsController.updateCohortMetrics);

module.exports = router;