// routes/financialRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const financialController = require('../controllers/financialController');
const { getTransactionCategorizer } = require('../services/transactionCategorizer');

// Apply protect middleware to all routes in this file
router.use(protect);

// --- Bank Account Management (Module 2.1) ---
// @route   POST /api/horizon/financials/bank-accounts
// @desc    Add a new bank account record
// @access  Private (Founders)
router.post('/bank-accounts', financialController.addBankAccount);

// @route   GET /api/horizon/financials/bank-accounts
// @desc    Get all bank account records
// @access  Private (Founders)
router.get('/bank-accounts', financialController.getBankAccounts);

// @route   GET /api/horizon/financials/bank-accounts/:id
// @desc    Get a single bank account by ID
// @access  Private (Founders)
router.get('/bank-accounts/:id', financialController.getBankAccountById);

// @route   PUT /api/horizon/financials/bank-accounts/:id
// @desc    Update a bank account record (e.g., current balance)
// @access  Private (Founders)
router.put('/bank-accounts/:id', financialController.updateBankAccount);

// @route   DELETE /api/horizon/financials/bank-accounts/:id
// @desc    Delete a bank account record
// @access  Private (Founders)
router.delete('/bank-accounts/:id', financialController.deleteBankAccount);


// --- Expense Tracking (Module 2.2) ---
// @route   POST /api/horizon/financials/expenses
// @desc    Add a new expense record
// @access  Private (Founders)
router.post('/expenses', financialController.addExpense);

// @route   GET /api/horizon/financials/expenses
// @desc    Get all expense records (with optional filtering by date, category)
// @access  Private (Founders)
router.get('/expenses', financialController.getExpenses);

// @route   GET /api/horizon/financials/expenses/:id
// @desc    Get a single expense by ID
// @access  Private (Founders)
router.get('/expenses/:id', financialController.getExpenseById);

// @route   PUT /api/horizon/financials/expenses/:id
// @desc    Update an expense record
// @access  Private (Founders)
router.put('/expenses/:id', financialController.updateExpense);

// @route   DELETE /api/horizon/financials/expenses/:id
// @desc    Delete an expense record
// @access  Private (Founders)
router.delete('/expenses/:id', financialController.deleteExpense);


// --- Revenue Tracking (Module 2.3) ---
// @route   POST /api/horizon/financials/revenue
// @desc    Add a new revenue record
// @access  Private (Founders)
router.post('/revenue', financialController.addRevenue);

// @route   GET /api/horizon/financials/revenue
// @desc    Get all revenue records (with optional filtering by date, source)
// @access  Private (Founders)
router.get('/revenue', financialController.getRevenueEntries);

// @route   GET /api/horizon/financials/revenue/:id
// @desc    Get a single revenue entry by ID
// @access  Private (Founders)
router.get('/revenue/:id', financialController.getRevenueEntryById);

// @route   PUT /api/horizon/financials/revenue/:id
// @desc    Update a revenue record
// @access  Private (Founders)
router.put('/revenue/:id', financialController.updateRevenueEntry);

// @route   DELETE /api/horizon/financials/revenue/:id
// @desc    Delete a revenue record
// @access  Private (Founders)
router.delete('/revenue/:id', financialController.deleteRevenueEntry);


// --- Fund Utilization & Overview (Module 2.1 & 2.4) ---
// @route   GET /api/horizon/financials/overview
// @desc    Get financial overview (total funds, balances, burn rate, runway)
// @access  Private (Founders)
router.get('/overview', financialController.getFinancialOverview);

// @route   GET /api/horizon/financials/fund-utilization
// @desc    Get fund utilization report (expenses by category)
// @access  Private (Founders)
router.get('/fund-utilization', financialController.getFundUtilizationReport);


router.post('/expenses/auto-categorize', async (req, res) => {
    try {
        const { description, amount, vendor } = req.body;
        
        const categorizer = await getTransactionCategorizer();
        const result = await categorizer.categorizeTransaction(
            description,
            amount,
            vendor
        );
        
        res.json(result);
    } catch (error) {
        console.error('Categorization error:', error);
        res.status(500).json({ error: 'Failed to categorize transaction' });
    }
});

router.post('/expenses/bulk-categorize', async (req, res) => {
    try {
        const { transactions } = req.body;
        
        const categorizer = await getTransactionCategorizer();
        const results = await categorizer.bulkCategorize(transactions);
        
        res.json({ results });
    } catch (error) {
        console.error('Bulk categorization error:', error);
        res.status(500).json({ error: 'Failed to categorize transactions' });
    }
});

router.post('/expenses/:id/correct-category', async (req, res) => {
    try {
        const { correctCategory } = req.body;
        const expense = await Expense.findById(req.params.id);
        
        if (!expense) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        
        const categorizer = await getTransactionCategorizer();
        await categorizer.learnFromCorrection(
            expense._id,
            expense.description,
            expense.vendor,
            correctCategory
        );
        
        // Update the expense
        expense.category = correctCategory;
        await expense.save();
        
        res.json({ message: 'Category updated and model trained' });
    } catch (error) {
        console.error('Category correction error:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

module.exports = router;
