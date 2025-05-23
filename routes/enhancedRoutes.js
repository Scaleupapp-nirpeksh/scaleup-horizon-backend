// routes/enhancedRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
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

// Apply authentication to all routes
router.use(protect);

// =====================================================
// 1. TRANSACTION CATEGORIZATION ROUTES
// =====================================================

// Auto-categorize a single transaction
router.post('/transactions/categorize', async (req, res) => {
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
});

// Bulk categorize transactions
router.post('/transactions/bulk-categorize', async (req, res) => {
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
});

// Train model with correction
router.post('/transactions/:id/correct-category', async (req, res) => {
    try {
        const { correctCategory } = req.body;
        const Expense = mongoose.model('Expense');
        const expense = await Expense.findById(req.params.id);
        
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
});

// Get categorization insights
router.get('/transactions/categorization-insights', async (req, res) => {
    try {
        const categorizer = await getTransactionCategorizer();
        const insights = await categorizer.getCategoryInsights();
        
        res.json(insights);
    } catch (error) {
        console.error('Error fetching insights:', error);
        res.status(500).json({ msg: 'Failed to fetch categorization insights' });
    }
});

// =====================================================
// 2. BANK SYNC ROUTES
// =====================================================

// Import bank statement
router.post('/bank/import', upload.single('statement'), async (req, res) => {
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
        
        const result = await bankSync.importBankStatement(
            csvData,
            bankAccountId,
            bankFormat,
            req.horizonUser.id
        );
        
        res.json(result);
    } catch (error) {
        console.error('Bank import error:', error);
        res.status(500).json({ msg: 'Failed to import bank statement', error: error.message });
    }
});

// Get bank transactions
router.get('/bank/transactions', async (req, res) => {
    try {
        const { bankAccountId, startDate, endDate, status } = req.query;
        const query = {};
        
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
});

// Reconcile transaction
router.post('/bank/transactions/:id/reconcile', async (req, res) => {
    try {
        const { matchType, matchId } = req.body;
        
        if (!matchType || (matchType !== 'ignore' && !matchId)) {
            return res.status(400).json({ msg: 'Match type and ID are required' });
        }
        
        const bankSync = new BankSyncService();
        const result = await bankSync.manualReconcile(req.params.id, matchType, matchId);
        
        res.json(result);
    } catch (error) {
        console.error('Reconciliation error:', error);
        res.status(500).json({ msg: 'Failed to reconcile transaction' });
    }
});

// Get reconciliation summary
router.get('/bank/reconciliation-summary', async (req, res) => {
    try {
        const { bankAccountId, startDate, endDate } = req.query;
        
        if (!bankAccountId) {
            return res.status(400).json({ msg: 'Bank account ID is required' });
        }
        
        const bankSync = new BankSyncService();
        const summary = await bankSync.getReconciliationSummary(
            bankAccountId,
            startDate && endDate ? { start: new Date(startDate), end: new Date(endDate) } : null
        );
        
        res.json(summary);
    } catch (error) {
        console.error('Error fetching reconciliation summary:', error);
        res.status(500).json({ msg: 'Failed to fetch reconciliation summary' });
    }
});

// =====================================================
// 3. CUSTOM KPI ROUTES
// =====================================================

// Create custom KPI
router.post('/kpis/custom', async (req, res) => {
    try {
        const kpiService = new CustomKPIService();
        const kpi = await kpiService.createKPI(req.body, req.horizonUser.id);
        
        res.status(201).json(kpi);
    } catch (error) {
        console.error('Error creating KPI:', error);
        res.status(500).json({ msg: error.message || 'Failed to create KPI' });
    }
});

// Get all KPIs
router.get('/kpis/custom', async (req, res) => {
    try {
        const { category, isPinned } = req.query;
        const query = { createdBy: req.horizonUser.id, isActive: true };
        
        if (category) query.category = category;
        if (isPinned !== undefined) query.isPinned = isPinned === 'true';
        
        const kpis = await CustomKPI.find(query).sort({ category: 1, displayName: 1 });
        
        res.json(kpis);
    } catch (error) {
        console.error('Error fetching KPIs:', error);
        res.status(500).json({ msg: 'Failed to fetch KPIs' });
    }
});

// Calculate KPI value
router.post('/kpis/custom/:id/calculate', async (req, res) => {
    try {
        const kpiService = new CustomKPIService();
        const result = await kpiService.calculateKPIValue(req.params.id);
        
        res.json(result);
    } catch (error) {
        console.error('Error calculating KPI:', error);
        res.status(500).json({ msg: 'Failed to calculate KPI value' });
    }
});

// Get KPI dashboard
router.get('/kpis/dashboard', async (req, res) => {
    try {
        const kpiService = new CustomKPIService();
        const dashboard = await kpiService.getKPIDashboard(req.horizonUser.id);
        
        res.json(dashboard);
    } catch (error) {
        console.error('Error fetching KPI dashboard:', error);
        res.status(500).json({ msg: 'Failed to fetch KPI dashboard' });
    }
});

// Initialize built-in KPIs
router.post('/kpis/initialize-builtin', async (req, res) => {
    try {
        const kpiService = new CustomKPIService();
        const results = await kpiService.initializeBuiltInKPIs(req.horizonUser.id);
        
        res.json({ msg: 'Built-in KPIs initialized', results });
    } catch (error) {
        console.error('Error initializing built-in KPIs:', error);
        res.status(500).json({ msg: 'Failed to initialize built-in KPIs' });
    }
});

// =====================================================
// 4. RECURRING TRANSACTIONS ROUTES
// =====================================================

// Create recurring transaction
router.post('/recurring-transactions', async (req, res) => {
    try {
        const service = await getRecurringTransactionService();
        const recurring = await service.createRecurringTransaction(req.body, req.horizonUser.id);
        
        res.status(201).json(recurring);
    } catch (error) {
        console.error('Error creating recurring transaction:', error);
        res.status(500).json({ msg: 'Failed to create recurring transaction' });
    }
});

// Get recurring transactions
router.get('/recurring-transactions', async (req, res) => {
    try {
        const { type, isActive, frequency } = req.query;
        const query = { createdBy: req.horizonUser.id };
        
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
});

// Get upcoming transactions
router.get('/recurring-transactions/upcoming', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const service = await getRecurringTransactionService();
        const upcoming = await service.getUpcomingTransactions(req.horizonUser.id, days);
        
        res.json(upcoming);
    } catch (error) {
        console.error('Error fetching upcoming transactions:', error);
        res.status(500).json({ msg: 'Failed to fetch upcoming transactions' });
    }
});

// Pause/Resume recurring transaction
router.post('/recurring-transactions/:id/pause', async (req, res) => {
    try {
        const service = await getRecurringTransactionService();
        const result = await service.pauseRecurringTransaction(req.params.id, req.horizonUser.id);
        
        res.json(result);
    } catch (error) {
        console.error('Error pausing recurring transaction:', error);
        res.status(500).json({ msg: 'Failed to pause recurring transaction' });
    }
});

router.post('/recurring-transactions/:id/resume', async (req, res) => {
    try {
        const service = await getRecurringTransactionService();
        const result = await service.resumeRecurringTransaction(req.params.id, req.horizonUser.id);
        
        res.json(result);
    } catch (error) {
        console.error('Error resuming recurring transaction:', error);
        res.status(500).json({ msg: 'Failed to resume recurring transaction' });
    }
});

// Get recurring summary
router.get('/recurring-transactions/summary', async (req, res) => {
    try {
        const service = await getRecurringTransactionService();
        const summary = await service.getRecurringSummary(req.horizonUser.id);
        
        res.json(summary);
    } catch (error) {
        console.error('Error fetching recurring summary:', error);
        res.status(500).json({ msg: 'Failed to fetch recurring summary' });
    }
});



// =====================================================
// 5. ML & ANALYTICS ROUTES
// =====================================================

// Predict expenses
router.get('/ml/predict-expenses', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const mlService = await getAdvancedMLService();
        const predictions = await mlService.predictExpenses(req.horizonUser.id, days);
        
        res.json(predictions);
    } catch (error) {
        console.error('Error predicting expenses:', error);
        res.status(500).json({ msg: 'Failed to predict expenses' });
    }
});

// Detect anomalies
router.post('/ml/detect-anomalies', async (req, res) => {
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
});

// Optimize cash flow
router.post('/ml/optimize-cashflow', async (req, res) => {
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
});

// Identify spending patterns
router.get('/ml/spending-patterns', async (req, res) => {
    try {
        const mlService = await getAdvancedMLService();
        const patterns = await mlService.identifySpendingPatterns(req.horizonUser.id);
        
        res.json(patterns);
    } catch (error) {
        console.error('Error identifying spending patterns:', error);
        res.status(500).json({ msg: 'Failed to identify spending patterns' });
    }
});

// Train ML models
router.post('/ml/train', async (req, res) => {
    try {
        const { model } = req.body;
        const mlService = await getAdvancedMLService();
        
        switch (model) {
            case 'expense_predictor':
                await mlService.trainExpensePredictor(req.horizonUser.id);
                break;
            default:
                return res.status(400).json({ msg: 'Invalid model specified' });
        }
        
        res.json({ msg: `${model} trained successfully` });
    } catch (error) {
        console.error('Error training model:', error);
        res.status(500).json({ msg: 'Failed to train model' });
    }
});

module.exports = router;