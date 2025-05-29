// controllers/investorReportController.js
const InvestorReport = require('../models/investorReportModel'); // Phase 4 updated model
const Round = require('../models/roundModel');                 // Phase 4 updated model
const Expense = require('../models/expenseModel');             // Phase 4 updated model
const Revenue = require('../models/revenueModel');             // Phase 4 updated model
const BankAccount = require('../models/bankAccountModel');     // Phase 4 updated model
const ManualKpiSnapshot = require('../models/manualKpiSnapshotModel'); // Phase 4 updated model
const ProductMilestone = require('../models/productMilestoneModel'); // Phase 4 updated model
const CustomKPI = require('../models/customKpiModel');         // Phase 4 updated model
const Headcount = require('../models/headcountModel');         // Phase 4 updated model
const Investor = require('../models/investorModel');           // Phase 4 updated model
const Budget = require('../models/budgetModel');               // Phase 4 updated model
const mongoose = require('mongoose');
const moment = require('moment'); // For date manipulations

// @desc    Create a new investor report/narrative update for the active organization
exports.createInvestorReport = async (req, res) => {
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // Standardized from req.horizonUser.id

    const {
        reportTitle, periodStartDate, periodEndDate, narrativeSummary,
        keyAchievements, challengesFaced, nextStepsFocus, status, version // Added status, version
    } = req.body;
    try {
        if (!narrativeSummary) {
            return res.status(400).json({ msg: 'Narrative summary is required.' });
        }

        // --- MULTI-TENANCY: Add organizationId and createdBy ---
        const newReport = new InvestorReport({
            organization: organizationId,
            reportTitle, // Default is handled by model if not provided
            periodStartDate,
            periodEndDate,
            narrativeSummary,
            keyAchievements,
            challengesFaced,
            nextStepsFocus,
            status, // From request or model default
            version, // From request or model default
            createdBy: userId,
            // snapshotData will be populated by a separate "generate" or "prepare" step if needed
        });
        const report = await newReport.save();
        res.status(201).json(report);
    } catch (err) {
        console.error(`Error creating investor report for org ${organizationId}:`, err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        res.status(500).send('Server Error: Could not create investor report.');
    }
};

// @desc    Get all saved investor reports for the active organization
exports.getInvestorReports = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id; // Original code filtered by createdBy: req.horizonUser.id

    try {
        // --- MULTI-TENANCY: Filter by organizationId ---
        // const reports = await InvestorReport.find({ organization: organizationId, createdBy: userId }) // If only user's reports
        const reports = await InvestorReport.find({ organization: organizationId }) // All reports for the organization
            .populate('createdBy', 'name email') // Populate with fields from HorizonUser
            .sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) {
        console.error(`Error fetching investor reports for org ${organizationId}:`, err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch investor reports.');
    }
};

// @desc    Get a specific saved investor report by ID for the active organization
exports.getInvestorReportById = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id; // Original code filtered by createdBy

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Report ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        // const report = await InvestorReport.findOne({ _id: req.params.id, createdBy: userId, organization: organizationId })
        const report = await InvestorReport.findOne({ _id: req.params.id, organization: organizationId })
            .populate('createdBy', 'name email')
            .populate('sharedWithInvestorIds', 'name entityName'); // Populate investor details

        if (!report) {
            return res.status(404).json({ msg: 'Investor report not found or not authorized within your organization.' });
        }
        res.json(report);
    } catch (err) {
        console.error(`Error fetching investor report by ID for org ${organizationId}:`, err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch investor report.');
    }
};

// @desc    Update a saved investor report for the active organization
exports.updateInvestorReport = async (req, res) => {
     const {
        reportTitle, periodStartDate, periodEndDate, narrativeSummary,
        keyAchievements, challengesFaced, nextStepsFocus, snapshotData,
        sharedWithInvestorIds, status, version // Added sharedWithInvestorIds, status, version
    } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // For updatedBy if model supports

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Report ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        // let report = await InvestorReport.findOne({ _id: req.params.id, createdBy: userId, organization: organizationId }); // If only creator can update
        let report = await InvestorReport.findOne({ _id: req.params.id, organization: organizationId });

        if (!report) {
            return res.status(404).json({ msg: 'Investor report not found or not authorized within your organization.' });
        }

        // Build update object carefully
        const updateFields = {};
        if (reportTitle !== undefined) updateFields.reportTitle = reportTitle;
        if (periodStartDate !== undefined) updateFields.periodStartDate = periodStartDate;
        if (periodEndDate !== undefined) updateFields.periodEndDate = periodEndDate;
        if (narrativeSummary !== undefined) updateFields.narrativeSummary = narrativeSummary;
        if (keyAchievements !== undefined) updateFields.keyAchievements = keyAchievements;
        if (challengesFaced !== undefined) updateFields.challengesFaced = challengesFaced;
        if (nextStepsFocus !== undefined) updateFields.nextStepsFocus = nextStepsFocus;
        if (snapshotData !== undefined) updateFields.snapshotData = snapshotData; // Client is responsible for structure
        if (sharedWithInvestorIds !== undefined) updateFields.sharedWithInvestorIds = sharedWithInvestorIds;
        if (status !== undefined) updateFields.status = status;
        if (version !== undefined) updateFields.version = version;
        // if (userId && report.updatedBy !== undefined) report.updatedBy = userId; // If model has updatedBy

        const updatedReport = await InvestorReport.findOneAndUpdate(
            { _id: req.params.id, organization: organizationId }, // Ensure org match
            { $set: updateFields },
            { new: true, runValidators: true }
        ).populate('createdBy', 'name email').populate('sharedWithInvestorIds', 'name entityName');

        res.json(updatedReport);
    } catch (err) {
        console.error(`Error updating investor report for org ${organizationId}:`, err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        res.status(500).send('Server Error: Could not update investor report.');
    }
};

// @desc    Delete a saved investor report for the active organization
exports.deleteInvestorReport = async (req, res) => {
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Report ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        // const report = await InvestorReport.findOne({ _id: req.params.id, createdBy: userId, organization: organizationId }); // If only creator can delete
        const report = await InvestorReport.findOneAndDelete({ _id: req.params.id, organization: organizationId });

        if (!report) {
            return res.status(404).json({ msg: 'Investor report not found or not authorized within your organization.' });
        }
        // await InvestorReport.findByIdAndDelete(req.params.id); // Already deleted by findOneAndDelete
        res.json({ msg: 'Investor report removed.' });
    } catch (err) {
        console.error(`Error deleting investor report for org ${organizationId}:`, err.message, err.stack);
        res.status(500).send('Server Error: Could not delete investor report.');
    }
};


// @desc    Get aggregated data for the live investor dashboard view for the active organization
exports.getLiveDashboardData = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id; // Original code used req.horizonUser.id for createdBy filters
    const orgCurrency = req.organization.currency || 'INR'; // Get organization's default currency

    try {
        const today = moment().toDate();
        const startOfCurrentMonth = moment().startOf('month').toDate();
        const startOfLastMonth = moment().subtract(1, 'month').startOf('month').toDate();
        const endOfLastMonth = moment().subtract(1, 'month').endOf('month').toDate();
        const startOfYear = moment().startOf('year').toDate();
        const threeMonthsAgoFull = moment().subtract(3, 'months').startOf('month').toDate(); // Start of 3 full months ago


        // --- Fundraising Data ---
        // --- MULTI-TENANCY: Filter Round by organizationId ---
        const activeRound = await Round.findOne({ organization: organizationId, status: { $in: ['Open', 'Closing'] } }).sort({ openDate: -1 });
        let fundraisingSummary = {
            roundName: "N/A", targetAmount: 0, totalCommitted: 0, totalReceived: 0, percentageClosed: "0.00%", numberOfInvestors: 0, currency: orgCurrency
        };
        if (activeRound) {
            // --- MULTI-TENANCY: Filter Investor by organizationId AND roundId ---
            const investorsInRound = await Investor.countDocuments({ roundId: activeRound._id, organization: organizationId });
            fundraisingSummary = {
                roundName: activeRound.name,
                targetAmount: activeRound.targetAmount,
                currency: activeRound.currency || orgCurrency, // Use round's currency or org's
                totalCommitted: activeRound.hardCommitmentsTotal,
                totalReceived: activeRound.totalFundsReceived,
                percentageClosed: activeRound.targetAmount > 0 ? ((activeRound.totalFundsReceived / activeRound.targetAmount) * 100).toFixed(1) + '%' : "N/A",
                numberOfInvestors: investorsInRound
            };
        }

        // --- Financial Overview Data ---
        // --- MULTI-TENANCY: Filter BankAccount by organizationId ---
        const bankAccounts = await BankAccount.find({ organization: organizationId });
        const totalBankBalance = bankAccounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0); // Assuming all accounts in org currency for simplicity

        // --- MULTI-TENANCY: Filter Expense by organizationId in $match ---
        const recentExpensesAgg = await Expense.aggregate([
            { $match: { organization: organizationId, date: { $gte: threeMonthsAgoFull, $lt: startOfCurrentMonth } } }, // Use full past months
            { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } }, totalMonthlyExpense: { $sum: "$amount" } } }
        ]);
        const averageMonthlyBurnRate = recentExpensesAgg.length > 0 ? recentExpensesAgg.reduce((sum, month) => sum + month.totalMonthlyExpense, 0) / recentExpensesAgg.length : 0;
        const estimatedRunwayMonths = averageMonthlyBurnRate > 0 && totalBankBalance > 0
            ? (totalBankBalance / averageMonthlyBurnRate)
            : (averageMonthlyBurnRate <=0 && totalBankBalance >=0 ? Infinity : 0);


        // --- MULTI-TENANCY: Filter Expense by organizationId in $match ---
        const lastMonthExpenses = await Expense.aggregate([
            { $match: { organization: organizationId, date: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const ytdExpenses = await Expense.aggregate([
            { $match: { organization: organizationId, date: { $gte: startOfYear, $lte: today } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        // --- MULTI-TENANCY: Filter Revenue by organizationId in $match ---
        const lastMonthRevenue = await Revenue.aggregate([
            { $match: { organization: organizationId, date: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const ytdRevenue = await Revenue.aggregate([
            { $match: { organization: organizationId, date: { $gte: startOfYear, $lte: today } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
         const currentMonthRevenueToDate = await Revenue.aggregate([
            { $match: { organization: organizationId, date: { $gte: startOfCurrentMonth, $lte: today } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const financialSummary = {
            currency: orgCurrency,
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
        // --- MULTI-TENANCY: Filter ManualKpiSnapshot by organizationId ---
        const latestKpiSnapshot = await ManualKpiSnapshot.findOne({ organization: organizationId }).sort({ snapshotDate: -1 });
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
        // --- MULTI-TENANCY: Filter CustomKPI by organizationId ---
        const pinnedKpis = await CustomKPI.find({ organization: organizationId, isActive: true, isPinned: true })
            .sort({ 'cache.lastCalculated': -1 }).limit(5).select('displayName cache.currentValue cache.trend displayFormat');
        const customKpiSummary = pinnedKpis.map(kpi => ({
            name: kpi.displayName, value: kpi.cache?.currentValue, trend: kpi.cache?.trend, displayFormat: kpi.displayFormat
        }));

        // --- Fund Utilization ---
        // --- MULTI-TENANCY: Filter Expense by organizationId in $match ---
        const fundUtilization = await Expense.aggregate([
            { $match: { organization: organizationId, date: { $gte: startOfCurrentMonth } } },
            { $group: { _id: "$category", totalSpent: { $sum: "$amount" } } },
            { $sort: { totalSpent: -1 } }
        ]);
        const totalExpensesForUtilization = fundUtilization.reduce((sum, cat) => sum + cat.totalSpent, 0);
        const utilizationSummary = fundUtilization.map(cat => ({
            category: cat._id, totalSpent: cat.totalSpent, percentage: totalExpensesForUtilization > 0 ? ((cat.totalSpent / totalExpensesForUtilization) * 100) : 0
        })).slice(0, 5);

        // --- Product Milestones ---
        // --- MULTI-TENANCY: Filter ProductMilestone by organizationId ---
        const upcomingMilestones = await ProductMilestone.find({
            organization: organizationId, visibleToInvestors: true, status: { $nin: ['Completed', 'Cancelled'] }, plannedEndDate: { $gte: today }
        }).sort({ plannedEndDate: 1 }).limit(3).select('name investorSummary plannedEndDate status completionPercentage');
        const recentlyCompletedMilestones = await ProductMilestone.find({
            organization: organizationId, visibleToInvestors: true, status: 'Completed', actualEndDate: { $gte: threeMonthsAgoFull } // Use threeMonthsAgoFull
        }).sort({ actualEndDate: -1 }).limit(2).select('name investorSummary actualEndDate');
        const productMilestoneSummary = { upcoming: upcomingMilestones, recentlyCompleted: recentlyCompletedMilestones };

        // --- Headcount Summary ---
        // --- MULTI-TENANCY: Filter Headcount by organizationId ---
        const totalActiveHeadcount = await Headcount.countDocuments({ organization: organizationId, status: 'Active' });
        const openPositions = await Headcount.countDocuments({ organization: organizationId, status: 'Open Requisition' });
        const headcountSummary = { totalActive: totalActiveHeadcount, openPositions };

        res.json({
            fundraisingSummary,
            financialSummary,
            kpiSnapshotSummary,
            customKpiSummary,
            fundUtilizationSummary: { period: "Current Month", topCategories: utilizationSummary, totalSpentInPeriod: totalExpensesForUtilization, currency: orgCurrency },
            productMilestoneSummary,
            headcountSummary
        });

    } catch (err) {
        console.error(`Error in getLiveDashboardData for org ${organizationId}:`, err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch live dashboard data.');
    }
};
