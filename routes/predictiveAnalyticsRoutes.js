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

// @route   GET /api/horizon/analytics/fundraising-readiness
// @desc    Analyze current fundraising readiness
// @access  Private
// Note: PredictiveAnalyticsController.analyzeCurrentFundraisingReadiness might need to be adapted
// to send a response directly (e.g., res.json(data)) or a new wrapper method created.
router.get('/fundraising-readiness', async (req, res) => {
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
// @access  Private
// Example Query: /market-comparables?roundType=Seed&targetSize=1000000
// Note: PredictiveAnalyticsController.getMarketComparables might need to be adapted
// to take req, res and parse query params or a new wrapper method created.
router.get('/market-comparables', async (req, res) => {
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
// @access  Private
router.post('/cash-flow-forecasts', PredictiveAnalyticsController.createCashFlowForecast);

// @route   GET /api/horizon/analytics/cash-flow-data/historical
// @desc    Get historical cash flow data
// @access  Private
// Note: PredictiveAnalyticsController.getHistoricalCashFlowData might need to be adapted
// to send a response directly or a new wrapper method created.
router.get('/cash-flow-data/historical', async (req, res) => {
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
// @access  Private
// Note: PredictiveAnalyticsController.getCurrentCashPosition might need to be adapted
// to send a response directly or a new wrapper method created.
router.get('/cash-position/current', async (req, res) => {
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


// --- Fundraising Predictions (Complete CRUD) ---
// @route   GET /api/horizon/analytics/fundraising-predictions
// @desc    Get all fundraising predictions
// @access  Private
router.get('/fundraising-predictions', PredictiveAnalyticsController.getFundraisingPredictions);

// @route   GET /api/horizon/analytics/fundraising-predictions/:id
// @desc    Get single fundraising prediction
// @access  Private
router.get('/fundraising-predictions/:id', PredictiveAnalyticsController.getFundraisingPredictionById);

// @route   DELETE /api/horizon/analytics/fundraising-predictions/:id
// @desc    Delete fundraising prediction
// @access  Private
router.delete('/fundraising-predictions/:id', PredictiveAnalyticsController.deleteFundraisingPrediction);

// --- Cash Flow Forecasts (Complete CRUD) ---
// @route   GET /api/horizon/analytics/cash-flow-forecasts
// @desc    Get all cash flow forecasts
// @access  Private
router.get('/cash-flow-forecasts', PredictiveAnalyticsController.getCashFlowForecasts);

// @route   GET /api/horizon/analytics/cash-flow-forecasts/:id
// @desc    Get single cash flow forecast
// @access  Private
router.get('/cash-flow-forecasts/:id', PredictiveAnalyticsController.getCashFlowForecastById);

// @route   DELETE /api/horizon/analytics/cash-flow-forecasts/:id
// @desc    Delete cash flow forecast
// @access  Private
router.delete('/cash-flow-forecasts/:id', PredictiveAnalyticsController.deleteCashFlowForecast);

// --- Revenue Cohorts (Complete CRUD) ---
// @route   GET /api/horizon/analytics/revenue-cohorts
// @desc    Get all revenue cohorts
// @access  Private
router.get('/revenue-cohorts', PredictiveAnalyticsController.getRevenueCohorts);

// @route   GET /api/horizon/analytics/revenue-cohorts/:id
// @desc    Get single revenue cohort
// @access  Private
router.get('/revenue-cohorts/:id', PredictiveAnalyticsController.getRevenueCohortById);

// @route   DELETE /api/horizon/analytics/revenue-cohorts/:id
// @desc    Delete revenue cohort
// @access  Private
router.delete('/revenue-cohorts/:id', PredictiveAnalyticsController.deleteRevenueCohort);



module.exports = router;