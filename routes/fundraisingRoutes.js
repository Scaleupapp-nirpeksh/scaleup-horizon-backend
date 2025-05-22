// routes/fundraisingRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware'); // Assuming 'authorize' is for role-specific, not needed for all founder actions
const fundraisingController = require('../controllers/fundraisingController');

// Apply protect middleware to all routes in this file, ensuring only authenticated founders can access
router.use(protect);

// --- Round Management ---
router.post('/rounds', fundraisingController.createRound);
router.get('/rounds', fundraisingController.getRounds);
router.get('/rounds/:id', fundraisingController.getRoundById);
router.put('/rounds/:id', fundraisingController.updateRound);
router.delete('/rounds/:id', fundraisingController.deleteRound);

// --- Investor Tracking ---
// Create a new investor (associated with a round)
router.post('/investors', fundraisingController.addInvestor);
// Get all investors (optionally filter by roundId)
router.get('/investors', fundraisingController.getInvestors);
// Get a specific investor by ID
router.get('/investors/:id', fundraisingController.getInvestorById);
// Update an investor
router.put('/investors/:id', fundraisingController.updateInvestor);
// Delete an investor
router.delete('/investors/:id', fundraisingController.deleteInvestor);

// --- Tranche Tracking (Nested under Investors) ---
// Add a tranche to a specific investor
router.post('/investors/:investorId/tranches', fundraisingController.addTranche);
// Update a specific tranche for an investor
router.put('/investors/:investorId/tranches/:trancheId', fundraisingController.updateTranche);
// Delete a specific tranche for an investor
router.delete('/investors/:investorId/tranches/:trancheId', fundraisingController.deleteTranche);

// --- Cap Table Management ---
// Add an entry to the cap table
router.post('/captable', fundraisingController.addCapTableEntry);
// Get the cap table summary (or all entries for MVP)
router.get('/captable', fundraisingController.getCapTableSummary);
// Get a specific cap table entry by ID
router.get('/captable/:id', fundraisingController.getCapTableEntryById);
// Update a cap table entry
router.put('/captable/:id', fundraisingController.updateCapTableEntry);
// Delete a cap table entry
router.delete('/captable/:id', fundraisingController.deleteCapTableEntry);

module.exports = router;
