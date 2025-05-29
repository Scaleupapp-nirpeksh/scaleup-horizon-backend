// routes/fundraisingRoutes.js
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

// --- Round Management ---
router.post('/rounds', authorizeOrganizationRole(['owner', 'member']), fundraisingController.createRound);
router.get('/rounds', authorizeOrganizationRole(['owner', 'member']), fundraisingController.getRounds);
router.get('/rounds/:id', authorizeOrganizationRole(['owner', 'member']), fundraisingController.getRoundById);
router.put('/rounds/:id', authorizeOrganizationRole(['owner', 'member']), fundraisingController.updateRound);
router.delete('/rounds/:id', authorizeOrganizationRole(['owner', 'member']), fundraisingController.deleteRound);

// --- Investor Tracking ---
// Create a new investor (associated with a round)
router.post('/investors', authorizeOrganizationRole(['owner', 'member']), fundraisingController.addInvestor);
// Get all investors (optionally filter by roundId)
router.get('/investors', authorizeOrganizationRole(['owner', 'member']), fundraisingController.getInvestors);
// Get a specific investor by ID
router.get('/investors/:id', authorizeOrganizationRole(['owner', 'member']), fundraisingController.getInvestorById);
// Update an investor
router.put('/investors/:id', authorizeOrganizationRole(['owner', 'member']), fundraisingController.updateInvestor);
// Delete an investor
router.delete('/investors/:id', authorizeOrganizationRole(['owner', 'member']), fundraisingController.deleteInvestor);

// --- Tranche Tracking (Nested under Investors) ---
// Add a tranche to a specific investor
router.post('/investors/:investorId/tranches', authorizeOrganizationRole(['owner', 'member']), fundraisingController.addTranche);
// Update a specific tranche for an investor
router.put('/investors/:investorId/tranches/:trancheId', authorizeOrganizationRole(['owner', 'member']), fundraisingController.updateTranche);
// Delete a specific tranche for an investor
router.delete('/investors/:investorId/tranches/:trancheId', authorizeOrganizationRole(['owner', 'member']), fundraisingController.deleteTranche);

// --- Cap Table Management ---
// Add an entry to the cap table
router.post('/captable', authorizeOrganizationRole(['owner', 'member']), fundraisingController.addCapTableEntry);
// Get the cap table summary (or all entries for MVP)
router.get('/captable', authorizeOrganizationRole(['owner', 'member']), fundraisingController.getCapTableSummary);
// Get a specific cap table entry by ID
router.get('/captable/:id', authorizeOrganizationRole(['owner', 'member']), fundraisingController.getCapTableEntryById);
// Update a cap table entry
router.put('/captable/:id', authorizeOrganizationRole(['owner', 'member']), fundraisingController.updateCapTableEntry);
// Delete a cap table entry
router.delete('/captable/:id', authorizeOrganizationRole(['owner', 'member']), fundraisingController.deleteCapTableEntry);

module.exports = router;