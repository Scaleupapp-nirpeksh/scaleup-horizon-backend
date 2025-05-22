// controllers/financialController.js
const BankAccount = require('../models/bankAccountModel'); // Corrected import
const Expense = require('../models/expenseModel');       // Corrected import
const Revenue = require('../models/revenueModel');       // Corrected import
const Round = require('../models/roundModel');         // To get total funds received
const mongoose = require('mongoose');

// --- Bank Account Management (Module 2.1) ---
// @desc    Add a new bank account
// @access  Private
exports.addBankAccount = async (req, res) => {
    const { accountName, bankName, accountNumber, currentBalance, currency, notes } = req.body;
    try {
        if (!accountName || !bankName || currentBalance === undefined) {
            return res.status(400).json({ msg: 'Account name, bank name, and current balance are required.' });
        }
        const newAccount = new BankAccount({
            accountName, bankName, accountNumber, currentBalance, currency, notes,
            lastBalanceUpdate: Date.now()
        });
        const account = await newAccount.save();
        res.status(201).json(account);
    } catch (err) {
        console.error('Error adding bank account:', err.message);
        res.status(500).send('Server Error: Could not add bank account.');
    }
};

// @desc    Get all bank accounts
// @access  Private
exports.getBankAccounts = async (req, res) => {
    try {
        const accounts = await BankAccount.find().sort({ accountName: 1 });
        res.json(accounts);
    } catch (err) {
        console.error('Error fetching bank accounts:', err.message);
        res.status(500).send('Server Error: Could not fetch bank accounts.');
    }
};

// @desc    Get a single bank account by ID
// @access  Private
exports.getBankAccountById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Bank Account ID format' });
        }
        const account = await BankAccount.findById(req.params.id);
        if (!account) return res.status(404).json({ msg: 'Bank account not found' });
        res.json(account);
    } catch (err) {
        console.error('Error fetching bank account by ID:', err.message);
        res.status(500).send('Server Error: Could not fetch bank account.');
    }
};

// @desc    Update a bank account (primarily balance)
// @access  Private
exports.updateBankAccount = async (req, res) => {
    const { accountName, bankName, accountNumber, currentBalance, currency, notes } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Bank Account ID format' });
        }
        let account = await BankAccount.findById(req.params.id);
        if (!account) return res.status(404).json({ msg: 'Bank account not found' });

        const updateFields = { lastBalanceUpdate: Date.now() };
        if (accountName !== undefined) updateFields.accountName = accountName;
        if (bankName !== undefined) updateFields.bankName = bankName;
        if (accountNumber !== undefined) updateFields.accountNumber = accountNumber;
        if (currentBalance !== undefined) updateFields.currentBalance = currentBalance;
        if (currency !== undefined) updateFields.currency = currency;
        if (notes !== undefined) updateFields.notes = notes;

        account = await BankAccount.findByIdAndUpdate(req.params.id, { $set: updateFields }, { new: true });
        res.json(account);
    } catch (err) {
        console.error('Error updating bank account:', err.message);
        res.status(500).send('Server Error: Could not update bank account.');
    }
};

// @desc    Delete a bank account
// @access  Private
exports.deleteBankAccount = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Bank Account ID format' });
        }
        const account = await BankAccount.findById(req.params.id);
        if (!account) return res.status(404).json({ msg: 'Bank account not found' });
        
        await BankAccount.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Bank account removed' });
    } catch (err) {
        console.error('Error deleting bank account:', err.message);
        res.status(500).send('Server Error: Could not delete bank account.');
    }
};


// --- Expense Tracking (Module 2.2) ---
// @desc    Add a new expense
// @access  Private
exports.addExpense = async (req, res) => {
    const { date, amount, category, vendor, description, paymentMethod, receiptUrl, notes } = req.body;
    try {
        if (!date || amount === undefined || !category || !description) {
            return res.status(400).json({ msg: 'Date, amount, category, and description are required for an expense.' });
        }
        const newExpense = new Expense({
            date, amount, category, vendor, description, paymentMethod, receiptUrl, notes
        });
        const expense = await newExpense.save();
        res.status(201).json(expense);
    } catch (err) {
        console.error('Error adding expense:', err.message);
        res.status(500).send('Server Error: Could not add expense.');
    }
};

// @desc    Get all expenses (with filtering)
// @access  Private
exports.getExpenses = async (req, res) => {
    try {
        const { category, startDate, endDate, month, year } = req.query;
        const query = {};

        if (category) query.category = category;
        if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else if (startDate) {
            query.date = { $gte: new Date(startDate) };
        } else if (endDate) {
            query.date = { $lte: new Date(endDate) };
        }

        if (month && year) { // Filter by specific month and year
            const firstDay = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0, 23, 59, 59, 999); // Last day of the month
            query.date = { $gte: firstDay, $lte: lastDay };
        } else if (year) { // Filter by entire year
            const firstDay = new Date(year, 0, 1);
            const lastDay = new Date(year, 11, 31, 23, 59, 59, 999);
            query.date = { $gte: firstDay, $lte: lastDay };
        }


        const expenses = await Expense.find(query).sort({ date: -1 });
        res.json(expenses);
    } catch (err) {
        console.error('Error fetching expenses:', err.message);
        res.status(500).send('Server Error: Could not fetch expenses.');
    }
};

// @desc    Get a single expense by ID
// @access  Private
exports.getExpenseById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Expense ID format' });
        }
        const expense = await Expense.findById(req.params.id);
        if (!expense) return res.status(404).json({ msg: 'Expense not found' });
        res.json(expense);
    } catch (err) {
        console.error('Error fetching expense by ID:', err.message);
        res.status(500).send('Server Error: Could not fetch expense.');
    }
};

// @desc    Update an expense
// @access  Private
exports.updateExpense = async (req, res) => {
    const { date, amount, category, vendor, description, paymentMethod, receiptUrl, notes } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Expense ID format' });
        }
        let expense = await Expense.findById(req.params.id);
        if (!expense) return res.status(404).json({ msg: 'Expense not found' });

        const updateFields = {};
        if (date !== undefined) updateFields.date = date;
        if (amount !== undefined) updateFields.amount = amount;
        if (category !== undefined) updateFields.category = category;
        if (vendor !== undefined) updateFields.vendor = vendor;
        if (description !== undefined) updateFields.description = description;
        if (paymentMethod !== undefined) updateFields.paymentMethod = paymentMethod;
        if (receiptUrl !== undefined) updateFields.receiptUrl = receiptUrl;
        if (notes !== undefined) updateFields.notes = notes;

        expense = await Expense.findByIdAndUpdate(req.params.id, { $set: updateFields }, { new: true });
        res.json(expense);
    } catch (err) {
        console.error('Error updating expense:', err.message);
        res.status(500).send('Server Error: Could not update expense.');
    }
};

// @desc    Delete an expense
// @access  Private
exports.deleteExpense = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Expense ID format' });
        }
        const expense = await Expense.findById(req.params.id);
        if (!expense) return res.status(404).json({ msg: 'Expense not found' });
        
        await Expense.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Expense removed' });
    } catch (err) {
        console.error('Error deleting expense:', err.message);
        res.status(500).send('Server Error: Could not delete expense.');
    }
};

// --- Revenue Tracking (Module 2.3) ---
// @desc    Add a new revenue entry
// @access  Private
exports.addRevenue = async (req, res) => {
    const { date, amount, source, description, invoiceNumber, status, notes } = req.body;
    try {
        if (!date || amount === undefined || !source) {
            return res.status(400).json({ msg: 'Date, amount, and source are required for revenue.' });
        }
        const newRevenue = new Revenue({
            date, amount, source, description, invoiceNumber, status, notes
        });
        const revenue = await newRevenue.save();
        res.status(201).json(revenue);
    } catch (err) {
        console.error('Error adding revenue:', err.message);
        res.status(500).send('Server Error: Could not add revenue.');
    }
};

// @desc    Get all revenue entries
// @access  Private
exports.getRevenueEntries = async (req, res) => {
    try {
        const { source, startDate, endDate, month, year } = req.query;
        const query = {};
        if (source) query.source = { $regex: source, $options: 'i' }; // Case-insensitive search for source
         if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else if (startDate) {
            query.date = { $gte: new Date(startDate) };
        } else if (endDate) {
            query.date = { $lte: new Date(endDate) };
        }
         if (month && year) {
            const firstDay = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0, 23, 59, 59, 999);
            query.date = { $gte: firstDay, $lte: lastDay };
        } else if (year) {
            const firstDay = new Date(year, 0, 1);
            const lastDay = new Date(year, 11, 31, 23, 59, 59, 999);
            query.date = { $gte: firstDay, $lte: lastDay };
        }

        const revenues = await Revenue.find(query).sort({ date: -1 });
        res.json(revenues);
    } catch (err) {
        console.error('Error fetching revenue entries:', err.message);
        res.status(500).send('Server Error: Could not fetch revenue entries.');
    }
};

// @desc    Get a single revenue entry by ID
// @access  Private
exports.getRevenueEntryById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Revenue ID format' });
        }
        const revenue = await Revenue.findById(req.params.id);
        if (!revenue) return res.status(404).json({ msg: 'Revenue entry not found' });
        res.json(revenue);
    } catch (err) {
        console.error('Error fetching revenue entry by ID:', err.message);
        res.status(500).send('Server Error: Could not fetch revenue entry.');
    }
};

// @desc    Update a revenue entry
// @access  Private
exports.updateRevenueEntry = async (req, res) => {
    const { date, amount, source, description, invoiceNumber, status, notes } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Revenue ID format' });
        }
        let revenue = await Revenue.findById(req.params.id);
        if (!revenue) return res.status(404).json({ msg: 'Revenue entry not found' });

        const updateFields = {};
        if (date !== undefined) updateFields.date = date;
        if (amount !== undefined) updateFields.amount = amount;
        if (source !== undefined) updateFields.source = source;
        if (description !== undefined) updateFields.description = description;
        if (invoiceNumber !== undefined) updateFields.invoiceNumber = invoiceNumber;
        if (status !== undefined) updateFields.status = status;
        if (notes !== undefined) updateFields.notes = notes;

        revenue = await Revenue.findByIdAndUpdate(req.params.id, { $set: updateFields }, { new: true });
        res.json(revenue);
    } catch (err) {
        console.error('Error updating revenue entry:', err.message);
        res.status(500).send('Server Error: Could not update revenue entry.');
    }
};

// @desc    Delete a revenue entry
// @access  Private
exports.deleteRevenueEntry = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Revenue ID format' });
        }
        const revenue = await Revenue.findById(req.params.id);
        if (!revenue) return res.status(404).json({ msg: 'Revenue entry not found' });

        await Revenue.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Revenue entry removed' });
    } catch (err) {
        console.error('Error deleting revenue entry:', err.message);
        res.status(500).send('Server Error: Could not delete revenue entry.');
    }
};

// --- Fund Utilization & Overview (Module 2.1 & 2.4) ---
// @desc    Get financial overview
// @access  Private
exports.getFinancialOverview = async (req, res) => {
    try {
        const bankAccounts = await BankAccount.find();
        const totalBankBalance = bankAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);

        const rounds = await Round.find(); // Assuming you want total from all rounds
        const totalFundsReceivedFromRounds = rounds.reduce((sum, r) => sum + r.totalFundsReceived, 0);
        
        // Calculate Monthly Burn Rate (average of last 3 months of expenses)
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        threeMonthsAgo.setDate(1); // Start of the month
        threeMonthsAgo.setHours(0, 0, 0, 0);


        const recentExpenses = await Expense.aggregate([
            { $match: { date: { $gte: threeMonthsAgo } } },
            {
                $group: {
                    _id: { year: { $year: "$date" }, month: { $month: "$date" } },
                    totalMonthlyExpense: { $sum: "$amount" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);
        
        let averageMonthlyBurnRate = 0;
        if (recentExpenses.length > 0) {
            const totalBurnOverPeriod = recentExpenses.reduce((sum, month) => sum + month.totalMonthlyExpense, 0);
            averageMonthlyBurnRate = totalBurnOverPeriod / recentExpenses.length;
        }

        const estimatedRunwayMonths = averageMonthlyBurnRate > 0 ? (totalBankBalance / averageMonthlyBurnRate) : Infinity;

        res.json({
            totalFundsReceivedFromRounds,
            currentTotalBankBalance: totalBankBalance,
            averageMonthlyBurnRate: averageMonthlyBurnRate.toFixed(2),
            estimatedRunwayMonths: isFinite(estimatedRunwayMonths) ? estimatedRunwayMonths.toFixed(1) : "N/A (No Burn or No Funds)",
        });
    } catch (err) {
        console.error('Error fetching financial overview:', err.message);
        res.status(500).send('Server Error: Could not fetch financial overview.');
    }
};

// @desc    Get fund utilization report (expenses by category)
// @access  Private
exports.getFundUtilizationReport = async (req, res) => {
    try {
        const { startDate, endDate, month, year } = req.query;
        const matchStage = {};

        if (startDate && endDate) {
            matchStage.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else if (startDate) {
            matchStage.date = { $gte: new Date(startDate) };
        } else if (endDate) {
            matchStage.date = { $lte: new Date(endDate) };
        }

        if (month && year) {
            const firstDay = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0, 23, 59, 59, 999);
            matchStage.date = { $gte: firstDay, $lte: lastDay };
        } else if (year) {
            const firstDay = new Date(year, 0, 1);
            const lastDay = new Date(year, 11, 31, 23, 59, 59, 999);
            matchStage.date = { $gte: firstDay, $lte: lastDay };
        }
        // If no date filter, it aggregates all expenses

        const utilization = await Expense.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: "$category",
                    totalSpent: { $sum: "$amount" }
                }
            },
            { $sort: { totalSpent: -1 } }
        ]);

        const totalExpensesInPeriod = utilization.reduce((sum, cat) => sum + cat.totalSpent, 0);

        const utilizationWithPercentage = utilization.map(cat => ({
            category: cat._id,
            totalSpent: cat.totalSpent,
            percentage: totalExpensesInPeriod > 0 ? ((cat.totalSpent / totalExpensesInPeriod) * 100).toFixed(2) : "0.00"
        }));

        res.json({
            periodExpenses: utilizationWithPercentage,
            totalExpensesInPeriod
        });
    } catch (err) {
        console.error('Error fetching fund utilization report:', err.message);
        res.status(500).send('Server Error: Could not fetch fund utilization report.');
    }
};
