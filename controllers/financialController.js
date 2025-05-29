// controllers/financialController.js
const BankAccount = require('../models/bankAccountModel'); // Phase 4 updated model
const Expense = require('../models/expenseModel');       // Phase 4 updated model
const Revenue = require('../models/revenueModel');       // Phase 4 updated model
const Round = require('../models/roundModel');         // Phase 4 updated model
const mongoose = require('mongoose');

// --- Bank Account Management (Module 2.1) ---
// @desc    Add a new bank account for the active organization
// @access  Private (Requires 'owner' or 'member' role)
exports.addBankAccount = async (req, res) => {
    const { accountName, bankName, accountNumber, currentBalance, currency, notes } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request (populated by authMiddleware) ---
    const organizationId = req.organization._id;
    const userId = req.user._id;

    try {
        if (!accountName || !bankName || currentBalance === undefined) {
            return res.status(400).json({ msg: 'Account name, bank name, and current balance are required.' });
        }
        // --- MULTI-TENANCY: Use organization's default currency if not provided ---
        const orgCurrency = req.organization.currency || 'INR';

        const newAccount = new BankAccount({
            organization: organizationId, // Scope to organization
            user: userId,                 // Track creator
            accountName,
            bankName,
            accountNumber,
            currentBalance,
            currency: currency || orgCurrency, // Use provided or organization's default
            notes,
            lastBalanceUpdate: Date.now()
        });
        const account = await newAccount.save();
        res.status(201).json(account);
    } catch (err) {
        console.error('Error adding bank account:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message });
        }
        if (err.code === 11000) {
             return res.status(400).json({ msg: 'A bank account with this name might already exist for your organization.' });
        }
        res.status(500).send('Server Error: Could not add bank account.');
    }
};

// @desc    Get all bank accounts for the active organization
// @access  Private
exports.getBankAccounts = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        // --- MULTI-TENANCY: Filter by organizationId ---
        const accounts = await BankAccount.find({ organization: organizationId }).sort({ accountName: 1 });
        res.json(accounts);
    } catch (err) {
        console.error('Error fetching bank accounts:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch bank accounts.');
    }
};

// @desc    Get a single bank account by ID for the active organization
// @access  Private
exports.getBankAccountById = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Bank Account ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const account = await BankAccount.findOne({ _id: req.params.id, organization: organizationId });
        if (!account) return res.status(404).json({ msg: 'Bank account not found within your organization.' });
        res.json(account);
    } catch (err) {
        console.error('Error fetching bank account by ID:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch bank account.');
    }
};

// @desc    Update a bank account for the active organization
// @access  Private
exports.updateBankAccount = async (req, res) => {
    const { accountName, bankName, accountNumber, currentBalance, currency, notes } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id; // If BankAccount model has an 'updatedBy' field

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Bank Account ID format' });
        }
        // --- MULTI-TENANCY: Find by _id AND organizationId ---
        let account = await BankAccount.findOne({ _id: req.params.id, organization: organizationId });
        if (!account) return res.status(404).json({ msg: 'Bank account not found within your organization.' });

        const updateFields = { lastBalanceUpdate: Date.now() };
        if (accountName !== undefined) updateFields.accountName = accountName;
        if (bankName !== undefined) updateFields.bankName = bankName;
        if (accountNumber !== undefined) updateFields.accountNumber = accountNumber;
        if (currentBalance !== undefined) updateFields.currentBalance = currentBalance;
        if (currency !== undefined) updateFields.currency = currency;
        if (notes !== undefined) updateFields.notes = notes;
        // if (userId) updateFields.updatedBy = userId; // If model supports

        // findOneAndUpdate will ensure the organizationId match in the filter
        account = await BankAccount.findOneAndUpdate(
            { _id: req.params.id, organization: organizationId },
            { $set: updateFields },
            { new: true, runValidators: true }
        );
        res.json(account);
    } catch (err) {
        console.error('Error updating bank account:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message });
        }
         if (err.code === 11000) { // Handle unique index violation (e.g., org + accountName)
             return res.status(400).json({ msg: 'A bank account with this name might already exist for your organization.' });
        }
        res.status(500).send('Server Error: Could not update bank account.');
    }
};

// @desc    Delete a bank account for the active organization
// @access  Private
exports.deleteBankAccount = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Bank Account ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const account = await BankAccount.findOneAndDelete({ _id: req.params.id, organization: organizationId });
        if (!account) return res.status(404).json({ msg: 'Bank account not found within your organization or already deleted.' });

        res.json({ msg: 'Bank account removed' });
    } catch (err) {
        console.error('Error deleting bank account:', err.message, err.stack);
        res.status(500).send('Server Error: Could not delete bank account.');
    }
};


// --- Expense Tracking (Module 2.2) ---
// @desc    Add a new expense for the active organization
// @access  Private
exports.addExpense = async (req, res) => {
    const { date, amount, category, vendor, description, paymentMethod, receiptUrl, notes, currency } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id;

    try {
        if (!date || amount === undefined || !category || !description) {
            return res.status(400).json({ msg: 'Date, amount, category, and description are required for an expense.' });
        }
        const orgCurrency = req.organization.currency || 'INR';

        const newExpense = new Expense({
            organization: organizationId, // Scope to organization
            user: userId,                 // Track creator
            date, amount, category, vendor, description, paymentMethod, receiptUrl, notes,
            currency: currency || orgCurrency
        });
        const expense = await newExpense.save();
        res.status(201).json(expense);
    } catch (err) {
        console.error('Error adding expense:', err.message, err.stack);
         if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message });
        }
        res.status(500).send('Server Error: Could not add expense.');
    }
};

// @desc    Get all expenses for the active organization (with filtering)
// @access  Private
exports.getExpenses = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        const { category, startDate, endDate, month, year, paymentMethod, vendor } = req.query;
        // --- MULTI-TENANCY: Base query includes organizationId ---
        const query = { organization: organizationId };

        if (category) query.category = category;
        if (paymentMethod) query.paymentMethod = paymentMethod;
        if (vendor) query.vendor = { $regex: vendor, $options: 'i' };


        if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else if (startDate) {
            query.date = { $gte: new Date(startDate) };
        } else if (endDate) {
            query.date = { $lte: new Date(endDate) };
        }

        if (month && year) {
            const parsedMonth = parseInt(month, 10);
            const parsedYear = parseInt(year, 10);
            if (!isNaN(parsedMonth) && !isNaN(parsedYear) && parsedMonth >= 1 && parsedMonth <= 12) {
                const firstDay = new Date(parsedYear, parsedMonth - 1, 1);
                const lastDay = new Date(parsedYear, parsedMonth, 0, 23, 59, 59, 999);
                // Merge date conditions if some already exist
                query.date = { ...(query.date || {}), $gte: firstDay, $lte: lastDay };
            } else {
                return res.status(400).json({ msg: "Invalid month or year for filtering."});
            }
        } else if (year) {
            const parsedYear = parseInt(year, 10);
            if (!isNaN(parsedYear)) {
                const firstDay = new Date(parsedYear, 0, 1);
                const lastDay = new Date(parsedYear, 11, 31, 23, 59, 59, 999);
                query.date = { ...(query.date || {}), $gte: firstDay, $lte: lastDay };
            } else {
                 return res.status(400).json({ msg: "Invalid year for filtering."});
            }
        }

        const expenses = await Expense.find(query).sort({ date: -1 });
        res.json(expenses);
    } catch (err) {
        console.error('Error fetching expenses:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch expenses.');
    }
};

// @desc    Get a single expense by ID for the active organization
// @access  Private
exports.getExpenseById = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Expense ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const expense = await Expense.findOne({ _id: req.params.id, organization: organizationId });
        if (!expense) return res.status(404).json({ msg: 'Expense not found within your organization.' });
        res.json(expense);
    } catch (err) {
        console.error('Error fetching expense by ID:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch expense.');
    }
};

// @desc    Update an expense for the active organization
// @access  Private
exports.updateExpense = async (req, res) => {
    const { date, amount, category, vendor, description, paymentMethod, receiptUrl, notes, currency } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id; // If Expense model has an 'updatedBy' field

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Expense ID format' });
        }
        // --- MULTI-TENANCY: Find by _id AND organizationId ---
        let expense = await Expense.findOne({ _id: req.params.id, organization: organizationId });
        if (!expense) return res.status(404).json({ msg: 'Expense not found within your organization.' });

        const updateFields = {};
        if (date !== undefined) updateFields.date = date;
        if (amount !== undefined) updateFields.amount = amount;
        if (category !== undefined) updateFields.category = category;
        if (vendor !== undefined) updateFields.vendor = vendor;
        if (description !== undefined) updateFields.description = description;
        if (paymentMethod !== undefined) updateFields.paymentMethod = paymentMethod;
        if (receiptUrl !== undefined) updateFields.receiptUrl = receiptUrl;
        if (notes !== undefined) updateFields.notes = notes;
        if (currency !== undefined) updateFields.currency = currency;
        // if (userId) updateFields.updatedBy = userId; // If model supports

        expense = await Expense.findOneAndUpdate(
            { _id: req.params.id, organization: organizationId }, // Ensure org match in filter
            { $set: updateFields },
            { new: true, runValidators: true }
        );
        res.json(expense);
    } catch (err) {
        console.error('Error updating expense:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message });
        }
        res.status(500).send('Server Error: Could not update expense.');
    }
};

// @desc    Delete an expense for the active organization
// @access  Private
exports.deleteExpense = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Expense ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const expense = await Expense.findOneAndDelete({ _id: req.params.id, organization: organizationId });
        if (!expense) return res.status(404).json({ msg: 'Expense not found within your organization or already deleted.' });

        res.json({ msg: 'Expense removed' });
    } catch (err) {
        console.error('Error deleting expense:', err.message, err.stack);
        res.status(500).send('Server Error: Could not delete expense.');
    }
};

// --- Revenue Tracking (Module 2.3) ---
// @desc    Add a new revenue entry for the active organization
// @access  Private
exports.addRevenue = async (req, res) => {
    const { date, amount, source, description, invoiceNumber, status, notes, currency } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id;

    try {
        if (!date || amount === undefined || !source) {
            return res.status(400).json({ msg: 'Date, amount, and source are required for revenue.' });
        }
        const orgCurrency = req.organization.currency || 'INR';

        const newRevenue = new Revenue({
            organization: organizationId, // Scope to organization
            user: userId,                 // Track creator
            date, amount, source, description, invoiceNumber, status, notes,
            currency: currency || orgCurrency
        });
        const revenue = await newRevenue.save();
        res.status(201).json(revenue);
    } catch (err) {
        console.error('Error adding revenue:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message });
        }
        res.status(500).send('Server Error: Could not add revenue.');
    }
};

// @desc    Get all revenue entries for the active organization
// @access  Private
exports.getRevenueEntries = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        const { source, startDate, endDate, month, year, status } = req.query;
        // --- MULTI-TENANCY: Base query includes organizationId ---
        const query = { organization: organizationId };

        if (source) query.source = { $regex: source, $options: 'i' };
        if (status) query.status = status;

        if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else if (startDate) {
            query.date = { $gte: new Date(startDate) };
        } else if (endDate) {
            query.date = { $lte: new Date(endDate) };
        }

        if (month && year) {
             const parsedMonth = parseInt(month, 10);
            const parsedYear = parseInt(year, 10);
            if (!isNaN(parsedMonth) && !isNaN(parsedYear) && parsedMonth >= 1 && parsedMonth <= 12) {
                const firstDay = new Date(parsedYear, parsedMonth - 1, 1);
                const lastDay = new Date(parsedYear, parsedMonth, 0, 23, 59, 59, 999);
                query.date = { ...(query.date || {}), $gte: firstDay, $lte: lastDay };
            } else {
                 return res.status(400).json({ msg: "Invalid month or year for filtering."});
            }
        } else if (year) {
             const parsedYear = parseInt(year, 10);
            if (!isNaN(parsedYear)) {
                const firstDay = new Date(parsedYear, 0, 1);
                const lastDay = new Date(parsedYear, 11, 31, 23, 59, 59, 999);
                query.date = { ...(query.date || {}), $gte: firstDay, $lte: lastDay };
            } else {
                return res.status(400).json({ msg: "Invalid year for filtering."});
            }
        }

        const revenues = await Revenue.find(query).sort({ date: -1 });
        res.json(revenues);
    } catch (err) {
        console.error('Error fetching revenue entries:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch revenue entries.');
    }
};

// @desc    Get a single revenue entry by ID for the active organization
// @access  Private
exports.getRevenueEntryById = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Revenue ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const revenue = await Revenue.findOne({ _id: req.params.id, organization: organizationId });
        if (!revenue) return res.status(404).json({ msg: 'Revenue entry not found within your organization.' });
        res.json(revenue);
    } catch (err) {
        console.error('Error fetching revenue entry by ID:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch revenue entry.');
    }
};

// @desc    Update a revenue entry for the active organization
// @access  Private
exports.updateRevenueEntry = async (req, res) => {
    const { date, amount, source, description, invoiceNumber, status, notes, currency } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id; // If Revenue model has an 'updatedBy' field

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Revenue ID format' });
        }
        // --- MULTI-TENANCY: Find by _id AND organizationId ---
        let revenue = await Revenue.findOne({ _id: req.params.id, organization: organizationId });
        if (!revenue) return res.status(404).json({ msg: 'Revenue entry not found within your organization.' });

        const updateFields = {};
        if (date !== undefined) updateFields.date = date;
        if (amount !== undefined) updateFields.amount = amount;
        if (source !== undefined) updateFields.source = source;
        if (description !== undefined) updateFields.description = description;
        if (invoiceNumber !== undefined) updateFields.invoiceNumber = invoiceNumber;
        if (status !== undefined) updateFields.status = status;
        if (notes !== undefined) updateFields.notes = notes;
        if (currency !== undefined) updateFields.currency = currency;
        // if (userId) updateFields.updatedBy = userId; // If model supports

        revenue = await Revenue.findOneAndUpdate(
            { _id: req.params.id, organization: organizationId }, // Ensure org match in filter
            { $set: updateFields },
            { new: true, runValidators: true }
        );
        res.json(revenue);
    } catch (err) {
        console.error('Error updating revenue entry:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message });
        }
        res.status(500).send('Server Error: Could not update revenue entry.');
    }
};

// @desc    Delete a revenue entry for the active organization
// @access  Private
exports.deleteRevenueEntry = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Revenue ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const revenue = await Revenue.findOneAndDelete({ _id: req.params.id, organization: organizationId });
        if (!revenue) return res.status(404).json({ msg: 'Revenue entry not found within your organization or already deleted.' });

        res.json({ msg: 'Revenue entry removed' });
    } catch (err) {
        console.error('Error deleting revenue entry:', err.message, err.stack);
        res.status(500).send('Server Error: Could not delete revenue entry.');
    }
};

// --- Fund Utilization & Overview (Module 2.1 & 2.4) ---
// @desc    Get financial overview for the active organization
// @access  Private
exports.getFinancialOverview = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    const orgCurrency = req.organization.currency || 'INR';

    try {
        // --- MULTI-TENANCY: Filter all queries by organizationId ---
        const bankAccounts = await BankAccount.find({ organization: organizationId });
        const totalBankBalance = bankAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);

        const rounds = await Round.find({ organization: organizationId });
        const totalFundsReceivedFromRounds = rounds.reduce((sum, r) => sum + r.totalFundsReceived, 0);

        const today = new Date();
        const threeMonthsAgo = new Date(new Date().setMonth(today.getMonth() - 3));
        threeMonthsAgo.setDate(1); threeMonthsAgo.setHours(0,0,0,0);
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const currentYearStart = new Date(today.getFullYear(), 0, 1);

        const recentExpensesAgg = await Expense.aggregate([
            { $match: { organization: organizationId, date: { $gte: threeMonthsAgo, $lt: currentMonthStart } } },
            { $group: {
                _id: { year: { $year: "$date" }, month: { $month: "$date" } },
                totalMonthlyExpense: { $sum: "$amount" }
            }},
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        const recentRevenueAgg = await Revenue.aggregate([
            { $match: { organization: organizationId, date: { $gte: threeMonthsAgo, $lt: currentMonthStart } } },
            { $group: {
                _id: { year: { $year: "$date" }, month: { $month: "$date" } },
                totalMonthlyRevenue: { $sum: "$amount" }
            }},
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        let averageMonthlyBurnRate = 0;
        if (recentExpensesAgg.length > 0) {
            const totalBurnOverPeriod = recentExpensesAgg.reduce((sum, month) => sum + month.totalMonthlyExpense, 0);
            averageMonthlyBurnRate = totalBurnOverPeriod / recentExpensesAgg.length;
        }

        let averageMonthlyRevenue = 0;
        if (recentRevenueAgg.length > 0) {
            const totalRevenueOverPeriod = recentRevenueAgg.reduce((sum, month) => sum + month.totalMonthlyRevenue, 0);
            averageMonthlyRevenue = totalRevenueOverPeriod / recentRevenueAgg.length;
        }
        
        const netMonthlyCashFlow = averageMonthlyRevenue - averageMonthlyBurnRate;
        const estimatedRunwayMonths = averageMonthlyBurnRate > 0 && totalBankBalance > 0
            ? (totalBankBalance / averageMonthlyBurnRate)
            : (averageMonthlyBurnRate <=0 && totalBankBalance >=0 ? "Infinite" : 0);

        const mtdExpenses = await Expense.aggregate([
            { $match: { organization: organizationId, date: { $gte: currentMonthStart } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const mtdRevenue = await Revenue.aggregate([
            { $match: { organization: organizationId, date: { $gte: currentMonthStart } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const ytdExpenses = await Expense.aggregate([
            { $match: { organization: organizationId, date: { $gte: currentYearStart } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const ytdRevenue = await Revenue.aggregate([
            { $match: { organization: organizationId, date: { $gte: currentYearStart } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const latestExpenses = await Expense.find({ organization: organizationId })
            .sort({ date: -1 }).limit(10).select('date amount category description currency');
        const latestRevenue = await Revenue.find({ organization: organizationId })
            .sort({ date: -1 }).limit(10).select('date amount source description currency');

        res.json({
            currency: orgCurrency,
            totalFundsReceivedFromRounds,
            currentTotalBankBalance: totalBankBalance,
            averageMonthlyBurnRate: parseFloat(averageMonthlyBurnRate.toFixed(2)),
            averageMonthlyRevenue: parseFloat(averageMonthlyRevenue.toFixed(2)),
            netMonthlyCashFlow: parseFloat(netMonthlyCashFlow.toFixed(2)),
            estimatedRunwayMonths: (typeof estimatedRunwayMonths === 'string') ? estimatedRunwayMonths : parseFloat(estimatedRunwayMonths.toFixed(1)),
            currentMonthToDate: {
                expenses: mtdExpenses[0]?.total || 0,
                revenue: mtdRevenue[0]?.total || 0,
                netCashFlow: (mtdRevenue[0]?.total || 0) - (mtdExpenses[0]?.total || 0)
            },
            currentYearToDate: {
                expenses: ytdExpenses[0]?.total || 0,
                revenue: ytdRevenue[0]?.total || 0,
                netCashFlow: (ytdRevenue[0]?.total || 0) - (ytdExpenses[0]?.total || 0)
            },
            latestTransactions: {
                expenses: latestExpenses,
                revenue: latestRevenue
            },
            historicalMonthlyData: {
                expenses: recentExpensesAgg.map(m => ({ year: m._id.year, month: m._id.month, amount: m.totalMonthlyExpense })),
                revenue: recentRevenueAgg.map(m => ({ year: m._id.year, month: m._id.month, amount: m.totalMonthlyRevenue }))
            }
        });
    } catch (err) {
        console.error('Error fetching financial overview:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch financial overview.');
    }
};

// @desc    Get fund utilization report (expenses by category) for the active organization
// @access  Private
exports.getFundUtilizationReport = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        const { startDate, endDate, month, year } = req.query;
        // --- MULTI-TENANCY: Base filter includes organizationId ---
        const matchStage = { organization: organizationId };

        if (startDate && endDate) {
            matchStage.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else if (startDate) {
            matchStage.date = { $gte: new Date(startDate) };
        } else if (endDate) {
            matchStage.date = { $lte: new Date(endDate) };
        }

        if (month && year) {
            const parsedMonth = parseInt(month, 10);
            const parsedYear = parseInt(year, 10);
             if (!isNaN(parsedMonth) && !isNaN(parsedYear) && parsedMonth >= 1 && parsedMonth <= 12) {
                const firstDay = new Date(parsedYear, parsedMonth - 1, 1);
                const lastDay = new Date(parsedYear, parsedMonth, 0, 23, 59, 59, 999);
                matchStage.date = { ...(matchStage.date || {}), $gte: firstDay, $lte: lastDay }; // Merge date conditions
            } else {
                return res.status(400).json({ msg: "Invalid month or year for filtering."});
            }
        } else if (year) {
             const parsedYear = parseInt(year, 10);
            if (!isNaN(parsedYear)) {
                const firstDay = new Date(parsedYear, 0, 1);
                const lastDay = new Date(parsedYear, 11, 31, 23, 59, 59, 999);
                matchStage.date = { ...(matchStage.date || {}), $gte: firstDay, $lte: lastDay }; // Merge date conditions
            } else {
                return res.status(400).json({ msg: "Invalid year for filtering."});
            }
        }

        const utilization = await Expense.aggregate([
            { $match: matchStage },
            { $group: {
                _id: "$category",
                totalSpent: { $sum: "$amount" },
                count: { $sum: 1 }
            }},
            { $sort: { totalSpent: -1 } }
        ]);

        const totalExpensesInPeriod = utilization.reduce((sum, cat) => sum + cat.totalSpent, 0);

        const utilizationWithPercentage = utilization.map(cat => ({
            category: cat._id,
            totalSpent: cat.totalSpent,
            transactionCount: cat.count,
            percentage: totalExpensesInPeriod > 0 ? parseFloat(((cat.totalSpent / totalExpensesInPeriod) * 100).toFixed(2)) : 0
        }));

        res.json({
            periodExpenses: utilizationWithPercentage,
            totalExpensesInPeriod,
            currency: req.organization.currency || 'INR'
        });
    } catch (err) {
        console.error('Error fetching fund utilization report:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch fund utilization report.');
    }
};

// (Make sure all other financial controller methods like Budget, P&L, Balance Sheet, Cash Flow Statement
// are also updated similarly to scope by organizationId and use req.user._id for createdBy/user fields)
