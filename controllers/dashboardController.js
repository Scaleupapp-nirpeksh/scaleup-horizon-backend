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
const Commitment = require('../models/commitmentModel');

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
            commitmentAgg,
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
            Commitment.aggregate([
                {
                    $match: {
                        organization: orgId, direction: 'payable', includeInRunway: true,
                        status: { $in: ['pending', 'partially_paid'] },
                    }
                },
                {
                    $group: {
                        _id: null,
                        outstanding: { $sum: { $subtract: ['$totalAmount', '$amountPaid'] } },
                        count: { $sum: 1 },
                    }
                }
            ]),
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

        // ---- Honest runway: cash minus open payable commitments ----
        const commitmentsOutstanding = commitmentAgg[0]?.outstanding || 0;
        const commitmentsCount = commitmentAgg[0]?.count || 0;
        const adjustedBalance = totalBalance - commitmentsOutstanding;
        const adjustedRunwayMonths = netMonthlyBurn > 0 && commitmentsOutstanding > 0
            ? Math.round((Math.max(0, adjustedBalance) / netMonthlyBurn) * 10) / 10
            : null; // null = same as headline runway (nothing pending)

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
        const effectiveRunway = adjustedRunwayMonths !== null ? adjustedRunwayMonths : runwayMonths;
        if (financeHasData && effectiveRunway !== null && effectiveRunway < 6) {
            attention.push({
                type: 'runway',
                severity: effectiveRunway < 3 ? 'error' : 'warning',
                title: adjustedRunwayMonths !== null
                    ? `Runway: ${adjustedRunwayMonths} months after pending commitments`
                    : `Runway: ${runwayMonths} months at current burn`,
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
                commitmentsOutstanding,
                commitmentsCount,
                adjustedRunwayMonths,
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

/**
 * @desc    Preview today's founder briefing (no send)
 * @route   GET /api/horizon/dashboard/briefing/preview
 * @access  Private
 */
exports.previewBriefing = async (req, res) => {
    try {
        const { buildBriefing } = require('../services/briefingService');
        const briefing = await buildBriefing(req.organization._id, { allBusinesses: true });
        if (!briefing) {
            return res.json({ available: false, reason: 'Create business epics to enable briefings' });
        }
        res.json({ available: true, ...briefing });
    } catch (err) {
        console.error('Error previewing briefing:', err.message, err.stack);
        res.status(500).send('Server Error: Could not build briefing');
    }
};

/**
 * @desc    Send the founder briefing to all members right now (all businesses)
 * @route   POST /api/horizon/dashboard/briefing/send
 * @access  Private
 */
exports.sendBriefing = async (req, res) => {
    try {
        const { sendBriefingForOrg } = require('../services/briefingService');
        const result = await sendBriefingForOrg(req.organization._id, { allBusinesses: true });
        if (result.sent === 0) {
            return res.status(400).json({ msg: result.reason || 'Nothing to brief yet' });
        }
        res.json({ msg: `Briefing sent to ${result.sent} member${result.sent === 1 ? '' : 's'} (${result.emailed} email${result.emailed === 1 ? '' : 's'})`, ...result });
    } catch (err) {
        console.error('Error sending briefing:', err.message, err.stack);
        res.status(500).send('Server Error: Could not send briefing');
    }
};

// ------------------------------------------------------------- portfolio

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function nextDiscussionDate(dayName, now) {
    const target = DAY_NAMES.indexOf(dayName);
    if (target === -1) return null;
    const d = new Date(now);
    const diff = (target - d.getDay() + 7) % 7; // 0 = today
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * @desc    Multi-venture portfolio view: one card per business epic with
 *          task rollups, latest decision, last meeting and next discussion.
 * @route   GET /api/horizon/dashboard/portfolio
 * @access  Private (requires active organization)
 */
exports.getPortfolio = async (req, res) => {
    try {
        const Meeting = require('../models/meetingModel');
        const Decision = require('../models/decisionModel');
        const orgId = req.organization._id;
        const now = new Date();
        const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfToday); endOfWeek.setDate(endOfWeek.getDate() + 7);
        const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const epics = await Task.find({ organization: orgId, isArchived: false, taskType: 'epic' })
            .select('title taskKey description status dueDate parentTask createdAt')
            .sort({ createdAt: 1 });

        // "Businesses" are leaf epics — epics without child epics (the master
        // portfolio epic groups the real businesses underneath it)
        const epicIds = new Set(epics.map(e => String(e._id)));
        const hasEpicChildren = new Set(
            epics.filter(e => e.parentTask && epicIds.has(String(e.parentTask))).map(e => String(e.parentTask)));
        const businesses = epics.filter(e => !hasEpicChildren.has(String(e._id)));
        const bizIds = businesses.map(b => b._id);

        const [taskStats, latestDecisions, decisionCounts, lastMeetings] = await Promise.all([
            Task.aggregate([
                { $match: { organization: orgId, isArchived: false, taskType: 'task', parentTask: { $in: bizIds } } },
                {
                    $group: {
                        _id: '$parentTask',
                        total: { $sum: 1 },
                        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                        open: { $sum: { $cond: [{ $not: [{ $in: ['$status', ['completed', 'cancelled']] }] }, 1, 0] } },
                        overdue: {
                            $sum: {
                                $cond: [{
                                    $and: [
                                        { $not: [{ $in: ['$status', ['completed', 'cancelled']] }] },
                                        { $ne: ['$dueDate', null] },
                                        { $lt: ['$dueDate', startOfToday] }
                                    ]
                                }, 1, 0]
                            }
                        },
                        dueThisWeek: {
                            $sum: {
                                $cond: [{
                                    $and: [
                                        { $not: [{ $in: ['$status', ['completed', 'cancelled']] }] },
                                        { $ne: ['$dueDate', null] },
                                        { $gte: ['$dueDate', startOfToday] },
                                        { $lt: ['$dueDate', endOfWeek] }
                                    ]
                                }, 1, 0]
                            }
                        },
                        blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
                        stalled: {
                            $sum: {
                                $cond: [{
                                    $and: [
                                        { $eq: ['$status', 'in_progress'] },
                                        { $lt: ['$updatedAt', sevenDaysAgo] }
                                    ]
                                }, 1, 0]
                            }
                        },
                        completedLast7: {
                            $sum: {
                                $cond: [{
                                    $and: [
                                        { $eq: ['$status', 'completed'] },
                                        { $gte: ['$completedAt', sevenDaysAgo] }
                                    ]
                                }, 1, 0]
                            }
                        },
                    }
                }
            ]),
            Decision.aggregate([
                { $match: { organization: orgId, epic: { $in: bizIds } } },
                { $sort: { decidedAt: -1 } },
                { $group: { _id: '$epic', decision: { $first: '$decision' }, decidedAt: { $first: '$decidedAt' } } }
            ]),
            Decision.aggregate([
                { $match: { organization: orgId, epic: { $in: bizIds }, decidedAt: { $gte: thirtyDaysAgo } } },
                { $group: { _id: '$epic', count: { $sum: 1 } } }
            ]),
            Meeting.aggregate([
                { $match: { organization: orgId, epic: { $in: bizIds }, status: 'ended' } },
                { $sort: { endedAt: -1 } },
                { $group: { _id: '$epic', title: { $first: '$title' }, endedAt: { $first: '$endedAt' } } }
            ]),
        ]);

        const statsMap = Object.fromEntries(taskStats.map(t => [String(t._id), t]));
        const latestDecisionMap = Object.fromEntries(latestDecisions.map(d => [String(d._id), d]));
        const decisionCountMap = Object.fromEntries(decisionCounts.map(d => [String(d._id), d.count]));
        const meetingMap = Object.fromEntries(lastMeetings.map(m => [String(m._id), m]));

        const cards = businesses.map(b => {
            const s = statsMap[String(b._id)] || {
                total: 0, completed: 0, open: 0, overdue: 0,
                dueThisWeek: 0, blocked: 0, stalled: 0, completedLast7: 0,
            };
            const discussionDay = parseDiscussionDay(b.description);
            return {
                _id: b._id,
                title: b.title,
                taskKey: b.taskKey,
                status: b.status,
                dueDate: b.dueDate,
                discussionDay,
                nextDiscussion: discussionDay ? nextDiscussionDate(discussionDay, now) : null,
                tasks: {
                    total: s.total, completed: s.completed, open: s.open,
                    overdue: s.overdue, dueThisWeek: s.dueThisWeek,
                    blocked: s.blocked, stalled: s.stalled, completedLast7: s.completedLast7,
                    percentComplete: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
                },
                latestDecision: latestDecisionMap[String(b._id)] || null,
                decisionsLast30: decisionCountMap[String(b._id)] || 0,
                lastMeeting: meetingMap[String(b._id)] || null,
            };
        });

        res.json({
            generatedAt: now,
            businesses: cards,
            totals: {
                businesses: cards.length,
                open: cards.reduce((a, c) => a + c.tasks.open, 0),
                overdue: cards.reduce((a, c) => a + c.tasks.overdue, 0),
                completedLast7: cards.reduce((a, c) => a + c.tasks.completedLast7, 0),
                decisionsLast30: cards.reduce((a, c) => a + c.decisionsLast30, 0),
            },
        });
    } catch (err) {
        console.error('Error building portfolio:', err.message, err.stack);
        res.status(500).send('Server Error: Could not build portfolio view');
    }
};
