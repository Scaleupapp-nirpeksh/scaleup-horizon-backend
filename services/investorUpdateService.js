// services/investorUpdateService.js
// One-click investor updates: assembles a monthly-update email from live
// org data (money, traction, fundraising, shipped work), in the same
// restrained style as the founder briefing. The founder edits the intro
// and asks, picks recipients, and sends.
const mongoose = require('mongoose');
const Task = require('../models/taskModel');
const Expense = require('../models/expenseModel');
const Revenue = require('../models/revenueModel');
const BankAccount = require('../models/bankAccountModel');
const Round = require('../models/roundModel');
const Investor = require('../models/investorModel');
const ManualKpiSnapshot = require('../models/manualKpiSnapshotModel');
const Organization = require('../models/organizationModel');
const InvestorUpdate = require('../models/investorUpdateModel');
const { sendEmailRaw } = require('./notificationService');

const C = {
    indigo: '#4f46e5', green: '#047857', grey: '#6b7280', greyLight: '#9ca3af',
    greyBg: '#f9fafb', text: '#1f2937', border: '#e5e7eb',
};
const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtINR = (v) => {
    const abs = Math.abs(v || 0);
    if (abs >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
    if (abs >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    return `₹${Math.round(v || 0).toLocaleString('en-IN')}`;
};

async function gatherMetrics(orgId) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
    const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(now.getDate() - 90);

    const [org, accounts, expAgg, revAgg, kpi, rounds, investors, shipped, upcoming] = await Promise.all([
        Organization.findById(orgId).select('name'),
        BankAccount.find({ organization: orgId }).select('currentBalance'),
        Expense.aggregate([{ $match: { organization: orgId, date: { $gte: ninetyDaysAgo } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
        Revenue.aggregate([{ $match: { organization: orgId, date: { $gte: ninetyDaysAgo } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        ManualKpiSnapshot.findOne({ organization: orgId }).sort({ snapshotDate: -1 }).select('snapshotDate totalRegisteredUsers dau mau'),
        Round.find({ organization: orgId }).select('name status targetAmount totalFundsReceived hardCommitmentsTotal softCommitmentsTotal'),
        Investor.find({ organization: orgId }).select('status totalCommittedAmount totalReceivedAmount'),
        Task.find({ organization: orgId, isArchived: false, taskType: 'task', status: 'completed', completedAt: { $gte: thirtyDaysAgo } })
            .select('title taskKey parentTask').populate('parentTask', 'title').sort({ completedAt: -1 }).limit(10),
        Task.find({
            organization: orgId, isArchived: false, taskType: 'task',
            status: { $nin: ['completed', 'cancelled'] },
            dueDate: { $gte: now, $lte: new Date(now.getTime() + 30 * 86400000) }
        }).select('title taskKey parentTask').populate('parentTask', 'title').sort({ dueDate: 1 }).limit(8),
    ]);

    const cash = accounts.reduce((s, a) => s + (a.currentBalance || 0), 0);
    const burn = Math.round((expAgg[0]?.total || 0) / 3);
    const rev = Math.round((revAgg[0]?.total || 0) / 3);
    const net = burn - rev;
    const financeHasData = accounts.length > 0 || (expAgg[0]?.count || 0) > 0;

    const openRound = rounds.find(r => ['Planning', 'Open', 'Closing'].includes(r.status)) || null;
    const invested = investors.filter(i => i.status === 'Invested').length;
    const committed = investors.filter(i => ['Soft Committed', 'Hard Committed'].includes(i.status)).length;
    const inPipeline = investors.filter(i => !['Invested', 'Declined', 'Passed', 'On Hold'].includes(i.status)).length;

    return {
        orgName: org ? org.name : 'Our company',
        finance: {
            hasData: financeHasData,
            cash, burn, rev,
            runway: net > 0 && cash > 0 ? (cash / net).toFixed(1) : null,
        },
        kpi: kpi ? {
            totalUsers: kpi.totalRegisteredUsers, dau: kpi.dau, mau: kpi.mau,
            asOf: kpi.snapshotDate,
        } : null,
        fundraising: {
            openRound: openRound ? {
                name: openRound.name,
                target: openRound.targetAmount,
                received: openRound.totalFundsReceived,
            } : null,
            invested, committed, inPipeline,
        },
        shipped: shipped.map(t => ({
            title: t.title, taskKey: t.taskKey,
            business: t.parentTask ? String(t.parentTask.title).replace(/\s*[—-]\s*5-Month Plan.*$/i, '') : null,
        })),
        upcoming: upcoming.map(t => ({
            title: t.title, taskKey: t.taskKey,
            business: t.parentTask ? String(t.parentTask.title).replace(/\s*[—-]\s*5-Month Plan.*$/i, '') : null,
        })),
    };
}

function metricCell(label, value) {
    return `<td style="padding:2px 24px 2px 0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${C.grey};">${label}</div>
      <div style="font-size:16px;font-weight:700;color:${C.text};margin-top:2px;">${esc(value)}</div></td>`;
}

function listSection(label, items) {
    if (!items.length) return '';
    return `<div style="margin:18px 0 0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${C.grey};padding-bottom:3px;border-bottom:1px solid ${C.border};">${label}</div>
      ${items.map(i => `<div style="font-size:14px;color:${C.text};padding:5px 0 0;line-height:1.5;">• ${esc(i.title)}${i.business ? ` <span style="font-size:12px;color:${C.greyLight};">(${esc(i.business)})</span>` : ''}</div>`).join('')}
    </div>`;
}

function renderUpdateHtml({ orgName, periodLabel, intro, asks, metrics }) {
    const m = metrics;
    const cells = [];
    if (m.finance.hasData) {
        cells.push(metricCell('CASH', fmtINR(m.finance.cash)));
        cells.push(metricCell('NET BURN / MO', fmtINR(m.finance.burn - m.finance.rev)));
        if (m.finance.rev > 0) cells.push(metricCell('REVENUE / MO', fmtINR(m.finance.rev)));
        if (m.finance.runway) cells.push(metricCell('RUNWAY', `${m.finance.runway} mo`));
    }
    if (m.kpi) {
        cells.push(metricCell('TOTAL USERS', (m.kpi.totalUsers || 0).toLocaleString('en-IN')));
        if (m.kpi.mau) cells.push(metricCell('MAU', (m.kpi.mau || 0).toLocaleString('en-IN')));
    }

    const fundraisingBlock = m.fundraising.openRound ? `
      <div style="margin:18px 0 0;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${C.grey};padding-bottom:3px;border-bottom:1px solid ${C.border};">FUNDRAISE — ${esc(m.fundraising.openRound.name).toUpperCase()}</div>
        <div style="font-size:14px;color:${C.text};padding-top:5px;line-height:1.5;">
          ${fmtINR(m.fundraising.openRound.received)} received of ${fmtINR(m.fundraising.openRound.target)} target
          · ${m.fundraising.committed} committed · ${m.fundraising.inPipeline} in conversations
        </div>
      </div>` : '';

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table cellpadding="0" cellspacing="0" style="width:100%;background:#ffffff;"><tr><td align="center" style="padding:28px 14px;">
    <table cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

      <tr><td style="border-top:3px solid ${C.indigo};padding:22px 2px 16px;">
        <div style="font-size:20px;font-weight:700;color:${C.text};">${esc(orgName)} — Investor Update</div>
        <div style="font-size:13px;color:${C.grey};margin-top:3px;">${esc(periodLabel)}</div>
      </td></tr>

      <tr><td style="padding:0 2px;">
        ${intro ? `<div style="font-size:14px;color:${C.text};line-height:1.65;white-space:pre-line;margin-bottom:16px;">${esc(intro)}</div>` : ''}

        ${cells.length ? `<div style="border:1px solid ${C.border};border-radius:8px;padding:14px 22px;margin:0 0 4px;">
          <table cellpadding="0" cellspacing="0"><tr>${cells.slice(0, 4).join('')}</tr>${cells.length > 4 ? `<tr>${cells.slice(4).join('')}</tr>` : ''}</table>
        </div>` : ''}

        ${fundraisingBlock}
        ${listSection('SHIPPED IN THE LAST 30 DAYS', m.shipped)}
        ${listSection('COMING UP NEXT', m.upcoming)}

        ${asks ? `<div style="margin:18px 0 0;">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${C.grey};padding-bottom:3px;border-bottom:1px solid ${C.border};">HOW YOU CAN HELP</div>
          <div style="font-size:14px;color:${C.text};padding-top:5px;line-height:1.65;white-space:pre-line;">${esc(asks)}</div>
        </div>` : ''}
      </td></tr>

      <tr><td style="padding:24px 2px;">
        <div style="border-top:1px solid ${C.border};padding-top:12px;font-size:11px;color:${C.greyLight};line-height:1.6;">
          Sent with ScaleUp Horizon. Reply directly to this email to reach the founders.
        </div>
      </td></tr>

    </table>
  </td></tr></table>
</body></html>`;
}

function renderUpdateText({ orgName, periodLabel, intro, asks, metrics }) {
    const m = metrics;
    const lines = [`${orgName} — Investor Update`, periodLabel, ''];
    if (intro) lines.push(intro, '');
    if (m.finance.hasData) {
        lines.push(`Cash ${fmtINR(m.finance.cash)} · Net burn ${fmtINR(m.finance.burn - m.finance.rev)}/mo`
            + (m.finance.runway ? ` · Runway ${m.finance.runway} mo` : ''));
    }
    if (m.kpi) lines.push(`Users ${m.kpi.totalUsers}` + (m.kpi.mau ? ` · MAU ${m.kpi.mau}` : ''));
    if (m.fundraising.openRound) {
        lines.push(`Fundraise (${m.fundraising.openRound.name}): ${fmtINR(m.fundraising.openRound.received)} of ${fmtINR(m.fundraising.openRound.target)} · ${m.fundraising.committed} committed`);
    }
    if (m.shipped.length) {
        lines.push('', 'Shipped in the last 30 days:');
        m.shipped.forEach(s => lines.push(`  • ${s.title}${s.business ? ` (${s.business})` : ''}`));
    }
    if (m.upcoming.length) {
        lines.push('', 'Coming up next:');
        m.upcoming.forEach(s => lines.push(`  • ${s.title}${s.business ? ` (${s.business})` : ''}`));
    }
    if (asks) lines.push('', 'How you can help:', asks);
    return lines.join('\n');
}

/** Build a draft update (no send). intro/asks are founder-editable text. */
async function buildDraft(orgId, { intro = '', asks = '' } = {}) {
    const metrics = await gatherMetrics(orgId);
    const now = new Date();
    const periodLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const subject = `${metrics.orgName} — Investor Update, ${periodLabel}`;
    const html = renderUpdateHtml({ orgName: metrics.orgName, periodLabel, intro, asks, metrics });
    const body = renderUpdateText({ orgName: metrics.orgName, periodLabel, intro, asks, metrics });
    return { subject, periodLabel, html, body, metrics };
}

/** Send the update to a list of recipients and record it. */
async function sendUpdate(orgId, userId, { subject, intro = '', asks = '', recipients = [], replyTo = null }) {
    const cleaned = recipients
        .map(r => ({ email: String(r.email || '').trim().toLowerCase(), name: r.name || '', investorId: r.investorId || null }))
        .filter(r => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
    if (cleaned.length === 0) throw new Error('No valid recipient email addresses');

    const draft = await buildDraft(orgId, { intro, asks });
    const finalSubject = subject || draft.subject;

    let sent = 0, failed = 0;
    for (const r of cleaned) {
        const ok = await sendEmailRaw({
            to: r.email,
            subject: finalSubject,
            body: draft.body,
            html: draft.html,
            replyTo,
        });
        if (ok) sent += 1; else failed += 1;
    }

    const record = await InvestorUpdate.create({
        organization: orgId,
        sentBy: userId,
        subject: finalSubject,
        periodLabel: draft.periodLabel,
        intro, asks,
        html: draft.html,
        recipients: cleaned,
        sentCount: sent,
        failedCount: failed,
        metrics: {
            finance: draft.metrics.finance,
            kpi: draft.metrics.kpi,
            fundraising: draft.metrics.fundraising,
            shippedCount: draft.metrics.shipped.length,
        },
    });

    return { sent, failed, recordId: record._id, subject: finalSubject };
}

module.exports = { buildDraft, sendUpdate, gatherMetrics };
