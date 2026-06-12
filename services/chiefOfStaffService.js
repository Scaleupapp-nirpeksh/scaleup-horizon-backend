// services/chiefOfStaffService.js
// The AI Chief of Staff. Two layers:
//   1. A deterministic insight engine (buildBrief) — scans tasks, money,
//      fundraising, growth and meetings, and produces ranked insights plus
//      a top-3 focus list. Always available, never hallucinates.
//   2. An optional conversational layer (answerQuestion) — when
//      ANTHROPIC_API_KEY is set in the server env, questions are answered
//      by Claude against a live org snapshot.
const Task = require('../models/taskModel');
const BankAccount = require('../models/bankAccountModel');
const Expense = require('../models/expenseModel');
const Revenue = require('../models/revenueModel');
const Commitment = require('../models/commitmentModel');
const Round = require('../models/roundModel');
const Investor = require('../models/investorModel');
const ManualKpiSnapshot = require('../models/manualKpiSnapshotModel');
const Meeting = require('../models/meetingModel');
const Decision = require('../models/decisionModel');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.scaleuphorizon.com';
const OPEN = { $nin: ['completed', 'cancelled'] };
const ACTIVE_PIPELINE = ['Lead', 'Contacted', 'Introduced', 'Pitched', 'Follow-up', 'Negotiating', 'Soft Committed', 'Hard Committed'];

const fmtINR = (n) => {
    if (n === null || n === undefined) return '—';
    const abs = Math.abs(n);
    if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
    if (abs >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

const daysAgo = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

function parseDiscussionDay(description) {
    const m = /Weekly discussion day:\s*([A-Za-z]+)/.exec(description || '');
    return m ? m[1] : null;
}

// ------------------------------------------------------------ snapshot

async function buildSnapshot(orgId) {
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
    const d14 = new Date(now); d14.setDate(d14.getDate() - 14);
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const d60 = new Date(now); d60.setDate(d60.getDate() - 60);
    const d90 = new Date(now); d90.setDate(d90.getDate() - 90);

    const [
        epics, openTasks, completedLast7, completedPrior7,
        accounts, exp30, expPrior30, exp90, rev90,
        commitments, rounds, investors, kpiSnapshots,
        lastMeeting, decisionsLast7,
    ] = await Promise.all([
        Task.find({ organization: orgId, isArchived: false, taskType: 'epic' })
            .select('title taskKey description status'),
        Task.find({ organization: orgId, isArchived: false, taskType: 'task', status: OPEN })
            .select('title taskKey status priority dueDate parentTask updatedAt assignee'),
        Task.countDocuments({ organization: orgId, isArchived: false, completedAt: { $gte: d7 } }),
        Task.countDocuments({ organization: orgId, isArchived: false, completedAt: { $gte: d14, $lt: d7 } }),
        BankAccount.find({ organization: orgId }).select('currentBalance'),
        Expense.aggregate([{ $match: { organization: orgId, date: { $gte: d30 } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Expense.aggregate([{ $match: { organization: orgId, date: { $gte: d60, $lt: d30 } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Expense.aggregate([{ $match: { organization: orgId, date: { $gte: d90 } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
        Revenue.aggregate([{ $match: { organization: orgId, date: { $gte: d90 } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Commitment.find({ organization: orgId, status: { $in: ['pending', 'partially_paid'] } })
            .select('direction counterparty title totalAmount amountPaid payWhen dueDate includeInRunway category'),
        Round.find({ organization: orgId }).select('name status targetAmount totalFundsReceived'),
        Investor.find({ organization: orgId })
            .select('name status nextFollowUpDate lastContactedAt expectedAmount totalCommittedAmount roundId'),
        ManualKpiSnapshot.find({ organization: orgId }).sort({ snapshotDate: -1 }).limit(2)
            .select('snapshotDate totalRegisteredUsers dau mau'),
        Meeting.findOne({ organization: orgId, status: 'ended' }).sort({ endedAt: -1 })
            .select('title endedAt actionItems epic')
            .populate('actionItems', 'title taskKey status'),
        Decision.countDocuments({ organization: orgId, decidedAt: { $gte: d7 } }),
    ]);

    return {
        now, startOfToday,
        epics, openTasks, completedLast7, completedPrior7,
        cash: accounts.reduce((s, a) => s + (a.currentBalance || 0), 0),
        hasFinanceData: accounts.length > 0 || (exp90[0]?.count || 0) > 0,
        burn30: exp30[0]?.total || 0,
        burnPrior30: expPrior30[0]?.total || 0,
        monthlyBurn: Math.round((exp90[0]?.total || 0) / 3),
        monthlyRevenue: Math.round((rev90[0]?.total || 0) / 3),
        commitments, rounds, investors, kpiSnapshots,
        lastMeeting, decisionsLast7,
    };
}

// ------------------------------------------------------------- insights

function buildInsights(s) {
    const insights = [];
    const add = (severity, area, title, detail, link) =>
        insights.push({ severity, area, title, detail, link });

    const epicById = Object.fromEntries(s.epics.map(e => [String(e._id), e]));

    // ---- Tasks ----
    const overdue = s.openTasks.filter(t => t.dueDate && new Date(t.dueDate) < s.startOfToday);
    if (overdue.length) {
        const byEpic = {};
        overdue.forEach(t => {
            const k = t.parentTask ? String(t.parentTask) : 'none';
            byEpic[k] = (byEpic[k] || 0) + 1;
        });
        const worstKey = Object.keys(byEpic).sort((a, b) => byEpic[b] - byEpic[a])[0];
        const worstEpic = epicById[worstKey];
        const oldest = Math.max(...overdue.map(t => daysAgo(t.dueDate)));
        add(overdue.length >= 5 ? 'critical' : 'warning', 'tasks',
            `${overdue.length} task${overdue.length === 1 ? ' is' : 's are'} overdue`,
            `Oldest is ${oldest} day${oldest === 1 ? '' : 's'} late${worstEpic ? `; most are in ${worstEpic.title}` : ''}. Reschedule or close them — a board you don't trust stops being useful.`,
            '/tasks');
    }
    const blocked = s.openTasks.filter(t => t.status === 'blocked');
    if (blocked.length) {
        add('warning', 'tasks', `${blocked.length} task${blocked.length === 1 ? '' : 's'} blocked`,
            `${blocked.slice(0, 3).map(t => t.taskKey).join(', ')}${blocked.length > 3 ? '…' : ''} — unblock these before they stall the week.`,
            '/tasks');
    }
    const stalled = s.openTasks.filter(t => t.status === 'in_progress' && daysAgo(t.updatedAt) >= 7);
    if (stalled.length) {
        add('info', 'tasks', `${stalled.length} in-progress task${stalled.length === 1 ? '' : 's'} untouched for 7+ days`,
            'In progress but not moving. Either they are bigger than scoped, or they quietly died — decide which.',
            '/tasks');
    }
    if (s.completedPrior7 >= 4 && s.completedLast7 < s.completedPrior7 * 0.6) {
        add('warning', 'tasks', 'Completion velocity dropped',
            `${s.completedLast7} tasks closed this week vs ${s.completedPrior7} last week. Worth asking why on your next discussion day.`,
            '/tasks');
    } else if (s.completedLast7 >= 5 && s.completedLast7 > s.completedPrior7) {
        add('win', 'tasks', `${s.completedLast7} tasks shipped in the last 7 days`,
            `Up from ${s.completedPrior7} the week before. Momentum is real.`, '/tasks');
    }

    // ---- Money ----
    if (s.hasFinanceData) {
        const net = s.monthlyBurn - s.monthlyRevenue;
        const pending = s.commitments
            .filter(c => c.direction === 'payable' && c.includeInRunway)
            .reduce((sum, c) => sum + Math.max(0, c.totalAmount - (c.amountPaid || 0)), 0);
        const runway = net > 0 && s.cash > 0 ? s.cash / net : null;
        const honest = net > 0 && pending > 0 ? Math.max(0, s.cash - pending) / net : null;
        const effective = honest !== null ? honest : runway;
        if (effective !== null && effective < 6) {
            add(effective < 3 ? 'critical' : 'warning', 'money',
                `${effective.toFixed(1)} months of honest runway`,
                `Cash ${fmtINR(s.cash)}${pending ? ` minus ${fmtINR(pending)} pending commitments` : ''} at ${fmtINR(net)}/mo net burn. ${effective < 3 ? 'Funding is now the only priority.' : 'Start the funding conversation before month 4.'}`,
                '/financials');
        }
        if (s.burnPrior30 > 10000 && s.burn30 > s.burnPrior30 * 1.3) {
            add('warning', 'money', `Burn up ${Math.round(((s.burn30 / s.burnPrior30) - 1) * 100)}% month-over-month`,
                `${fmtINR(s.burn30)} spent in the last 30 days vs ${fmtINR(s.burnPrior30)} the 30 before. Check what changed.`,
                '/financials');
        }
        const openRound = s.rounds.find(r => ['Open', 'Closing'].includes(r.status));
        if (pending > 0 && openRound) {
            add('info', 'money', `${fmtINR(pending)} in commitments unlocks when ${openRound.name} closes`,
                'Team dues and reimbursements are queued behind the round — one more reason to push it over the line.',
                '/financials');
        }
    }

    // ---- Fundraising ----
    const openRounds = s.rounds.filter(r => ['Open', 'Closing'].includes(r.status));
    openRounds.forEach(r => {
        if (r.targetAmount > 0) {
            const pct = Math.round(((r.totalFundsReceived || 0) / r.targetAmount) * 100);
            add(pct < 50 ? 'info' : 'win', 'fundraising',
                `${r.name}: ${pct}% of ${fmtINR(r.targetAmount)} received`,
                `${fmtINR(r.totalFundsReceived || 0)} in the bank against the target.`,
                '/fundraising');
        }
    });
    const activeInvestors = s.investors.filter(i => ACTIVE_PIPELINE.includes(i.status));
    const overdueFollowUps = activeInvestors.filter(i => i.nextFollowUpDate && new Date(i.nextFollowUpDate) < s.startOfToday);
    if (overdueFollowUps.length) {
        add('warning', 'fundraising',
            `${overdueFollowUps.length} investor follow-up${overdueFollowUps.length === 1 ? '' : 's'} overdue`,
            `${overdueFollowUps.slice(0, 3).map(i => i.name).join(', ')}${overdueFollowUps.length > 3 ? '…' : ''}. Investors go cold fast — close the loop today.`,
            '/fundraising');
    }
    const goneQuiet = activeInvestors.filter(i =>
        !overdueFollowUps.includes(i) && i.lastContactedAt && daysAgo(i.lastContactedAt) > 14 && !i.nextFollowUpDate);
    if (goneQuiet.length) {
        add('info', 'fundraising',
            `${goneQuiet.length} active prospect${goneQuiet.length === 1 ? '' : 's'} with no contact in 2+ weeks`,
            `${goneQuiet.slice(0, 3).map(i => i.name).join(', ')}${goneQuiet.length > 3 ? '…' : ''} — no follow-up scheduled either. Park them or ping them.`,
            '/fundraising');
    }
    const committed = s.investors.filter(i => ['Soft Committed', 'Hard Committed'].includes(i.status));
    if (committed.length) {
        const sum = committed.reduce((acc, i) => acc + (i.totalCommittedAmount || i.expectedAmount || 0), 0);
        add('win', 'fundraising', `${fmtINR(sum)} committed across ${committed.length} investor${committed.length === 1 ? '' : 's'}`,
            'Get the paperwork moving while the yes is warm.', '/fundraising');
    }

    // ---- Growth ----
    if (s.kpiSnapshots.length) {
        const latest = s.kpiSnapshots[0];
        const age = daysAgo(latest.snapshotDate);
        if (age > 14) {
            add('info', 'growth', `KPI numbers are ${age} days old`,
                'Take a fresh snapshot so dashboards, briefings and investor updates show current numbers.',
                '/kpis');
        }
        if (s.kpiSnapshots.length === 2) {
            const prev = s.kpiSnapshots[1];
            if (prev.totalRegisteredUsers > 0 && latest.totalRegisteredUsers > prev.totalRegisteredUsers * 1.1) {
                add('win', 'growth', `Users up ${Math.round(((latest.totalRegisteredUsers / prev.totalRegisteredUsers) - 1) * 100)}% since last snapshot`,
                    `${prev.totalRegisteredUsers.toLocaleString('en-IN')} → ${latest.totalRegisteredUsers.toLocaleString('en-IN')} registered users.`,
                    '/kpis');
            }
        }
    }

    // ---- Meetings / cadence ----
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
    const todaysEpic = s.epics.find(e => parseDiscussionDay(e.description) === todayName);
    if (todaysEpic) {
        const epicOverdue = overdue.filter(t => String(t.parentTask) === String(todaysEpic._id)).length;
        const epicOpen = s.openTasks.filter(t => String(t.parentTask) === String(todaysEpic._id)).length;
        add('info', 'meetings', `Today is ${todayName} — ${todaysEpic.title} discussion day`,
            epicOpen === 0
                ? 'The board is empty. Use the session to break the plan into first tasks.'
                : `${epicOpen} open task${epicOpen === 1 ? '' : 's'}${epicOverdue ? `, ${epicOverdue} overdue` : ''}. Start a meeting to run the session against the board.`,
            '/meetings');
    }
    if (s.lastMeeting) {
        const openItems = (s.lastMeeting.actionItems || []).filter(t => !['completed', 'cancelled'].includes(t.status));
        if (openItems.length && daysAgo(s.lastMeeting.endedAt) >= 3) {
            add('info', 'meetings',
                `${openItems.length} action item${openItems.length === 1 ? '' : 's'} still open from "${s.lastMeeting.title}"`,
                `${openItems.slice(0, 3).map(t => t.taskKey).join(', ')}${openItems.length > 3 ? '…' : ''} — carried over from ${daysAgo(s.lastMeeting.endedAt)} days ago.`,
                '/meetings');
        }
    }
    if (s.decisionsLast7 > 0) {
        add('win', 'meetings', `${s.decisionsLast7} decision${s.decisionsLast7 === 1 ? '' : 's'} logged this week`,
            'The decision log is doing its job — future-you will thank present-you.', '/meetings');
    }

    return insights;
}

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2, win: 3 };

async function buildBrief(orgId) {
    const snapshot = await buildSnapshot(orgId);
    const insights = buildInsights(snapshot)
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

    // Top-3 focus: the highest-ranked non-win insights become today's focus
    const focus = insights.filter(i => i.severity !== 'win').slice(0, 3)
        .map(i => ({ title: i.title, detail: i.detail, link: i.link, area: i.area }));

    return {
        generatedAt: new Date(),
        focus,
        insights,
        stats: {
            openTasks: snapshot.openTasks.length,
            overdue: snapshot.openTasks.filter(t => t.dueDate && new Date(t.dueDate) < snapshot.startOfToday).length,
            completedLast7: snapshot.completedLast7,
            cash: snapshot.cash,
            monthlyBurn: snapshot.monthlyBurn,
            activeInvestors: snapshot.investors.filter(i => ACTIVE_PIPELINE.includes(i.status)).length,
            decisionsLast7: snapshot.decisionsLast7,
        },
    };
}

// ------------------------------------------------------ conversational

function askAvailable() {
    return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Answer a founder question against a live org snapshot using Claude.
 * Requires ANTHROPIC_API_KEY in the server environment.
 */
async function answerQuestion(orgId, question) {
    if (!askAvailable()) {
        return { available: false };
    }
    const snapshot = await buildSnapshot(orgId);
    const brief = buildInsights(snapshot);

    // Compact, non-sensitive snapshot for the model
    const context = {
        date: new Date().toISOString().slice(0, 10),
        businesses: snapshot.epics.map(e => ({ key: e.taskKey, title: e.title, discussionDay: parseDiscussionDay(e.description) })),
        tasks: {
            open: snapshot.openTasks.length,
            overdue: snapshot.openTasks.filter(t => t.dueDate && new Date(t.dueDate) < snapshot.startOfToday)
                .map(t => ({ key: t.taskKey, title: t.title, daysLate: daysAgo(t.dueDate) })).slice(0, 25),
            completedLast7: snapshot.completedLast7,
        },
        money: {
            cash: snapshot.cash,
            monthlyBurn: snapshot.monthlyBurn,
            monthlyRevenue: snapshot.monthlyRevenue,
            pendingCommitments: snapshot.commitments.map(c => ({
                who: c.counterparty, what: c.title, outstanding: Math.max(0, c.totalAmount - (c.amountPaid || 0)),
                direction: c.direction, when: c.payWhen || c.dueDate,
            })),
        },
        fundraising: {
            rounds: snapshot.rounds.map(r => ({ name: r.name, status: r.status, target: r.targetAmount, received: r.totalFundsReceived })),
            pipeline: snapshot.investors.map(i => ({
                name: i.name, stage: i.status,
                expected: i.expectedAmount || undefined, committed: i.totalCommittedAmount || undefined,
                nextFollowUp: i.nextFollowUpDate || undefined,
            })),
        },
        kpis: snapshot.kpiSnapshots[0] || null,
        insights: brief.map(i => `[${i.severity}] ${i.title}: ${i.detail}`),
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: process.env.CHIEF_OF_STAFF_MODEL || 'claude-sonnet-4-6',
            max_tokens: 1000,
            system: `You are the Chief of Staff for a startup founder using ScaleUp Horizon. You have their live company snapshot below. Answer their question directly and concretely, in plain text (no markdown headers), with specific numbers from the snapshot. Amounts are INR. If the data cannot answer the question, say what is missing — never invent numbers. Keep answers under 200 words unless asked for detail.\n\nCOMPANY SNAPSHOT:\n${JSON.stringify(context)}`,
            messages: [{ role: 'user', content: String(question).slice(0, 2000) }],
        }),
    });

    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error('Chief of Staff LLM call failed:', res.status, errBody.slice(0, 300));
        throw new Error(`LLM request failed (${res.status})`);
    }
    const data = await res.json();
    const answer = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return { available: true, answer };
}

module.exports = { buildBrief, answerQuestion, askAvailable };
