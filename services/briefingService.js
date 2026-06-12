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

// ---------- HTML rendering (email-safe inline styles) ----------
const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Restrained, professional palette — solid colors only (gradients and
// background tricks get stripped by mail clients), dark text on white.
const C = {
    indigo: '#4f46e5', red: '#b91c1c', amber: '#92600a', green: '#047857',
    grey: '#6b7280', greyLight: '#9ca3af', greyBg: '#f9fafb',
    text: '#1f2937', border: '#e5e7eb',
};

function htmlTaskRow(t) {
    return `<tr>
      <td style="padding:5px 0;font-size:14px;color:${C.text};line-height:1.45;">
        <span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:${C.greyLight};">${esc(t.taskKey || '')}</span>
        &nbsp;${esc(t.title)}
        ${t.dueDate ? `<span style="font-size:12px;color:${C.grey};">&nbsp;— due ${esc(fmtDate(t.dueDate))}</span>` : ''}
      </td></tr>`;
}

function htmlSection(label, tasks, color) {
    if (!tasks.length) return '';
    return `<div style="margin:14px 0 0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${color};padding-bottom:2px;border-bottom:1px solid ${C.border};">${label} (${tasks.length})</div>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:4px;">${tasks.map(t => htmlTaskRow(t)).join('')}</table>
    </div>`;
}

function renderBusinessHtml(d) {
    const name = d.epic.title.replace(/\s*[—-]\s*5-Month Plan.*$/i, '');

    const agenda = [];
    if (d.overdue.length) agenda.push(`Reschedule or finish the ${d.overdue.length} overdue item${d.overdue.length === 1 ? '' : 's'}`);
    if (d.blocked > 0) agenda.push(`Unblock the ${d.blocked} blocked task${d.blocked === 1 ? '' : 's'}`);
    if (d.stalled.length) agenda.push(`Revive or drop the ${d.stalled.length} stalled task${d.stalled.length === 1 ? '' : 's'}`);
    if (d.undated > 0) agenda.push(`Put dates on the ${d.undated} undated open task${d.undated === 1 ? '' : 's'}`);
    if (d.open === 0 && d.total > 0) agenda.push('All tasks closed — plan the next set of priorities');
    if (d.total === 0) agenda.push('No tasks yet — break this plan into first tasks');

    return `
    <div style="border:1px solid ${C.border};border-radius:8px;padding:18px 22px;margin:0 0 14px;">
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td style="font-size:16px;font-weight:700;color:${C.text};">${esc(name)}</td>
          <td align="right" style="font-size:13px;color:${C.grey};white-space:nowrap;">${d.done} of ${d.total} done (${d.pct}%)</td>
        </tr>
      </table>
      ${d.total > 0 ? `<div style="background:${C.greyBg};height:5px;margin:10px 0 2px;border-radius:3px;">
        <div style="background:${C.indigo};height:5px;width:${Math.max(d.pct, 1)}%;border-radius:3px;"></div>
      </div>` : ''}
      ${htmlSection('OVERDUE', d.overdue, C.red)}
      ${htmlSection('DUE THIS WEEK', d.dueThisWeek, C.amber)}
      ${htmlSection('COMPLETED LAST 7 DAYS', d.doneLastWeek, C.green)}
      ${htmlSection('STALLED FOR 7+ DAYS', d.stalled, C.grey)}
      ${agenda.length ? `
      <div style="margin-top:14px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${C.grey};padding-bottom:2px;border-bottom:1px solid ${C.border};">SUGGESTED AGENDA</div>
        ${agenda.map((a, i) => `<div style="font-size:14px;color:${C.text};padding:4px 0 0;line-height:1.45;">${i + 1}. ${esc(a)}</div>`).join('')}
      </div>` : ''}
      <div style="margin-top:14px;font-size:13px;">
        <a href="${FRONTEND_URL}/tasks?epic=${d.epic._id}" style="color:${C.indigo};font-weight:600;text-decoration:none;">Open ${esc(name)} board →</a>
      </div>
    </div>`;
}

function renderHtmlEmail({ dateLabel, discussionNames, moneyHtml, sectionHtml, restRowsHtml, summary }) {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table cellpadding="0" cellspacing="0" style="width:100%;background:#ffffff;"><tr><td align="center" style="padding:28px 14px;">
    <table cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

      <tr><td style="border-top:3px solid ${C.indigo};padding:22px 2px 18px;">
        <div style="font-size:20px;font-weight:700;color:${C.text};">Founder Briefing</div>
        <div style="font-size:13px;color:${C.grey};margin-top:3px;">${esc(dateLabel)}${discussionNames ? ` · Today's discussion: ${esc(discussionNames)}` : ''}</div>
        <div style="font-size:13px;color:${C.text};margin-top:8px;font-weight:600;">${esc(summary)}</div>
      </td></tr>

      <tr><td style="padding:0 2px;">
        ${moneyHtml}
        ${sectionHtml}
        ${restRowsHtml}
        <div style="margin-top:6px;font-size:13px;">
          <a href="${FRONTEND_URL}/dashboard" style="color:${C.indigo};font-weight:600;text-decoration:none;">Open your command center →</a>
        </div>
      </td></tr>

      <tr><td style="padding:22px 2px;">
        <div style="border-top:1px solid ${C.border};padding-top:12px;font-size:11px;color:${C.greyLight};line-height:1.6;">
          ScaleUp Horizon — your daily founder briefing.<br/>
          Sent automatically every morning at 7:30 on each business's discussion day.
        </div>
      </td></tr>

    </table>
  </td></tr></table>
</body></html>`;
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

async function financeData(orgId, now) {
    const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const Commitment = require('../models/commitmentModel');
    const [accounts, expAgg, revAgg, commitAgg] = await Promise.all([
        BankAccount.find({ organization: orgId }).select('currentBalance'),
        Expense.aggregate([{ $match: { organization: orgId, date: { $gte: ninetyDaysAgo } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
        Revenue.aggregate([{ $match: { organization: orgId, date: { $gte: ninetyDaysAgo } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Commitment.aggregate([
            { $match: { organization: orgId, direction: 'payable', includeInRunway: true, status: { $in: ['pending', 'partially_paid'] } } },
            { $group: { _id: null, outstanding: { $sum: { $subtract: ['$totalAmount', '$amountPaid'] } } } }
        ]),
    ]);
    const pending = commitAgg[0]?.outstanding || 0;
    if (accounts.length === 0 && !(expAgg[0]?.count > 0) && pending === 0) return { hasData: false };
    const cash = accounts.reduce((s, a) => s + (a.currentBalance || 0), 0);
    const burn = Math.round((expAgg[0]?.total || 0) / 3);
    const rev = Math.round((revAgg[0]?.total || 0) / 3);
    const net = burn - rev;
    const runway = net > 0 && cash > 0 ? (cash / net).toFixed(1) + ' mo' : '—';
    const honestRunway = net > 0 && pending > 0 ? (Math.max(0, cash - pending) / net).toFixed(1) + ' mo' : null;
    return { hasData: true, cash, burn, rev, runway, pending, honestRunway };
}

function financeText(f) {
    if (!f.hasData) return 'MONEY  — add bank accounts & expenses to see cash, burn and runway here.';
    let line = `MONEY  Cash ${fmtINR(f.cash)} · Burn ${fmtINR(f.burn)}/mo · Revenue ${fmtINR(f.rev)}/mo · Runway ${f.runway}`;
    if (f.pending > 0) line += ` · Pending commitments ${fmtINR(f.pending)}${f.honestRunway ? ` (honest runway ${f.honestRunway})` : ''}`;
    return line;
}

function financeHtml(f) {
    if (!f.hasData) {
        return `<div style="border:1px solid ${C.border};border-radius:8px;padding:14px 22px;margin:0 0 14px;font-size:13px;color:${C.grey};line-height:1.5;">
          Add bank accounts and expenses in ScaleUp Horizon to see cash, burn and runway here every morning.</div>`;
    }
    const cell = (label, value) => `<td style="padding:2px 24px 2px 0;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${C.grey};">${label}</div>
        <div style="font-size:16px;font-weight:700;color:${C.text};margin-top:2px;">${esc(value)}</div></td>`;
    const pendingCells = f.pending > 0
        ? `${cell('PENDING DUES', fmtINR(f.pending))}${f.honestRunway ? cell('HONEST RUNWAY', f.honestRunway) : ''}`
        : '';
    return `<div style="border:1px solid ${C.border};border-radius:8px;padding:14px 22px;margin:0 0 14px;">
      <table cellpadding="0" cellspacing="0">
        <tr>${cell('CASH', fmtINR(f.cash))}${cell('BURN / MO', fmtINR(f.burn))}${cell('REVENUE / MO', fmtINR(f.rev))}${cell('RUNWAY', f.runway)}${pendingCells}</tr>
      </table></div>`;
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
    const sectionsHtml = [];
    let totals = { overdue: 0, dueThisWeek: 0 };

    for (const b of featured) {
        const d = await collectEpicData(orgId, b.epic, now);
        totals.overdue += d.overdue.length;
        totals.dueThisWeek += d.dueThisWeek.length;
        sections.push(renderBusinessSection(d));
        sectionsHtml.push(renderBusinessHtml(d));
    }

    const restLines = [];
    const restRows = [];
    for (const b of rest) {
        const d = await collectEpicData(orgId, b.epic, now);
        totals.overdue += d.overdue.length;
        totals.dueThisWeek += d.dueThisWeek.length;
        const name = b.epic.title.replace(/\s*[—-]\s*5-Month Plan.*$/i, '');
        restLines.push(`  • ${name}: ${d.done}/${d.total} done`
            + (d.overdue.length ? ` · ${d.overdue.length} overdue` : '')
            + (d.dueThisWeek.length ? ` · ${d.dueThisWeek.length} due this week` : '')
            + (b.discussionDay ? `  (discussion: ${b.discussionDay})` : ''));
        restRows.push(`<tr>
            <td style="padding:7px 0;font-size:14px;border-bottom:1px solid ${C.greyBg};">
              <a href="${FRONTEND_URL}/tasks?epic=${b.epic._id}" style="color:${C.indigo};font-weight:600;text-decoration:none;">${esc(name)}</a>
              ${b.discussionDay ? `<span style="font-size:12px;color:${C.greyLight};"> — ${esc(b.discussionDay)}s</span>` : ''}
            </td>
            <td align="right" style="padding:7px 0;font-size:13px;color:${C.grey};white-space:nowrap;border-bottom:1px solid ${C.greyBg};">
              ${d.done}/${d.total} done${d.overdue.length ? ` · <span style="color:${C.red};font-weight:600;">${d.overdue.length} overdue</span>` : ''}${d.dueThisWeek.length ? ` · ${d.dueThisWeek.length} this week` : ''}
            </td></tr>`);
    }

    const finance = await financeData(orgId, now);
    const dateLabel = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const discussionNames = featured.map(b => b.epic.title.replace(/\s*[—-]\s*5-Month Plan.*$/i, '')).join(', ');

    // Plain-text version (fallback for clients without HTML)
    const header = featured.length > 0
        ? `Founder Briefing — ${dateLabel}\nToday's discussion: ${discussionNames}`
        : `Founder Briefing — ${dateLabel}`;
    const parts = [header, financeText(finance), ...sections];
    if (restLines.length) parts.push('OTHER BUSINESSES\n' + restLines.join('\n'));
    parts.push(`Open your command center: ${FRONTEND_URL}/dashboard`);
    parts.push('—\nScaleUp Horizon · your daily founder briefing');
    const body = parts.join('\n\n');

    const summary = `${totals.overdue} overdue · ${totals.dueThisWeek} due this week across ${businesses.length} businesses`;

    // HTML version
    const restRowsHtml = restRows.length
        ? `<div style="border:1px solid ${C.border};border-radius:8px;padding:14px 22px;margin:0 0 14px;">
             <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${C.grey};padding-bottom:4px;border-bottom:1px solid ${C.border};">OTHER BUSINESSES</div>
             <table cellpadding="0" cellspacing="0" style="width:100%;">${restRows.join('')}</table></div>`
        : '';
    const html = renderHtmlEmail({
        dateLabel,
        discussionNames: featured.length > 0 ? discussionNames : null,
        moneyHtml: financeHtml(finance),
        sectionHtml: sectionsHtml.join(''),
        restRowsHtml,
        summary,
    });

    // Generic subject: just the counts, never the business names
    const subject = `Founder Briefing — ${totals.overdue} overdue · ${totals.dueThisWeek} due this week`;

    const primaryEpicId = featured[0]?.epic._id || businesses[0].epic._id;

    return { subject, body, html, summary, primaryEpicId, featuredCount: featured.length };
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
        html: briefing.html,
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

/**
 * Daily investor follow-up reminders: one in-app + email notification per
 * org listing investors whose nextFollowUpDate is today or overdue.
 */
async function runDailyFollowUpReminders() {
    const Investor = require('../models/investorModel');
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);

    const due = await Investor.find({
        nextFollowUpDate: { $ne: null, $lte: endOfToday },
        status: { $nin: ['Invested', 'Declined', 'Passed'] },
    }).select('name organization nextFollowUpDate status');

    const byOrg = {};
    due.forEach(inv => {
        (byOrg[String(inv.organization)] = byOrg[String(inv.organization)] || []).push(inv);
    });

    for (const [orgId, investors] of Object.entries(byOrg)) {
        try {
            const members = await Membership.find({ organization: orgId, status: 'active' }).select('user');
            const names = investors.slice(0, 8).map(i =>
                `• ${i.name} (${i.status}${i.nextFollowUpDate < new Date(new Date().setHours(0, 0, 0, 0)) ? ' — overdue' : ''})`
            ).join('\n');
            await notifyUsers({
                organizationId: orgId,
                recipientIds: members.map(m => m.user),
                actorId: null,
                type: 'system',
                title: `${investors.length} investor follow-up${investors.length === 1 ? '' : 's'} due`,
                message: names + (investors.length > 8 ? `\n…and ${investors.length - 8} more` : '')
                    + `\n\nPipeline: ${FRONTEND_URL}/fundraising`,
            });
        } catch (err) {
            console.error(`Follow-up reminders failed for org ${orgId}:`, err.message);
        }
    }
    if (due.length) console.log(`Investor follow-up reminders: ${due.length} due across ${Object.keys(byOrg).length} org(s)`);
}

module.exports = { buildBriefing, sendBriefingForOrg, runDailyBriefings, runDailyFollowUpReminders };
