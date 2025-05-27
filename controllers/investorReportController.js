// controllers/investorReportController.js
const InvestorReport = require('../models/investorReportModel');
const Round = require('../models/roundModel');
const Expense = require('../models/expenseModel');
const Revenue = require('../models/revenueModel');
const BankAccount = require('../models/bankAccountModel');
const ManualKpiSnapshot = require('../models/manualKpiSnapshotModel');
const ProductMilestone = require('../models/productMilestoneModel');
const CustomKPI = require('../models/customKpiModel');
const Headcount = require('../models/headcountModel'); // NEW: For headcount data
const Investor = require('../models/investorModel'); // NEW: For investor counts in round
const Budget = require('../models/budgetModel'); // NEW: For high-level budget vs actual
const mongoose = require('mongoose');
const moment = require('moment'); // For date manipulations

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

        const newReport = new InvestorReport({
            reportTitle, periodStartDate, periodEndDate, narrativeSummary,
            keyAchievements, challengesFaced, nextStepsFocus,
            createdBy: req.horizonUser.id,
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
        const reports = await InvestorReport.find({ createdBy: req.horizonUser.id })
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
        const report = await InvestorReport.findOne({ _id: req.params.id, createdBy: req.horizonUser.id })
            .populate('createdBy', 'name');
        if (!report) {
            return res.status(404).json({ msg: 'Investor report not found or not authorized.' });
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
        let report = await InvestorReport.findOne({ _id: req.params.id, createdBy: req.horizonUser.id });
        if (!report) {
            return res.status(404).json({ msg: 'Investor report not found or not authorized.' });
        }

        if (reportTitle !== undefined) report.reportTitle = reportTitle;
        if (periodStartDate !== undefined) report.periodStartDate = periodStartDate;
        if (periodEndDate !== undefined) report.periodEndDate = periodEndDate;
        if (narrativeSummary !== undefined) report.narrativeSummary = narrativeSummary;
        if (keyAchievements !== undefined) report.keyAchievements = keyAchievements;
        if (challengesFaced !== undefined) report.challengesFaced = challengesFaced;
        if (nextStepsFocus !== undefined) report.nextStepsFocus = nextStepsFocus;
        if (snapshotData !== undefined) report.snapshotData = snapshotData;

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
        const report = await InvestorReport.findOne({ _id: req.params.id, createdBy: req.horizonUser.id });
        if (!report) {
            return res.status(404).json({ msg: 'Investor report not found or not authorized.' });
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
        const userId = req.horizonUser.id;
        const today = moment().toDate();
        const startOfCurrentMonth = moment().startOf('month').toDate();
        const startOfLastMonth = moment().subtract(1, 'month').startOf('month').toDate();
        const endOfLastMonth = moment().subtract(1, 'month').endOf('month').toDate();
        const startOfYear = moment().startOf('year').toDate();
        const threeMonthsAgo = moment().subtract(3, 'months').startOf('month').toDate();


        // --- Fundraising Data ---
        const activeRound = await Round.findOne({ /* createdBy: userId, */ status: { $in: ['Open', 'Closing'] } }).sort({ openDate: -1 });
        let fundraisingSummary = {
            roundName: "N/A", targetAmount: 0, totalCommitted: 0, totalReceived: 0, percentageClosed: "0.00%", numberOfInvestors: 0
        };
        if (activeRound) {
            const investorsInRound = await Investor.countDocuments({ roundId: activeRound._id });
            fundraisingSummary = {
                roundName: activeRound.name,
                targetAmount: activeRound.targetAmount,
                totalCommitted: activeRound.hardCommitmentsTotal,
                totalReceived: activeRound.totalFundsReceived,
                percentageClosed: activeRound.targetAmount > 0 ? ((activeRound.totalFundsReceived / activeRound.targetAmount) * 100).toFixed(1) + '%' : "N/A",
                numberOfInvestors: investorsInRound
            };
        }

        // --- Financial Overview Data ---
        const bankAccounts = await BankAccount.find({ /* createdBy: userId */ });
        const totalBankBalance = bankAccounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);

        const recentExpensesAgg = await Expense.aggregate([
            { $match: { date: { $gte: threeMonthsAgo } /* , createdBy: userId */ } },
            { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } }, totalMonthlyExpense: { $sum: "$amount" } } }
        ]);
        const averageMonthlyBurnRate = recentExpensesAgg.length > 0 ? recentExpensesAgg.reduce((sum, month) => sum + month.totalMonthlyExpense, 0) / recentExpensesAgg.length : 0;
        const estimatedRunwayMonths = averageMonthlyBurnRate > 0 ? (totalBankBalance / averageMonthlyBurnRate) : Infinity;

        const lastMonthExpenses = await Expense.aggregate([
            { $match: { date: { $gte: startOfLastMonth, $lte: endOfLastMonth } /* , createdBy: userId */ } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const ytdExpenses = await Expense.aggregate([
            { $match: { date: { $gte: startOfYear, $lte: today } /* , createdBy: userId */ } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const lastMonthRevenue = await Revenue.aggregate([
            { $match: { date: { $gte: startOfLastMonth, $lte: endOfLastMonth } /* , createdBy: userId */ } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const ytdRevenue = await Revenue.aggregate([
            { $match: { date: { $gte: startOfYear, $lte: today } /* , createdBy: userId */ } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
         const currentMonthRevenueToDate = await Revenue.aggregate([
            { $match: { date: { $gte: startOfCurrentMonth, $lte: today } /* , createdBy: userId */ } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);


        const financialSummary = {
            currentTotalBankBalance: totalBankBalance,
            averageMonthlyBurnRate: averageMonthlyBurnRate,
            estimatedRunwayMonths: isFinite(estimatedRunwayMonths) ? estimatedRunwayMonths : null,
            lastMonthExpenses: lastMonthExpenses[0]?.total || 0,
            ytdExpenses: ytdExpenses[0]?.total || 0,
            lastMonthRevenue: lastMonthRevenue[0]?.total || 0,
            ytdRevenue: ytdRevenue[0]?.total || 0,
            currentMonthRevenue: currentMonthRevenueToDate[0]?.total || 0,
        };

        // --- KPI Snapshot Data ---
        const latestKpiSnapshot = await ManualKpiSnapshot.findOne({ /* enteredBy: userId */ }).sort({ snapshotDate: -1 });
        let kpiSnapshotSummary = { snapshotDate: null, dau: null, mau: null, totalRegisteredUsers: null, newUsersToday: null, dauMauRatio: null };
        if (latestKpiSnapshot) {
            kpiSnapshotSummary = {
                snapshotDate: latestKpiSnapshot.snapshotDate,
                dau: latestKpiSnapshot.dau,
                mau: latestKpiSnapshot.mau,
                totalRegisteredUsers: latestKpiSnapshot.totalRegisteredUsers,
                newUsersToday: latestKpiSnapshot.newUsersToday,
                dauMauRatio: latestKpiSnapshot.mau && latestKpiSnapshot.dau ? (latestKpiSnapshot.dau / latestKpiSnapshot.mau) : null,
            };
        }

        // --- Custom Pinned KPIs ---
        const pinnedKpis = await CustomKPI.find({ createdBy: userId, isActive: true, isPinned: true })
            .sort({ 'cache.lastCalculated': -1 }).limit(5).select('displayName cache.currentValue cache.trend displayFormat');
        const customKpiSummary = pinnedKpis.map(kpi => ({
            name: kpi.displayName, value: kpi.cache?.currentValue, trend: kpi.cache?.trend, displayFormat: kpi.displayFormat
        }));

        // --- Fund Utilization ---
        const fundUtilization = await Expense.aggregate([
            { $match: { date: { $gte: startOfCurrentMonth } /* , createdBy: userId */ } },
            { $group: { _id: "$category", totalSpent: { $sum: "$amount" } } },
            { $sort: { totalSpent: -1 } }
        ]);
        const totalExpensesForUtilization = fundUtilization.reduce((sum, cat) => sum + cat.totalSpent, 0);
        const utilizationSummary = fundUtilization.map(cat => ({
            category: cat._id, totalSpent: cat.totalSpent, percentage: totalExpensesForUtilization > 0 ? ((cat.totalSpent / totalExpensesForUtilization) * 100) : 0
        })).slice(0, 5);

        // --- Product Milestones ---
        const upcomingMilestones = await ProductMilestone.find({
            createdBy: userId, visibleToInvestors: true, status: { $nin: ['Completed', 'Cancelled'] }, plannedEndDate: { $gte: today }
        }).sort({ plannedEndDate: 1 }).limit(3).select('name investorSummary plannedEndDate status completionPercentage');
        const recentlyCompletedMilestones = await ProductMilestone.find({
            createdBy: userId, visibleToInvestors: true, status: 'Completed', actualEndDate: { $gte: threeMonthsAgo }
        }).sort({ actualEndDate: -1 }).limit(2).select('name investorSummary actualEndDate');
        const productMilestoneSummary = { upcoming: upcomingMilestones, recentlyCompleted: recentlyCompletedMilestones };

        // --- Headcount Summary ---
        const totalActiveHeadcount = await Headcount.countDocuments({ status: 'Active' /* , createdBy: userId */ });
        const openPositions = await Headcount.countDocuments({ status: 'Open Requisition' /* , createdBy: userId */ });
        const headcountSummary = { totalActive: totalActiveHeadcount, openPositions };


        res.json({
            fundraisingSummary,
            financialSummary,
            kpiSnapshotSummary,
            customKpiSummary,
            fundUtilizationSummary: { period: "Current Month", topCategories: utilizationSummary, totalSpentInPeriod: totalExpensesForUtilization },
            productMilestoneSummary,
            headcountSummary // NEW
        });

    } catch (err) {
        console.error("Error in getLiveDashboardData:", err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch live dashboard data.');
    }
};
