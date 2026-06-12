// services/briefingService.js
// The Founder Briefing: one email per member each morning. Businesses whose
// weekly discussion day is today get a full section (overdue, due-this-week,
// wins, stalled items, suggested agenda); the rest get one-line summaries.
// A short in-app copy lands in the notification bell.
const mongoose = require('mongoose');
const Task = require('../models/taskModel');
const Expense = require('../models/expenseModel');
const Revenue = require('../models/revenueModel');
const BankAccount = require('../models/bankAccountModel');
const Membership = require('../models/membershipModel');
const Organization = require('../models/organizationModel');
const { notifyUsers, emailUsers } = require('./notificationService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.scaleuphorizon.com';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const OPEN = { $nin: ['completed', 'cancelled'] };

const fmtINR = (v) => {
    const abs = Math.abs(v || 0);
    if (abs >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
    if (abs >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    return `₹${Math.round(v || 0).toLocaleString('en-IN')}`;
};
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const taskLine = (t) => `  • ${t.taskKey ? t.taskKey + '  ' : ''}${t.title}${t.dueDate ? ` — due ${fmtDate(t.dueDate)}` : ''}`;

function parseDiscussionDay(description) {
    const m = /Weekly discussion day:\s*([A-Za-z]+)/.exec(description || '');
    return m ? m[1] : null;
}

async function collectEpicData(orgId, epic, now) {
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfToday); endOfWeek.setDate(endOfWeek.getDate() + 7);
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const base = { organization: orgId, isArchived: false, parentTask: epic._id };
    const sel = 'title taskKey status dueDate lastActivityAt';

    const [children, overdue, dueThisWeek, doneLastWeek] = await Promise.all([
        Task.find(base).select('status dueDate'),
        Task.find({ ...base, status: OPEN, dueDate: { $lt: startOfToday } }).select(sel).sort({ dueDate: 1 }).limit(8),
        Task.find({ ...base, status: OPEN, dueDate: { $gte: startOfToday, $lt: endOfWeek } }).select(sel).sort({ dueDate: 1 }).limit(8),
        Task.find({ ...base, status: 'completed', completedAt: { $gte: sevenDaysAgo } }).select(sel).limit(8),
    ]);

    const total = children.length;
    const done = children.filter(c => c.status === 'completed').length;
    const open = children.filter(c => !['completed', 'cancelled'].includes(c.status)).length;
    const blocked = children.filter(c => c.status === 'blocked').length;
    const undated = children.filter(c => !c.dueDate && !['completed', 'cancelled'].includes(c.status)).length;

    const stalled = await Task.find({
        ...base, status: 'in_progress', lastActivityAt: { $lt: sevenDaysAgo }
    }).select(sel).limit(5);

    return {
        epic, total, done, open, blocked, undated,
        pct: total > 0 ? Math.round((done / total) * 100) : 0,
        overdue, dueThisWeek, doneLastWeek, stalled,
    };
}

function renderBusinessSection(d) {
    const name = d.epic.title.replace(/\s*[—-]\s*5-Month Plan.*$/i, '');
    const lines = [];
    lines.push(`━━ ${name.toUpperCase()} ━━  ${d.done}/${d.total} done (${d.pct}%)`);

    if (d.overdue.length) {
        lines.push(`⚠ OVERDUE (${d.overdue.length})`);
        d.overdue.forEach(t => lines.push(taskLine(t)));
    }
    if (d.dueThisWeek.length) {
        lines.push(`THIS WEEK (${d.dueThisWeek.length})`);
        d.dueThisWeek.forEach(t => lines.push(taskLine(t)));
    }
    if (d.doneLastWeek.length) {
        lines.push(`DONE LAST 7 DAYS (${d.doneLastWeek.length}) 🎉`);
        d.doneLastWeek.forEach(t => lines.push(taskLine(t)));
    }
    if (d.stalled.length) {
        lines.push(`STALLED — no activity in 7+ days (${d.stalled.length})`);
        d.stalled.forEach(t => lines.push(taskLine(t)));
    }

    // Suggested agenda for today's discussion
    const agenda = [];
    if (d.overdue.length) agenda.push(`Reschedule or finish the ${d.overdue.length} overdue item${d.overdue.length === 1 ? '' : 's'}`);
    if (d.blocked > 0) agenda.push(`Unblock the ${d.blocked} blocked task${d.blocked === 1 ? '' : 's'}`);
    if (d.stalled.length) agenda.push(`Revive or drop the ${d.stalled.length} stalled task${d.stalled.length === 1 ? '' : 's'}`);
    if (d.undated > 0) agenda.push(`Put dates on the ${d.undated} undated open task${d.undated === 1 ? '' : 's'}`);
    if (d.open === 0 && d.total > 0) agenda.push('All tasks closed — plan the next set of priorities');
    if (d.total === 0) agenda.push('No tasks yet — break this plan into first tasks');
    if (agenda.length) {
        lines.push('AGENDA SUGGESTIONS');
        agenda.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`));
    }

    lines.push(`Board: ${FRONTEND_URL}/tasks?epic=${d.epic._id}`);
    return lines.join('\n');
}

async function financeLine(orgId, now) {
    const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const [accounts, expAgg, revAgg] = await Promise.all([
        BankAccount.find({ organization: orgId }).select('currentBalance'),
        Expense.aggregate([{ $match: { organization: orgId, date: { $gte: ninetyDaysAgo } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
        Revenue.aggregate([{ $match: { organization: orgId, date: { $gte: ninetyDaysAgo } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);
    if (accounts.length === 0 && !(expAgg[0]?.count > 0)) {
        return 'MONEY  — add bank accounts & expenses to see cash, burn and runway here.';
    }
    const cash = accounts.reduce((s, a) => s + (a.currentBalance || 0), 0);
    const burn = Math.round((expAgg[0]?.total || 0) / 3);
    const rev = Math.round((revAgg[0]?.total || 0) / 3);
    const net = burn - rev;
    const runway = net > 0 && cash > 0 ? (cash / net).toFixed(1) + ' mo' : '—';
    return `MONEY  Cash ${fmtINR(cash)} · Burn ${fmtINR(burn)}/mo · Revenue ${fmtINR(rev)}/mo · Runway ${runway}`;
}

/**
 * Build the briefing for an organization.
 * @param {ObjectId} orgId
 * @param {Object} opts { allBusinesses: boolean } — true = feature every
 *        business (manual "send now"); false = feature only businesses whose
 *        discussion day is today, compact lines for the rest.
 * @returns null when the org has no business epics.
 */
async function buildBriefing(orgId, { allBusinesses = false } = {}) {
    const now = new Date();
    const todayName = WEEKDAYS[now.getDay()];

    const epics = await Task.find({ organization: orgId, isArchived: false, taskType: 'epic' })
        .select('title taskKey description');
    if (epics.length === 0) return null;

    // Leaf business epics = epics that are not parents of other epics
    const epicIds = new Set(epics.map(e => String(e._id)));
    const parentEpicIds = new Set(
        (await Task.find({ organization: orgId, taskType: 'epic', parentTask: { $in: [...epicIds].map(id => new mongoose.Types.ObjectId(id)) } })
            .select('parentTask')).map(t => String(t.parentTask))
    );
    const businesses = epics.filter(e => !parentEpicIds.has(String(e._id)))
        .map(e => ({ epic: e, discussionDay: parseDiscussionDay(e.description) }));
    if (businesses.length === 0) return null;

    const featured = businesses.filter(b => allBusinesses || b.discussionDay === todayName);
    const rest = businesses.filter(b => !featured.includes(b));

    const sections = [];
    let totals = { overdue: 0, dueThisWeek: 0 };

    for (const b of featured) {
        const d = await collectEpicData(orgId, b.epic, now);
        totals.overdue += d.overdue.length;
        totals.dueThisWeek += d.dueThisWeek.length;
        sections.push(renderBusinessSection(d));
    }

    const restLines = [];
    for (const b of rest) {
        const d = await collectEpicData(orgId, b.epic, now);
        totals.overdue += d.overdue.length;
        totals.dueThisWeek += d.dueThisWeek.length;
        const name = b.epic.title.replace(/\s*[—-]\s*5-Month Plan.*$/i, '');
        restLines.push(`  • ${name}: ${d.done}/${d.total} done`
            + (d.overdue.length ? ` · ${d.overdue.length} overdue` : '')
            + (d.dueThisWeek.length ? ` · ${d.dueThisWeek.length} due this week` : '')
            + (b.discussionDay ? `  (discussion: ${b.discussionDay})` : ''));
    }

    const money = await financeLine(orgId, now);
    const dateLabel = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    const header = featured.length > 0
        ? `☀️ Founder Briefing — ${dateLabel}\nToday's discussion: ${featured.map(b => b.epic.title.replace(/\s*[—-]\s*5-Month Plan.*$/i, '')).join(', ')}`
        : `☀️ Founder Briefing — ${dateLabel}`;

    const parts = [header, money, ...sections];
    if (restLines.length) parts.push('OTHER BUSINESSES\n' + restLines.join('\n'));
    parts.push(`Open your command center: ${FRONTEND_URL}/dashboard`);
    parts.push('—\nScaleUp Horizon · your daily founder briefing');
    const body = parts.join('\n\n');

    const subject = featured.length > 0
        ? `${featured.map(b => b.epic.title.replace(/\s*[—-]\s*5-Month Plan.*$/i, '')).join(' + ')} briefing — `
          + (totals.overdue ? `${totals.overdue} overdue, ` : '') + `${totals.dueThisWeek} due this week`
        : `Founder briefing — ${totals.overdue} overdue, ${totals.dueThisWeek} due this week`;

    const summary = `${totals.overdue} overdue · ${totals.dueThisWeek} due this week across ${businesses.length} businesses`;
    const primaryEpicId = featured[0]?.epic._id || businesses[0].epic._id;

    return { subject, body, summary, primaryEpicId, featuredCount: featured.length };
}

/** Send the briefing to all active members of one organization. */
async function sendBriefingForOrg(orgId, { allBusinesses = false } = {}) {
    const briefing = await buildBriefing(orgId, { allBusinesses });
    if (!briefing) return { sent: 0, reason: 'no business epics' };
    if (!allBusinesses && briefing.featuredCount === 0) {
        return { sent: 0, reason: 'no business has its discussion day today' };
    }

    const members = await Membership.find({ organization: orgId, status: 'active' }).select('user');
    const recipientIds = members.map(m => m.user);

    const emailResult = await emailUsers({
        recipientIds,
        subject: briefing.subject,
        body: briefing.body,
    });

    await notifyUsers({
        organizationId: orgId,
        recipientIds,
        actorId: null,
        type: 'briefing',
        title: briefing.subject,
        message: briefing.summary,
        taskId: briefing.primaryEpicId,
        email: false, // full email already sent above
    });

    return { sent: recipientIds.length, emailed: emailResult.sent, subject: briefing.subject };
}

/** Daily cron entry: brief every organization that has a discussion today. */
async function runDailyBriefings() {
    const orgIds = await Task.distinct('organization', { taskType: 'epic', isArchived: false });
    const results = [];
    for (const orgId of orgIds) {
        try {
            const r = await sendBriefingForOrg(orgId, { allBusinesses: false });
            if (r.sent > 0) results.push({ orgId: String(orgId), ...r });
        } catch (err) {
            console.error(`Briefing failed for org ${orgId}:`, err.message);
        }
    }
    console.log(`Daily briefings: ${results.length} organization(s) briefed`);
    return results;
}

module.exports = { buildBriefing, sendBriefingForOrg, runDailyBriefings };
