// controllers/investorReportController.js
const InvestorReport = require('../models/investorReportModel');
const Round = require('../models/roundModel');
const Expense = require('../models/expenseModel');
const Revenue = require('../models/revenueModel');
const BankAccount = require('../models/bankAccountModel');
const ManualKpiSnapshot = require('../models/manualKpiSnapshotModel');
const mongoose = require('mongoose');

// @desc    Create a new investor report/narrative update
exports.createInvestorReport = async (req, res) => {
    const {
        reportTitle, periodStartDate, periodEndDate, narrativeSummary,
        keyAchievements, challengesFaced, nextStepsFocus
    } = req.body;
    try {
        if (!narrativeSummary) {
            return res.status(400).json({ msg: 'Narrative summary is required.' });
        }

        // Optionally, fetch live data to snapshot if creating a "point-in-time" report
        // For now, we'll assume snapshotData is either manually provided or populated by a more complex logic
        
        const newReport = new InvestorReport({
            reportTitle, periodStartDate, periodEndDate, narrativeSummary,
            keyAchievements, challengesFaced, nextStepsFocus,
            createdBy: req.horizonUser.id, // from authMiddleware
            // snapshotData: {} // Populate this if needed
        });
        const report = await newReport.save();
        res.status(201).json(report);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error: Could not create investor report.');
    }
};

// @desc    Get all saved investor reports/narrative updates
exports.getInvestorReports = async (req, res) => {
    try {
        const reports = await InvestorReport.find({ createdBy: req.horizonUser.id }) // Or all if admin
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error: Could not fetch investor reports.');
    }
};

// @desc    Get a specific saved investor report by ID
exports.getInvestorReportById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Report ID format' });
        }
        const report = await InvestorReport.findById(req.params.id).populate('createdBy', 'name');
        if (!report) {
            return res.status(404).json({ msg: 'Investor report not found.' });
        }
        res.json(report);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error: Could not fetch investor report.');
    }
};

// @desc    Update a saved investor report/narrative update
exports.updateInvestorReport = async (req, res) => {
     const {
        reportTitle, periodStartDate, periodEndDate, narrativeSummary,
        keyAchievements, challengesFaced, nextStepsFocus, snapshotData
    } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Report ID format' });
        }
        let report = await InvestorReport.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ msg: 'Investor report not found.' });
        }
        // Ensure only the creator can update, or admin
        if (report.createdBy.toString() !== req.horizonUser.id /* && req.horizonUser.role !== 'admin' */) {
            return res.status(401).json({ msg: 'User not authorized to update this report.' });
        }

        if (reportTitle !== undefined) report.reportTitle = reportTitle;
        if (periodStartDate !== undefined) report.periodStartDate = periodStartDate;
        if (periodEndDate !== undefined) report.periodEndDate = periodEndDate;
        if (narrativeSummary !== undefined) report.narrativeSummary = narrativeSummary;
        if (keyAchievements !== undefined) report.keyAchievements = keyAchievements;
        if (challengesFaced !== undefined) report.challengesFaced = challengesFaced;
        if (nextStepsFocus !== undefined) report.nextStepsFocus = nextStepsFocus;
        if (snapshotData !== undefined) report.snapshotData = snapshotData; // Allow updating snapshot

        const updatedReport = await report.save();
        res.json(updatedReport);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error: Could not update investor report.');
    }
};

// @desc    Delete a saved investor report
exports.deleteInvestorReport = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Report ID format' });
        }
        const report = await InvestorReport.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ msg: 'Investor report not found.' });
        }
        if (report.createdBy.toString() !== req.horizonUser.id /* && req.horizonUser.role !== 'admin' */) {
            return res.status(401).json({ msg: 'User not authorized to delete this report.' });
        }
        await InvestorReport.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Investor report removed.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error: Could not delete investor report.');
    }
};


// @desc    Get aggregated data for the live investor dashboard view
exports.getLiveDashboardData = async (req, res) => {
    try {
        // --- Fetch Fundraising Data (Current/Active Round) ---
        const activeRound = await Round.findOne({ status: { $in: ['Open', 'Closing'] } }).sort({ openDate: -1 });
        let fundraisingSummary = {
            roundName: "N/A",
            targetAmount: 0,
            totalCommitted: 0,
            totalReceived: 0,
            percentageClosed: "0.00%"
        };
        if (activeRound) {
            fundraisingSummary = {
                roundName: activeRound.name,
                targetAmount: activeRound.targetAmount,
                totalCommitted: activeRound.hardCommitmentsTotal, // Assuming hard commitments
                totalReceived: activeRound.totalFundsReceived,
                percentageClosed: activeRound.targetAmount > 0 ? ((activeRound.totalFundsReceived / activeRound.targetAmount) * 100).toFixed(2) + '%' : "N/A"
            };
        }

        // --- Fetch Financial Overview Data ---
        const bankAccounts = await BankAccount.find();
        const totalBankBalance = bankAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        threeMonthsAgo.setDate(1);
        threeMonthsAgo.setHours(0, 0, 0, 0);

        const recentExpenses = await Expense.aggregate([
            { $match: { date: { $gte: threeMonthsAgo } } },
            { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } }, totalMonthlyExpense: { $sum: "$amount" } } }
        ]);
        let averageMonthlyBurnRate = 0;
        if (recentExpenses.length > 0) {
            averageMonthlyBurnRate = recentExpenses.reduce((sum, month) => sum + month.totalMonthlyExpense, 0) / recentExpenses.length;
        }
        const estimatedRunwayMonths = averageMonthlyBurnRate > 0 ? (totalBankBalance / averageMonthlyBurnRate) : Infinity;

        const financialSummary = {
            currentTotalBankBalance: totalBankBalance,
            averageMonthlyBurnRate: averageMonthlyBurnRate.toFixed(2),
            estimatedRunwayMonths: isFinite(estimatedRunwayMonths) ? estimatedRunwayMonths.toFixed(1) : "N/A",
        };

        // --- Fetch Key KPI Data (from latest manual snapshot) ---
        const latestKpiSnapshot = await ManualKpiSnapshot.findOne().sort({ snapshotDate: -1 });
        let kpiSummary = {
            snapshotDate: "N/A",
            dau: 0,
            mau: 0,
            totalRegisteredUsers: 0,
            newUsersToday: 0, // Or for the period of the snapshot
            dauMauRatio: "N/A"
        };
        if (latestKpiSnapshot) {
            kpiSummary = {
                snapshotDate: latestKpiSnapshot.snapshotDate.toISOString().split('T')[0],
                dau: latestKpiSnapshot.dau,
                mau: latestKpiSnapshot.mau,
                totalRegisteredUsers: latestKpiSnapshot.totalRegisteredUsers,
                newUsersToday: latestKpiSnapshot.newUsersToday,
                dauMauRatio: latestKpiSnapshot.mau ? ((latestKpiSnapshot.dau / latestKpiSnapshot.mau) * 100).toFixed(2) + '%' : 'N/A',
            };
        }
        
        // --- Fetch High-Level Fund Utilization (e.g., last 30 days or current month) ---
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const fundUtilization = await Expense.aggregate([
            { $match: { date: { $gte: oneMonthAgo } } }, // Example: last 30 days
            { $group: { _id: "$category", totalSpent: { $sum: "$amount" } } },
            { $sort: { totalSpent: -1 } }
        ]);
        const totalExpensesForUtilization = fundUtilization.reduce((sum, cat) => sum + cat.totalSpent, 0);
        const utilizationSummary = fundUtilization.map(cat => ({
            category: cat._id,
            totalSpent: cat.totalSpent,
            percentage: totalExpensesForUtilization > 0 ? ((cat.totalSpent / totalExpensesForUtilization) * 100).toFixed(2) + '%' : "0.00%"
        })).slice(0, 5); // Top 5 categories for summary


        res.json({
            fundraisingSummary,
            financialSummary,
            kpiSummary,
            fundUtilizationSummary: {
                period: "Last 30 Days (Example)", // Or make this dynamic
                topCategories: utilizationSummary,
                totalSpentInPeriod: totalExpensesForUtilization
            }
            // Add Product Milestones (this would likely be manually entered or from another system)
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error: Could not fetch live dashboard data.');
    }
};
