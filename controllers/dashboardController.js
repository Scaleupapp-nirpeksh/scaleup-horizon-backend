// controllers/dashboardController.js
// Single aggregation endpoint behind the founder "command center" dashboard.
// Everything is computed server-side and org-scoped so the frontend makes
// one request instead of a dozen.
const mongoose = require('mongoose');
const Task = require('../models/taskModel');
const Notification = require('../models/notificationModel');
const Expense = require('../models/expenseModel');
const Revenue = require('../models/revenueModel');
const BankAccount = require('../models/bankAccountModel');
const Budget = require('../models/budgetModel');
const Headcount = require('../models/headcountModel');
const Round = require('../models/roundModel');
const Investor = require('../models/investorModel');
const ManualKpiSnapshot = require('../models/manualKpiSnapshotModel');

const OPEN_STATUSES = { $nin: ['completed', 'cancelled'] };

// Parse "Weekly discussion day: Monday (17:00)" lines that the Excel import
// wrote into epic descriptions. Returns e.g. "Monday" or null.
function parseDiscussionDay(description) {
    const m = /Weekly discussion day:\s*([A-Za-z]+)/.exec(description || '');
    return m ? m[1] : null;
}

/**
 * @desc    All data for the founder command-center dashboard
 * @route   GET /api/horizon/dashboard/command-center
 * @access  Private (requires active organization)
 */
exports.getCommandCenter = async (req, res) => {
    try {
        const orgId = req.organization._id;
        const userId = req.user._id;
        const now = new Date();

        const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
        const endOfTomorrow = new Date(startOfToday); endOfTomorrow.setDate(endOfTomorrow.getDate() + 2);
        const endOfWeek = new Date(startOfToday); endOfWeek.setDate(endOfWeek.getDate() + 7);
        const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const baseTask = { organization: orgId, isArchived: false, taskType: 'task' };

        const [
            overdueTasks,
            dueSoonTasks,
            dueThisWeek,
            completedLast7,
            createdLast7,
            openTaskCount,
            epics,
            unreadNotifications,
            unreadCount,
            bankAccounts,
            expenseAgg,
            revenueAgg,
            budgets,
            headcounts,
            rounds,
            investors,
            kpiSnapshots,
        ] = await Promise.all([
            Task.find({ ...baseTask, status: OPEN_STATUSES, dueDate: { $lt: startOfToday } })
                .select('title taskKey status priority dueDate parentTask assignee')
                .populate('parentTask', 'title taskKey')
                .populate('assignee', 'name')
                .sort({ dueDate: 1 }).limit(15),
            Task.find({ ...baseTask, status: OPEN_STATUSES, dueDate: { $gte: startOfToday, $lt: endOfTomorrow } })
                .select('title taskKey status priority dueDate parentTask assignee')
                .populate('parentTask', 'title taskKey')
                .populate('assignee', 'name')
                .sort({ dueDate: 1 }).limit(15),
            Task.find({ ...baseTask, status: OPEN_STATUSES, dueDate: { $gte: startOfToday, $lt: endOfWeek } })
                .select('title taskKey status priority dueDate parentTask assignee')
                .populate('parentTask', 'title taskKey')
                .populate('assignee', 'name')
                .sort({ dueDate: 1 }).limit(50),
            Task.countDocuments({ organization: orgId, isArchived: false, completedAt: { $gte: sevenDaysAgo } }),
            Task.countDocuments({ organization: orgId, isArchived: false, createdAt: { $gte: sevenDaysAgo } }),
            Task.countDocuments({ ...baseTask, status: OPEN_STATUSES }),
            Task.find({ organization: orgId, isArchived: false, taskType: 'epic' })
                .select('title taskKey description parentTask status dueDate')
                .sort({ createdAt: 1 }),
            Notification.find({ recipient: userId, organization: orgId, isRead: false })
                .sort({ createdAt: -1 }).limit(5)
                .populate('relatedTask', 'title taskKey'),
            Notification.countDocuments({ recipient: userId, organization: orgId, isRead: false }),
            BankAccount.find({ organization: orgId }).select('currentBalance accountName'),
            Expense.aggregate([
                { $match: { organization: orgId, date: { $gte: ninetyDaysAgo } } },
                { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
            ]),
            Revenue.aggregate([
                { $match: { organization: orgId, date: { $gte: ninetyDaysAgo } } },
                { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
            ]),
            Budget.find({ organization: orgId, status: 'Active' }).select('name totalBudgetedAmount totalActualSpent'),
            Headcount.find({ organization: orgId }).select('status compensation.totalAnnualCost'),
            Round.find({ organization: orgId }).select('name status targetAmount totalFundsReceived'),
            Investor.find({ organization: orgId }).select('status'),
            ManualKpiSnapshot.find({ organization: orgId }).sort({ snapshotDate: -1 }).limit(2)
                .select('snapshotDate totalRegisteredUsers dau mau'),
        ]);

        // ---- Portfolio: epic cards with child rollups ----
        const epicIds = epics.map(e => e._id);
        const childStats = await Task.aggregate([
            { $match: { organization: orgId, isArchived: false, parentTask: { $in: epicIds } } },
            {
                $group: {
                    _id: '$parentTask',
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    open: { $sum: { $cond: [{ $in: ['$status', ['completed', 'cancelled']] }, 0, 1] } },
                    overdue: {
                        $sum: {
                            $cond: [{
                                $and: [
                                    { $not: [{ $in: ['$status', ['completed', 'cancelled']] }] },
                                    { $lt: ['$dueDate', startOfToday] },
                                    { $ne: ['$dueDate', null] }
                                ]
                            }, 1, 0]
                        }
                    },
                    epicChildren: { $sum: { $cond: [{ $eq: ['$taskType', 'epic'] }, 1, 0] } },
                }
            }
        ]);
        const statsByEpic = Object.fromEntries(childStats.map(s => [String(s._id), s]));

        const portfolio = epics.map(e => {
            const s = statsByEpic[String(e._id)] || { total: 0, completed: 0, open: 0, overdue: 0, epicChildren: 0 };
            return {
                _id: e._id,
                title: e.title,
                taskKey: e.taskKey,
                status: e.status,
                dueDate: e.dueDate,
                parentTask: e.parentTask,
                discussionDay: parseDiscussionDay(e.description),
                childTotal: s.total,
                childCompleted: s.completed,
                childOpen: s.open,
                childOverdue: s.overdue,
                hasEpicChildren: s.epicChildren > 0,
                percentComplete: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
            };
        });

        // ---- Finance rollup (last 90 days averaged to monthly) ----
        const totalBalance = bankAccounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0);
        const expenseTotal90 = expenseAgg[0]?.total || 0;
        const revenueTotal90 = revenueAgg[0]?.total || 0;
        const monthlyBurn = Math.round(expenseTotal90 / 3);
        const monthlyRevenue = Math.round(revenueTotal90 / 3);
        const netMonthlyBurn = monthlyBurn - monthlyRevenue;
        const financeHasData = bankAccounts.length > 0 || (expenseAgg[0]?.count || 0) > 0;
        const runwayMonths = netMonthlyBurn > 0 && totalBalance > 0
            ? Math.round((totalBalance / netMonthlyBurn) * 10) / 10
            : null; // null = not computable (no burn or no balance)

        // Note: actual-spend tracking on budgets is not implemented yet, so
        // this stays empty until budget-vs-actuals lands (Tier 1 work)
        const overBudget = budgets.filter(b => (b.totalActualSpent || 0) > (b.totalBudgetedAmount || 0));

        // ---- Team rollup ----
        const activeHeadcount = headcounts.filter(h => h.status === 'Active');
        const annualTeamCost = activeHeadcount.reduce(
            (sum, h) => sum + (h.compensation?.totalAnnualCost || 0), 0);

        // ---- Fundraising rollup ----
        const openRounds = rounds.filter(r => ['Planning', 'Open', 'Closing'].includes(r.status));
        const totalRaised = rounds.reduce((sum, r) => sum + (r.totalFundsReceived || 0), 0);

        // ---- KPIs ----
        const latestKpi = kpiSnapshots[0] || null;
        const previousKpi = kpiSnapshots[1] || null;

        // ---- Attention items (server-assembled, ordered by urgency) ----
        const attention = [];
        if (financeHasData && runwayMonths !== null && runwayMonths < 6) {
            attention.push({
                type: 'runway',
                severity: runwayMonths < 3 ? 'error' : 'warning',
                title: `Runway: ${runwayMonths} months at current burn`,
                link: '/financials'
            });
        }
        overBudget.forEach(b => attention.push({
            type: 'budget',
            severity: 'warning',
            title: `Budget "${b.name}" exceeded`,
            link: '/budgets'
        }));

        // ---- Setup completeness (replaces the fake health score until there is data) ----
        const setup = {
            tasks: openTaskCount > 0 || epics.length > 0,
            bankAccounts: bankAccounts.length > 0,
            expenses: (expenseAgg[0]?.count || 0) > 0,
            revenue: (revenueAgg[0]?.count || 0) > 0,
            team: headcounts.length > 0,
            kpis: !!latestKpi,
            fundraising: rounds.length > 0 || investors.length > 0,
        };

        res.json({
            generatedAt: now,
            attention,
            notifications: { unreadCount, recent: unreadNotifications },
            tasks: {
                openCount: openTaskCount,
                overdue: overdueTasks,
                dueSoon: dueSoonTasks,
                dueThisWeek,
                velocity: { completedLast7, createdLast7 },
            },
            portfolio,
            finance: {
                hasData: financeHasData,
                totalBalance,
                monthlyBurn,
                monthlyRevenue,
                runwayMonths,
                bankAccountCount: bankAccounts.length,
                overBudgetCount: overBudget.length,
            },
            team: {
                hasData: headcounts.length > 0,
                total: headcounts.length,
                active: activeHeadcount.length,
                annualCost: annualTeamCost,
            },
            fundraising: {
                hasData: rounds.length > 0 || investors.length > 0,
                roundCount: rounds.length,
                openRound: openRounds[0] || null,
                totalRaised,
                investorCount: investors.length,
            },
            kpis: {
                hasData: !!latestKpi,
                latest: latestKpi,
                previous: previousKpi,
            },
            setup,
        });

    } catch (err) {
        console.error('Error building command center:', err.message, err.stack);
        res.status(500).send('Server Error: Could not build dashboard');
    }
};
