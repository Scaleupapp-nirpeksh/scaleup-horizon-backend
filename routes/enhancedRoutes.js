// routes/enhancedRoutes.js
const express = require('express');
const router = express.Router();

// --- MULTI-TENANCY: Import all necessary middleware ---
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware');

const multer = require('multer');

// Import all services
const { getTransactionCategorizer } = require('../services/transactionCategorizer');
const { BankSyncService, BankTransaction } = require('../services/bankSyncService');
const { CustomKPIService, CustomKPI } = require('../services/customKpiService');
const { getRecurringTransactionService, RecurringTransaction } = require('../services/recurringTransactionService');
const { getAdvancedMLService } = require('../services/advancedMLService');

// Configure multer for CSV uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// --- MULTI-TENANCY: Apply global protection and require an active organization for all routes ---
router.use(protect);
router.use(requireActiveOrganization);

// =====================================================
// 1. TRANSACTION CATEGORIZATION ROUTES
// =====================================================

// Auto-categorize a single transaction
router.post('/transactions/categorize', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const { description, amount, vendor } = req.body;
            
            if (!description || amount === undefined) {
                return res.status(400).json({ msg: 'Description and amount are required' });
            }
            
            const categorizer = await getTransactionCategorizer();
            const result = await categorizer.categorizeTransaction(description, amount, vendor);
            
            res.json(result);
        } catch (error) {
            console.error('Categorization error:', error);
            res.status(500).json({ msg: 'Failed to categorize transaction' });
        }
    }
);

// Bulk categorize transactions
router.post('/transactions/bulk-categorize', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const { transactions } = req.body;
            
            if (!transactions || !Array.isArray(transactions)) {
                return res.status(400).json({ msg: 'Transactions array is required' });
            }
            
            const categorizer = await getTransactionCategorizer();
            const results = await categorizer.bulkCategorize(transactions);
            
            res.json({ results });
        } catch (error) {
            console.error('Bulk categorization error:', error);
            res.status(500).json({ msg: 'Failed to categorize transactions' });
        }
    }
);

// Train model with correction
router.post('/transactions/:id/correct-category', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const { correctCategory } = req.body;
            const mongoose = require('mongoose');
            const Expense = mongoose.model('Expense');
            
            // --- MULTI-TENANCY: Find expense within organization ---
            const expense = await Expense.findOne({ 
                _id: req.params.id,
                organization: req.organization._id 
            });
            
            if (!expense) {
                return res.status(404).json({ msg: 'Transaction not found' });
            }
            
            const categorizer = await getTransactionCategorizer();
            await categorizer.learnFromCorrection(
                expense._id,
                expense.description,
                expense.vendor,
                correctCategory
            );
            
            expense.category = correctCategory;
            await expense.save();
            
            res.json({ msg: 'Category updated and model trained', expense });
        } catch (error) {
            console.error('Category correction error:', error);
            res.status(500).json({ msg: 'Failed to update category' });
        }
    }
);

// Get categorization insights
router.get('/transactions/categorization-insights', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const categorizer = await getTransactionCategorizer();
            // --- MULTI-TENANCY: Pass organization context to service ---
            const insights = await categorizer.getCategoryInsights(req.organization._id);
            
            res.json(insights);
        } catch (error) {
            console.error('Error fetching insights:', error);
            res.status(500).json({ msg: 'Failed to fetch categorization insights' });
        }
    }
);

// =====================================================
// 2. BANK SYNC ROUTES
// =====================================================

// Import bank statement
router.post('/bank/import', 
    authorizeOrganizationRole(['owner', 'member']),
    upload.single('statement'), 
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ msg: 'No file uploaded' });
            }
            
            const { bankAccountId, bankFormat } = req.body;
            
            if (!bankAccountId || !bankFormat) {
                return res.status(400).json({ msg: 'Bank account ID and format are required' });
            }
            
            const csvData = req.file.buffer.toString('utf-8');
            const bankSync = new BankSyncService();
            
            // --- MULTI-TENANCY: Pass organization and user context ---
            const result = await bankSync.importBankStatement(
                csvData,
                bankAccountId,
                bankFormat,
                req.user._id,
                req.organization._id
            );
            
            res.json(result);
        } catch (error) {
            console.error('Bank import error:', error);
            res.status(500).json({ msg: 'Failed to import bank statement', error: error.message });
        }
    }
);

// Get bank transactions
router.get('/bank/transactions', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const { bankAccountId, startDate, endDate, status } = req.query;
            
            // --- MULTI-TENANCY: Include organization filter ---
            const query = { organization: req.organization._id };
            
            if (bankAccountId) query.bankAccountId = bankAccountId;
            if (status) query.reconciliationStatus = status;
            if (startDate || endDate) {
                query.date = {};
                if (startDate) query.date.$gte = new Date(startDate);
                if (endDate) query.date.$lte = new Date(endDate);
            }
            
            const transactions = await BankTransaction.find(query)
                .populate('bankAccountId', 'accountName bankName')
                .populate('matchedExpenseId')
                .populate('matchedRevenueId')
                .sort({ date: -1 })
                .limit(100);
            
            res.json(transactions);
        } catch (error) {
            console.error('Error fetching bank transactions:', error);
            res.status(500).json({ msg: 'Failed to fetch bank transactions' });
        }
    }
);

// Reconcile transaction
router.post('/bank/transactions/:id/reconcile', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const { matchType, matchId } = req.body;
            
            if (!matchType || (matchType !== 'ignore' && !matchId)) {
                return res.status(400).json({ msg: 'Match type and ID are required' });
            }
            
            const bankSync = new BankSyncService();
            // --- MULTI-TENANCY: Pass organization context ---
            const result = await bankSync.manualReconcile(
                req.params.id, 
                matchType, 
                matchId,
                req.organization._id
            );
            
            res.json(result);
        } catch (error) {
            console.error('Reconciliation error:', error);
            res.status(500).json({ msg: 'Failed to reconcile transaction' });
        }
    }
);

// Get reconciliation summary
router.get('/bank/reconciliation-summary', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const { bankAccountId, startDate, endDate } = req.query;
            
            if (!bankAccountId) {
                return res.status(400).json({ msg: 'Bank account ID is required' });
            }
            
            const bankSync = new BankSyncService();
            // --- MULTI-TENANCY: Pass organization context ---
            const summary = await bankSync.getReconciliationSummary(
                bankAccountId,
                startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : null,
                req.organization._id
            );
            
            res.json(summary);
        } catch (error) {
            console.error('Error fetching reconciliation summary:', error);
            res.status(500).json({ msg: 'Failed to fetch reconciliation summary' });
        }
    }
);

// =====================================================
// 3. CUSTOM KPI ROUTES
// =====================================================

// Create custom KPI
router.post('/kpis/custom', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const kpiService = new CustomKPIService();
            // --- MULTI-TENANCY: Pass organization and user context ---
            const kpi = await kpiService.createKPI(
                req.body, 
                req.user._id,
                req.organization._id
            );
            
            res.status(201).json(kpi);
        } catch (error) {
            console.error('Error creating KPI:', error);
            res.status(500).json({ msg: error.message || 'Failed to create KPI' });
        }
    }
);

// Get all KPIs
router.get('/kpis/custom', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const { category, isPinned } = req.query;
            // --- MULTI-TENANCY: Filter by organization ---
            const query = { 
                organization: req.organization._id, 
                isActive: true 
            };
            
            if (category) query.category = category;
            if (isPinned !== undefined) query.isPinned = isPinned === 'true';
            
            const kpis = await CustomKPI.find(query).sort({ category: 1, displayName: 1 });
            
            res.json(kpis);
        } catch (error) {
            console.error('Error fetching KPIs:', error);
            res.status(500).json({ msg: 'Failed to fetch KPIs' });
        }
    }
);

// Calculate KPI value
router.post('/kpis/custom/:id/calculate', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const kpiService = new CustomKPIService();
            // --- MULTI-TENANCY: Pass organization context ---
            const result = await kpiService.calculateKPIValue(
                req.params.id,
                req.organization._id
            );
            
            res.json(result);
        } catch (error) {
            console.error('Error calculating KPI:', error);
            res.status(500).json({ msg: 'Failed to calculate KPI value' });
        }
    }
);

// Get KPI dashboard
router.get('/kpis/dashboard', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const kpiService = new CustomKPIService();
            // --- MULTI-TENANCY: Pass organization context ---
            const dashboard = await kpiService.getKPIDashboard(req.organization._id);
            
            res.json(dashboard);
        } catch (error) {
            console.error('Error fetching KPI dashboard:', error);
            res.status(500).json({ msg: 'Failed to fetch KPI dashboard' });
        }
    }
);

// Initialize built-in KPIs
router.post('/kpis/initialize-builtin', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const kpiService = new CustomKPIService();
            // --- MULTI-TENANCY: Pass organization and user context ---
            const results = await kpiService.initializeBuiltInKPIs(
                req.user._id,
                req.organization._id
            );
            
            res.json({ msg: 'Built-in KPIs initialized', results });
        } catch (error) {
            console.error('Error initializing built-in KPIs:', error);
            res.status(500).json({ msg: 'Failed to initialize built-in KPIs' });
        }
    }
);

// =====================================================
// 4. RECURRING TRANSACTIONS ROUTES
// =====================================================

// Create recurring transaction
router.post('/recurring-transactions', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const service = await getRecurringTransactionService();
            // --- MULTI-TENANCY: Pass organization and user context ---
            const recurring = await service.createRecurringTransaction(
                req.body, 
                req.user._id,
                req.organization._id
            );
            
            res.status(201).json(recurring);
        } catch (error) {
            console.error('Error creating recurring transaction:', error);
            res.status(500).json({ msg: 'Failed to create recurring transaction' });
        }
    }
);

// Get recurring transactions
router.get('/recurring-transactions', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const { type, isActive, frequency } = req.query;
            // --- MULTI-TENANCY: Filter by organization ---
            const query = { organization: req.organization._id };
            
            if (type) query.type = type;
            if (isActive !== undefined) query.isActive = isActive === 'true';
            if (frequency) query.frequency = frequency;
            
            const transactions = await RecurringTransaction.find(query)
                .sort({ nextDueDate: 1 });
            
            res.json(transactions);
        } catch (error) {
            console.error('Error fetching recurring transactions:', error);
            res.status(500).json({ msg: 'Failed to fetch recurring transactions' });
        }
    }
);

// Get upcoming transactions
router.get('/recurring-transactions/upcoming', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const days = parseInt(req.query.days) || 30;
            const service = await getRecurringTransactionService();
            // --- MULTI-TENANCY: Pass organization context ---
            const upcoming = await service.getUpcomingTransactions(
                req.organization._id, 
                days
            );
            
            res.json(upcoming);
        } catch (error) {
            console.error('Error fetching upcoming transactions:', error);
            res.status(500).json({ msg: 'Failed to fetch upcoming transactions' });
        }
    }
);

// Pause/Resume recurring transaction
router.post('/recurring-transactions/:id/pause', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const service = await getRecurringTransactionService();
            // --- MULTI-TENANCY: Pass organization context ---
            const result = await service.pauseRecurringTransaction(
                req.params.id, 
                req.organization._id
            );
            
            res.json(result);
        } catch (error) {
            console.error('Error pausing recurring transaction:', error);
            res.status(500).json({ msg: 'Failed to pause recurring transaction' });
        }
    }
);

router.post('/recurring-transactions/:id/resume', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const service = await getRecurringTransactionService();
            // --- MULTI-TENANCY: Pass organization context ---
            const result = await service.resumeRecurringTransaction(
                req.params.id, 
                req.organization._id
            );
            
            res.json(result);
        } catch (error) {
            console.error('Error resuming recurring transaction:', error);
            res.status(500).json({ msg: 'Failed to resume recurring transaction' });
        }
    }
);

// Get recurring summary
router.get('/recurring-transactions/summary', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const service = await getRecurringTransactionService();
            // --- MULTI-TENANCY: Pass organization context ---
            const summary = await service.getRecurringSummary(req.organization._id);
            
            res.json(summary);
        } catch (error) {
            console.error('Error fetching recurring summary:', error);
            res.status(500).json({ msg: 'Failed to fetch recurring summary' });
        }
    }
);

// =====================================================
// 5. ML & ANALYTICS ROUTES
// =====================================================

// Predict expenses
router.get('/ml/predict-expenses', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const days = parseInt(req.query.days) || 30;
            const mlService = await getAdvancedMLService();
            // --- MULTI-TENANCY: Pass organization context ---
            const predictions = await mlService.predictExpenses(
                req.organization._id, 
                days
            );
            
            res.json(predictions);
        } catch (error) {
            console.error('Error predicting expenses:', error);
            res.status(500).json({ msg: 'Failed to predict expenses' });
        }
    }
);

// Detect anomalies
router.post('/ml/detect-anomalies', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const { transactions, type = 'expense' } = req.body;
            
            if (!transactions || !Array.isArray(transactions)) {
                return res.status(400).json({ msg: 'Transactions array is required' });
            }
            
            const mlService = await getAdvancedMLService();
            const anomalies = await mlService.detectAnomalies(transactions, type);
            
            res.json(anomalies);
        } catch (error) {
            console.error('Error detecting anomalies:', error);
            res.status(500).json({ msg: 'Failed to detect anomalies' });
        }
    }
);

// Optimize cash flow
router.post('/ml/optimize-cashflow', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const { currentState, constraints } = req.body;
            
            if (!currentState || !constraints) {
                return res.status(400).json({ msg: 'Current state and constraints are required' });
            }
            
            const mlService = await getAdvancedMLService();
            const optimization = await mlService.optimizeCashFlow(currentState, constraints);
            
            res.json(optimization);
        } catch (error) {
            console.error('Error optimizing cash flow:', error);
            res.status(500).json({ msg: 'Failed to optimize cash flow' });
        }
    }
);

// Identify spending patterns
router.get('/ml/spending-patterns', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const mlService = await getAdvancedMLService();
            // --- MULTI-TENANCY: Pass organization context ---
            const patterns = await mlService.identifySpendingPatterns(req.organization._id);
            
            res.json(patterns);
        } catch (error) {
            console.error('Error identifying spending patterns:', error);
            res.status(500).json({ msg: 'Failed to identify spending patterns' });
        }
    }
);

// Train ML models
router.post('/ml/train', 
    authorizeOrganizationRole(['owner', 'member']), 
    async (req, res) => {
        try {
            const { model } = req.body;
            const mlService = await getAdvancedMLService();
            
            switch (model) {
                case 'expense_predictor':
                    // --- MULTI-TENANCY: Pass organization context ---
                    await mlService.trainExpensePredictor(req.organization._id);
                    break;
                default:
                    return res.status(400).json({ msg: 'Invalid model specified' });
            }
            
            res.json({ msg: `${model} trained successfully` });
        } catch (error) {
            console.error('Error training model:', error);
            res.status(500).json({ msg: 'Failed to train model' });
        }
    }
);

module.exports = router;