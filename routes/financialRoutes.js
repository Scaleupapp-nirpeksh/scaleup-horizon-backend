// routes/financialRoutes.js
const express = require('express');
const router = express.Router();
// --- MULTI-TENANCY: Import all necessary middleware ---
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware'); // Ensure path is correct
const financialController = require('../controllers/financialController'); // Ensure this points to the multi-tenancy updated controller
const { getTransactionCategorizer } = require('../services/transactionCategorizer'); // Preserved
const Expense = require('../models/expenseModel'); // Preserved for the :id/correct-category route

// --- MULTI-TENANCY: Apply global protection and require an active organization for all routes in this file ---
router.use(protect); // Ensures user is authenticated
router.use(requireActiveOrganization); // Ensures user has an active organization context

// --- Bank Account Management (Module 2.1) ---
// Assuming 'owner' and 'member' can manage bank accounts
router.post('/bank-accounts', authorizeOrganizationRole(['owner', 'member']), financialController.addBankAccount);
router.get('/bank-accounts', authorizeOrganizationRole(['owner', 'member']), financialController.getBankAccounts);
router.get('/bank-accounts/:id', authorizeOrganizationRole(['owner', 'member']), financialController.getBankAccountById);
router.put('/bank-accounts/:id', authorizeOrganizationRole(['owner', 'member']), financialController.updateBankAccount);
router.delete('/bank-accounts/:id', authorizeOrganizationRole(['owner', 'member']), financialController.deleteBankAccount); // Or restrict to 'owner'

// --- Expense Tracking (Module 2.2) ---
// Assuming 'owner' and 'member' can manage expenses
router.post('/expenses', authorizeOrganizationRole(['owner', 'member']), financialController.addExpense);
router.get('/expenses', authorizeOrganizationRole(['owner', 'member']), financialController.getExpenses);
router.get('/expenses/:id', authorizeOrganizationRole(['owner', 'member']), financialController.getExpenseById);
router.put('/expenses/:id', authorizeOrganizationRole(['owner', 'member']), financialController.updateExpense);
router.delete('/expenses/:id', authorizeOrganizationRole(['owner', 'member']), financialController.deleteExpense); // Or restrict to 'owner'

// --- Revenue Tracking (Module 2.3) ---
// Assuming 'owner' and 'member' can manage revenue
router.post('/revenue', authorizeOrganizationRole(['owner', 'member']), financialController.addRevenue);
router.get('/revenue', authorizeOrganizationRole(['owner', 'member']), financialController.getRevenueEntries);
router.get('/revenue/:id', authorizeOrganizationRole(['owner', 'member']), financialController.getRevenueEntryById);
router.put('/revenue/:id', authorizeOrganizationRole(['owner', 'member']), financialController.updateRevenueEntry);
router.delete('/revenue/:id', authorizeOrganizationRole(['owner', 'member']), financialController.deleteRevenueEntry); // Or restrict to 'owner'

// --- Fund Utilization & Overview (Module 2.1 & 2.4) ---
// Assuming 'owner' and 'member' can view overview and reports
router.get('/overview', authorizeOrganizationRole(['owner', 'member']), financialController.getFinancialOverview);
router.get('/fund-utilization', authorizeOrganizationRole(['owner', 'member']), financialController.getFundUtilizationReport);

// --- Transaction Categorization Routes ---
// These utilities operate in the context of an organization's data or potential data.
router.post('/expenses/auto-categorize', authorizeOrganizationRole(['owner', 'member']), async (req, res) => {
    try {
        const { description, amount, vendor } = req.body;
        // The categorizer service itself doesn't need orgId if it's a pure function,
        // but the context of calling it is org-specific.
        const categorizer = await getTransactionCategorizer(); // This service might be initialized once.
        const result = await categorizer.categorizeTransaction(
            description,
            amount,
            vendor
        );
        res.json(result);
    } catch (error) {
        console.error(`Categorization error for org ${req.organization._id}:`, error.message, error.stack);
        res.status(500).json({ error: 'Failed to categorize transaction' });
    }
});

router.post('/expenses/bulk-categorize', authorizeOrganizationRole(['owner', 'member']), async (req, res) => {
    try {
        const { transactions } = req.body; // Array of { description, amount, vendor }
        if (!Array.isArray(transactions) || transactions.length === 0) {
            return res.status(400).json({ error: 'Transactions array is required.' });
        }
        const categorizer = await getTransactionCategorizer();
        const results = await categorizer.bulkCategorize(transactions);
        res.json({ results });
    } catch (error) {
        console.error(`Bulk categorization error for org ${req.organization._id}:`, error.message, error.stack);
        res.status(500).json({ error: 'Failed to categorize transactions' });
    }
});

router.post('/expenses/:id/correct-category', authorizeOrganizationRole(['owner', 'member']), async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        const { correctCategory } = req.body;
        if (!correctCategory) {
            return res.status(400).json({ error: 'Correct category is required.' });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid Expense ID format' });
        }

        // --- MULTI-TENANCY: Ensure expense belongs to the active organization ---
        const expense = await Expense.findOne({ _id: req.params.id, organization: organizationId });
        if (!expense) {
            return res.status(404).json({ error: 'Expense not found within your organization.' });
        }

        const categorizer = await getTransactionCategorizer();
        await categorizer.learnFromCorrection(
            expense._id.toString(), // Pass ID as string if service expects it
            expense.description,
            expense.vendor,
            correctCategory
        );

        expense.category = correctCategory;
        // expense.updatedBy = req.user._id; // If Expense model has updatedBy
        await expense.save();

        res.json({ message: 'Category updated and model trained successfully for this expense.' });
    } catch (error) {
        console.error(`Category correction error for org ${organizationId}, expense ${req.params.id}:`, error.message, error.stack);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

module.exports = router;
