// routes/fundraisingRoutes.js
// Enhanced fundraising routes with comprehensive calculation and dashboard endpoints
// Handles rounds, investors, tranches, cap table, and advanced fundraising analytics
const express = require('express');
const router = express.Router();

// --- MULTI-TENANCY: Import all necessary middleware ---
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware');
const fundraisingController = require('../controllers/fundraisingController');

// --- MULTI-TENANCY: Apply global protection and require an active organization for all routes ---
router.use(protect);
router.use(requireActiveOrganization);

// =====================================================
// ENHANCED DASHBOARD & ANALYTICS ENDPOINTS
// =====================================================

/**
 * @desc    Get comprehensive fundraising dashboard with calculations
 * @route   GET /api/horizon/fundraising/dashboard
 * @access  Private (owner, member)
 * @returns Dashboard with round stats, investor metrics, cap table summary
 */
router.get('/dashboard', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.getFundraisingDashboard
);

// =====================================================
// ROUND MANAGEMENT - ENHANCED WITH CALCULATIONS
// =====================================================

/**
 * @desc    Create a new fundraising round with automatic valuation calculations
 * @route   POST /api/horizon/fundraising/rounds
 * @access  Private (owner, member)
 * @body    { name, targetAmount, equityPercentageOffered, existingSharesPreRound, ... }
 */
router.post('/rounds', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.createRound
);

/**
 * @desc    Get all fundraising rounds with enhanced progress data
 * @route   GET /api/horizon/fundraising/rounds
 * @access  Private (owner, member)
 */
router.get('/rounds', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.getRounds
);

/**
 * @desc    Get single round with comprehensive data and related investors
 * @route   GET /api/horizon/fundraising/rounds/:id
 * @access  Private (owner, member)
 */
router.get('/rounds/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.getRoundById
);

/**
 * @desc    Update round with potential recalculation of valuations
 * @route   PUT /api/horizon/fundraising/rounds/:id
 * @access  Private (owner, member)
 */
router.put('/rounds/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.updateRound
);

/**
 * @desc    Delete round with comprehensive cleanup
 * @route   DELETE /api/horizon/fundraising/rounds/:id
 * @access  Private (owner, member)
 */
router.delete('/rounds/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.deleteRound
);

// =====================================================
// ROUND CALCULATION & PREVIEW ENDPOINTS
// =====================================================

/**
 * @desc    Preview investment impact before actual investment
 * @route   POST /api/horizon/fundraising/rounds/:roundId/preview-investment
 * @access  Private (owner, member)
 * @body    { investmentAmount }
 * @returns { sharesAllocated, equityPercentage, newTotalRaised, etc. }
 */
router.post('/rounds/:roundId/preview-investment', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.previewInvestmentImpact
);

/**
 * @desc    Manually trigger round metrics recalculation
 * @route   POST /api/horizon/fundraising/rounds/:roundId/recalculate
 * @access  Private (owner, member)
 * @returns Updated round metrics and calculation results
 */
router.post('/rounds/:roundId/recalculate', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.recalculateRoundMetrics
);

// =====================================================
// INVESTOR MANAGEMENT - ENHANCED WITH EQUITY CALCULATIONS
// =====================================================

/**
 * @desc    Add investor with automatic equity allocation calculation
 * @route   POST /api/horizon/fundraising/investors
 * @access  Private (owner, member)
 * @body    { name, totalCommittedAmount, roundId, investmentVehicle, ... }
 */
router.post('/investors', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.addInvestor
);

/**
 * @desc    Get all investors with enhanced investment summary data
 * @route   GET /api/horizon/fundraising/investors
 * @access  Private (owner, member)
 * @query   ?roundId=<id> - Optional filter by round
 */
router.get('/investors', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.getInvestors
);

/**
 * @desc    Get single investor with comprehensive investment data
 * @route   GET /api/horizon/fundraising/investors/:id
 * @access  Private (owner, member)
 */
router.get('/investors/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.getInvestorById
);

/**
 * @desc    Update investor with potential equity recalculation
 * @route   PUT /api/horizon/fundraising/investors/:id
 * @access  Private (owner, member)
 */
router.put('/investors/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.updateInvestor
);

/**
 * @desc    Delete investor with comprehensive cleanup of cap table and round data
 * @route   DELETE /api/horizon/fundraising/investors/:id
 * @access  Private (owner, member)
 */
router.delete('/investors/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.deleteInvestor
);

// =====================================================
// TRANCHE MANAGEMENT - ENHANCED WITH PAYMENT PROCESSING
// =====================================================

/**
 * @desc    Add tranche to investor with share allocation calculation
 * @route   POST /api/horizon/fundraising/investors/:investorId/tranches
 * @access  Private (owner, member)
 * @body    { trancheNumber, agreedAmount, receivedAmount, paymentMethod, ... }
 */
router.post('/investors/:investorId/tranches', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.addTranche
);

/**
 * @desc    Update tranche with payment processing and equity allocation
 * @route   PUT /api/horizon/fundraising/investors/:investorId/tranches/:trancheId
 * @access  Private (owner, member)
 * @body    { receivedAmount, paymentMethod, transactionReference, ... }
 */
router.put('/investors/:investorId/tranches/:trancheId', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.updateTranche
);

/**
 * @desc    Delete tranche with payment and equity cleanup
 * @route   DELETE /api/horizon/fundraising/investors/:investorId/tranches/:trancheId
 * @access  Private (owner, member)
 */
router.delete('/investors/:investorId/tranches/:trancheId', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.deleteTranche
);

// =====================================================
// CAP TABLE MANAGEMENT - ENHANCED WITH VALUATION TRACKING
// =====================================================

/**
 * @desc    Add cap table entry with automatic calculations
 * @route   POST /api/horizon/fundraising/captable
 * @access  Private (owner, member)
 * @body    { shareholderName, shareholderType, numberOfShares, securityType, ... }
 */
router.post('/captable', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.addCapTableEntry
);

/**
 * @desc    Get enhanced cap table summary with statistics and equity percentages
 * @route   GET /api/horizon/fundraising/captable
 * @access  Private (owner, member)
 * @returns Enhanced entries with formattedInfo, ROI calculations, and summary stats
 */
router.get('/captable', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.getCapTableSummary
);

/**
 * @desc    Get single cap table entry with enhanced data
 * @route   GET /api/horizon/fundraising/captable/:id
 * @access  Private (owner, member)
 */
router.get('/captable/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.getCapTableEntryById
);

/**
 * @desc    Update cap table entry with value recalculation
 * @route   PUT /api/horizon/fundraising/captable/:id
 * @access  Private (owner, member)
 */
router.put('/captable/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.updateCapTableEntry
);

/**
 * @desc    Delete cap table entry with equity percentage adjustment
 * @route   DELETE /api/horizon/fundraising/captable/:id
 * @access  Private (owner, member)
 */
router.delete('/captable/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    fundraisingController.deleteCapTableEntry
);

// =====================================================
// ESOP MANAGEMENT (if needed in fundraising context)
// =====================================================

/**
 * @desc    Get ESOP grants related to fundraising (for cap table integration)
 * @route   GET /api/horizon/fundraising/esop-grants
 * @access  Private (owner, member)
 * @note    This might redirect to advanced features routes or be implemented here
 */
router.get('/esop-grants', 
    authorizeOrganizationRole(['owner', 'member']), 
    (req, res) => {
        // Redirect to advanced features ESOP endpoint or implement here
        res.status(302).json({ 
            msg: 'ESOP grants managed under advanced features',
            redirect: '/api/horizon/advanced/esop-grants'
        });
    }
);

// =====================================================
// INVESTOR CONVERSION & ADVANCED OPERATIONS
// =====================================================

/**
 * @desc    Convert SAFE or Convertible Note investor to equity
 * @route   POST /api/horizon/fundraising/investors/:investorId/convert
 * @access  Private (owner, member)
 * @body    { conversionRoundId, conversionPrice }
 * @note    This might be implemented in future versions
 */
router.post('/investors/:investorId/convert', 
    authorizeOrganizationRole(['owner', 'member']), 
    (req, res) => {
        res.status(501).json({ 
            msg: 'Investor conversion feature coming soon',
            feature: 'SAFE/Note to Equity Conversion'
        });
    }
);

/**
 * @desc    Bulk update investor statuses
 * @route   POST /api/horizon/fundraising/investors/bulk-update
 * @access  Private (owner, member)
 * @body    { investorIds: [], newStatus, notes }
 * @note    This might be implemented in future versions
 */
router.post('/investors/bulk-update', 
    authorizeOrganizationRole(['owner', 'member']), 
    (req, res) => {
        res.status(501).json({ 
            msg: 'Bulk investor update feature coming soon',
            feature: 'Bulk Status Updates'
        });
    }
);

// =====================================================
// REPORTS & EXPORTS
// =====================================================

/**
 * @desc    Export cap table as CSV/Excel
 * @route   GET /api/horizon/fundraising/captable/export
 * @access  Private (owner, member)
 * @query   ?format=csv|excel
 * @note    This might be implemented in future versions
 */
router.get('/captable/export', 
    authorizeOrganizationRole(['owner', 'member']), 
    (req, res) => {
        res.status(501).json({ 
            msg: 'Cap table export feature coming soon',
            feature: 'CSV/Excel Export'
        });
    }
);

/**
 * @desc    Generate investor update report
 * @route   POST /api/horizon/fundraising/reports/investor-update
 * @access  Private (owner, member)
 * @body    { roundId, includeMetrics, templateType }
 * @note    This might be implemented in future versions or redirect to investor-reports
 */
router.post('/reports/investor-update', 
    authorizeOrganizationRole(['owner', 'member']), 
    (req, res) => {
        res.status(302).json({ 
            msg: 'Investor reports managed under dedicated reports module',
            redirect: '/api/horizon/investor-reports'
        });
    }
);

// =====================================================
// AUDIT & HISTORY TRACKING
// =====================================================

/**
 * @desc    Get audit trail for a specific round
 * @route   GET /api/horizon/fundraising/rounds/:roundId/audit
 * @access  Private (owner, member)
 * @note    This might be implemented in future versions
 */
router.get('/rounds/:roundId/audit', 
    authorizeOrganizationRole(['owner', 'member']), 
    (req, res) => {
        res.status(501).json({ 
            msg: 'Audit trail feature coming soon',
            feature: 'Round Audit History'
        });
    }
);

/**
 * @desc    Get payment history for all investors in organization
 * @route   GET /api/horizon/fundraising/payments/history
 * @access  Private (owner, member)
 * @query   ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&investorId=<id>
 * @note    This might be implemented in future versions
 */
router.get('/payments/history', 
    authorizeOrganizationRole(['owner', 'member']), 
    (req, res) => {
        res.status(501).json({ 
            msg: 'Payment history feature coming soon',
            feature: 'Payment Audit Trail'
        });
    }
);

// =====================================================
// ERROR HANDLING FOR MALFORMED ROUTES
// =====================================================

/**
 * Handle malformed or unrecognized fundraising routes
 */
router.use('*', (req, res) => {
    res.status(404).json({
        msg: 'Fundraising endpoint not found',
        path: req.originalUrl,
        availableEndpoints: {
            dashboard: 'GET /api/horizon/fundraising/dashboard',
            rounds: 'GET/POST /api/horizon/fundraising/rounds',
            investors: 'GET/POST /api/horizon/fundraising/investors',
            capTable: 'GET/POST /api/horizon/fundraising/captable',
            tranches: 'POST/PUT/DELETE /api/horizon/fundraising/investors/:id/tranches'
        }
    });
});

module.exports = router;