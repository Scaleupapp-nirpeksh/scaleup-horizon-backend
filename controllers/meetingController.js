// controllers/meetingController.js
// Founder meeting mode: run a discussion against a business epic, capture
// live notes, log decisions, spin up action items as real tasks, and end
// with an emailed recap. Also serves the org-wide decision log.
const mongoose = require('mongoose');
const Meeting = require('../models/meetingModel');
const Decision = require('../models/decisionModel');
const Task = require('../models/taskModel');
const Membership = require('../models/membershipModel');
const { notifyUsers, emailUsers } = require('../services/notificationService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.scaleuphorizon.com';

const isId = (v) => mongoose.Types.ObjectId.isValid(v);

async function findOrgMeeting(req) {
    if (!isId(req.params.id)) return null;
    return Meeting.findOne({ _id: req.params.id, organization: req.organization._id });
}

// ---------------------------------------------------------------- meetings

/**
 * @desc    Start a meeting (one in_progress meeting at a time per org)
 * @route   POST /api/horizon/meetings
 * @body    { epicId?, title?, attendees? }
 */
exports.startMeeting = async (req, res) => {
    try {
        const open = await Meeting.findOne({ organization: req.organization._id, status: 'in_progress' });
        if (open) {
            return res.status(409).json({ msg: 'A meeting is already in progress. End it before starting another.', meetingId: open._id });
        }

        let epic = null;
        if (req.body.epicId) {
            if (!isId(req.body.epicId)) return res.status(400).json({ msg: 'Invalid epic ID format' });
            epic = await Task.findOne({ _id: req.body.epicId, organization: req.organization._id, taskType: 'epic' });
            if (!epic) return res.status(404).json({ msg: 'Epic not found in your organization' });
        }

        // Default attendees: every org member (it is a founder discussion)
        let attendees = (req.body.attendees || []).filter(isId);
        if (attendees.length === 0) {
            const members = await Membership.find({ organization: req.organization._id, status: 'active' }).select('user');
            attendees = members.map(m => m.user);
        }

        const dateLabel = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
        const meeting = await Meeting.create({
            organization: req.organization._id,
            createdBy: req.user._id,
            title: req.body.title || (epic ? `${epic.title} — ${dateLabel}` : `Founder discussion — ${dateLabel}`),
            epic: epic ? epic._id : null,
            attendees,
        });

        const populated = await Meeting.findById(meeting._id)
            .populate('epic', 'title taskKey')
            .populate('attendees', 'name email');
        res.status(201).json({ msg: 'Meeting started', meeting: populated });
    } catch (err) {
        console.error('Error starting meeting:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: err.message });
        res.status(500).send('Server Error: Could not start meeting');
    }
};

/**
 * @desc    List meetings (history first; ?status=in_progress finds the live one)
 * @route   GET /api/horizon/meetings
 */
exports.getMeetings = async (req, res) => {
    try {
        const query = { organization: req.organization._id };
        if (req.query.status && ['in_progress', 'ended'].includes(req.query.status)) query.status = req.query.status;
        if (req.query.epicId && isId(req.query.epicId)) query.epic = req.query.epicId;

        const meetings = await Meeting.find(query)
            .populate('epic', 'title taskKey')
            .populate('attendees', 'name')
            .populate('actionItems', 'title taskKey status assignee dueDate')
            .sort({ startedAt: -1 })
            .limit(Number(req.query.limit) || 50);

        // Decision counts per meeting in one query
        const counts = await Decision.aggregate([
            { $match: { organization: req.organization._id, meeting: { $in: meetings.map(m => m._id) } } },
            { $group: { _id: '$meeting', count: { $sum: 1 } } }
        ]);
        const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.count]));

        res.json({
            meetings: meetings.map(m => ({
                ...m.toObject(),
                decisionCount: countMap[String(m._id)] || 0,
            }))
        });
    } catch (err) {
        console.error('Error fetching meetings:', err.message);
        res.status(500).send('Server Error: Could not fetch meetings');
    }
};

/**
 * @desc    Get one meeting with its decisions
 * @route   GET /api/horizon/meetings/:id
 */
exports.getMeetingById = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ msg: 'Invalid meeting ID format' });
        const meeting = await Meeting.findOne({ _id: req.params.id, organization: req.organization._id })
            .populate('epic', 'title taskKey')
            .populate('attendees', 'name email')
            .populate({
                path: 'actionItems',
                select: 'title taskKey status assignee dueDate priority',
                populate: { path: 'assignee', select: 'name' },
            });
        if (!meeting) return res.status(404).json({ msg: 'Meeting not found in your organization' });

        const decisions = await Decision.find({ meeting: meeting._id, organization: req.organization._id })
            .populate('recordedBy', 'name')
            .sort({ decidedAt: 1 });

        res.json({ meeting, decisions });
    } catch (err) {
        console.error('Error fetching meeting:', err.message);
        res.status(500).send('Server Error: Could not fetch meeting');
    }
};

/**
 * @desc    Update notes / title / attendees (notes autosave)
 * @route   PATCH /api/horizon/meetings/:id
 */
exports.updateMeeting = async (req, res) => {
    try {
        const meeting = await findOrgMeeting(req);
        if (!meeting) return res.status(404).json({ msg: 'Meeting not found in your organization' });

        if (req.body.notes !== undefined) meeting.notes = String(req.body.notes);
        if (req.body.title !== undefined && String(req.body.title).trim()) meeting.title = String(req.body.title).trim();
        if (Array.isArray(req.body.attendees)) meeting.attendees = req.body.attendees.filter(isId);

        await meeting.save();
        res.json({ msg: 'Meeting updated', meeting });
    } catch (err) {
        console.error('Error updating meeting:', err.message);
        res.status(500).send('Server Error: Could not update meeting');
    }
};

/**
 * @desc    Log a decision during a meeting
 * @route   POST /api/horizon/meetings/:id/decisions
 * @body    { decision, rationale? }
 */
exports.addMeetingDecision = async (req, res) => {
    try {
        const meeting = await findOrgMeeting(req);
        if (!meeting) return res.status(404).json({ msg: 'Meeting not found in your organization' });
        if (!req.body.decision || !String(req.body.decision).trim()) {
            return res.status(400).json({ msg: 'Decision text is required' });
        }

        const decision = await Decision.create({
            organization: req.organization._id,
            recordedBy: req.user._id,
            decision: String(req.body.decision).trim(),
            rationale: req.body.rationale,
            meeting: meeting._id,
            epic: meeting.epic,
        });
        const populated = await Decision.findById(decision._id).populate('recordedBy', 'name');
        res.status(201).json({ msg: 'Decision logged', decision: populated });
    } catch (err) {
        console.error('Error logging decision:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: err.message });
        res.status(500).send('Server Error: Could not log decision');
    }
};

/**
 * @desc    Create an action item (a real task) from the meeting
 * @route   POST /api/horizon/meetings/:id/action-items
 * @body    { title, assignee?, dueDate?, priority? }
 */
exports.addActionItem = async (req, res) => {
    try {
        const meeting = await findOrgMeeting(req);
        if (!meeting) return res.status(404).json({ msg: 'Meeting not found in your organization' });
        if (!req.body.title || !String(req.body.title).trim()) {
            return res.status(400).json({ msg: 'Action item title is required' });
        }

        const task = new Task({
            organization: req.organization._id,
            createdBy: req.user._id,
            title: String(req.body.title).trim(),
            description: `Action item from meeting "${meeting.title}".`,
            parentTask: meeting.epic || null,
            assignee: isId(req.body.assignee) ? req.body.assignee : null,
            dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
            priority: ['low', 'medium', 'high', 'critical'].includes(req.body.priority) ? req.body.priority : 'medium',
            watchers: meeting.attendees,
        });
        await task.save();

        meeting.actionItems.push(task._id);
        await meeting.save();

        if (task.assignee) {
            notifyUsers({
                organizationId: req.organization._id,
                recipientIds: [task.assignee],
                actorId: req.user._id,
                type: 'task_assigned',
                title: `${task.taskKey}: assigned to you in "${meeting.title}"`,
                message: task.title,
                taskId: task._id,
            }).catch(() => {});
        }

        const populated = await Task.findById(task._id)
            .select('title taskKey status assignee dueDate priority')
            .populate('assignee', 'name');
        res.status(201).json({ msg: 'Action item created', task: populated });
    } catch (err) {
        console.error('Error creating action item:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: err.message });
        res.status(500).send('Server Error: Could not create action item');
    }
};

// ------------------------------------------------------------------ recap

const C = { text: '#1a1f36', grey: '#6b7280', border: '#e5e7eb', accent: '#4f46e5' };
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function recapHtml({ meeting, decisions, actionItems }) {
    const section = (label) => `<div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:${C.accent};margin:22px 0 8px;">${label}</div>`;
    const dateLabel = new Date(meeting.startedAt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="background:#ffffff;border:1px solid ${C.border};border-top:3px solid ${C.accent};border-radius:8px;padding:28px 32px;">
<div style="font-size:19px;font-weight:700;color:${C.text};">Meeting Recap — ${esc(meeting.title)}</div>
<div style="font-size:13px;color:${C.grey};margin-top:4px;">${esc(dateLabel)} · ${(meeting.attendees || []).map(a => esc(a.name)).join(', ')}</div>`;

    if (decisions.length) {
        html += section('DECISIONS');
        html += decisions.map(d => `<div style="border:1px solid ${C.border};border-radius:6px;padding:10px 14px;margin-bottom:8px;">
<div style="font-size:14px;font-weight:600;color:${C.text};">${esc(d.decision)}</div>
${d.rationale ? `<div style="font-size:13px;color:${C.grey};margin-top:3px;">${esc(d.rationale)}</div>` : ''}</div>`).join('');
    }

    if (actionItems.length) {
        html += section('ACTION ITEMS');
        html += actionItems.map(t => `<div style="font-size:14px;color:${C.text};padding:5px 0;border-bottom:1px solid ${C.border};">
<span style="color:${C.grey};font-size:12px;">${esc(t.taskKey)}</span> ${esc(t.title)}
${t.assignee ? `<span style="color:${C.grey};"> — ${esc(t.assignee.name)}</span>` : ''}
${t.dueDate ? `<span style="color:${C.grey};font-size:12px;"> · due ${new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span>` : ''}</div>`).join('');
    }

    if (meeting.notes && meeting.notes.trim()) {
        html += section('NOTES');
        html += `<div style="font-size:13px;color:${C.text};line-height:1.6;white-space:pre-wrap;">${esc(meeting.notes.trim())}</div>`;
    }

    html += `<div style="margin-top:26px;font-size:13px;"><a href="${FRONTEND_URL}/meetings" style="color:${C.accent};text-decoration:none;">Open in ScaleUp Horizon →</a></div>
</div>
<div style="text-align:center;font-size:11px;color:${C.grey};padding:14px 0;">ScaleUp Horizon · automated meeting recap</div>
</div></body></html>`;
    return html;
}

function recapText({ meeting, decisions, actionItems }) {
    const lines = [`MEETING RECAP — ${meeting.title}`, ''];
    if (decisions.length) {
        lines.push('DECISIONS');
        decisions.forEach(d => lines.push(`  - ${d.decision}${d.rationale ? ` (${d.rationale})` : ''}`));
        lines.push('');
    }
    if (actionItems.length) {
        lines.push('ACTION ITEMS');
        actionItems.forEach(t => lines.push(`  - ${t.taskKey} ${t.title}${t.assignee ? ` — ${t.assignee.name}` : ''}`));
        lines.push('');
    }
    if (meeting.notes && meeting.notes.trim()) {
        lines.push('NOTES', meeting.notes.trim());
    }
    return lines.join('\n');
}

/**
 * @desc    End the meeting; optionally email a recap to attendees
 * @route   POST /api/horizon/meetings/:id/end
 * @body    { sendRecap?: boolean }
 */
exports.endMeeting = async (req, res) => {
    try {
        const meeting = await findOrgMeeting(req);
        if (!meeting) return res.status(404).json({ msg: 'Meeting not found in your organization' });
        if (meeting.status === 'ended') return res.status(400).json({ msg: 'Meeting is already ended' });

        meeting.status = 'ended';
        meeting.endedAt = new Date();

        let recap = { sent: 0 };
        if (req.body.sendRecap) {
            const [populated, decisions] = await Promise.all([
                Meeting.findById(meeting._id)
                    .populate('attendees', 'name email')
                    .populate({ path: 'actionItems', select: 'title taskKey assignee dueDate', populate: { path: 'assignee', select: 'name' } }),
                Decision.find({ meeting: meeting._id }).sort({ decidedAt: 1 }),
            ]);
            const payload = { meeting: populated, decisions, actionItems: populated.actionItems || [] };
            recap = await emailUsers({
                recipientIds: populated.attendees.map(a => a._id),
                subject: `Meeting recap — ${meeting.title}`,
                body: recapText(payload),
                html: recapHtml(payload),
            });
            meeting.recapSentAt = new Date();
        }

        await meeting.save();
        res.json({ msg: 'Meeting ended', meeting, recapSent: recap.sent || 0 });
    } catch (err) {
        console.error('Error ending meeting:', err.message);
        res.status(500).send('Server Error: Could not end meeting');
    }
};

// ------------------------------------------------------------ decision log

/**
 * @desc    Org-wide decision log
 * @route   GET /api/horizon/meetings/decisions/log?epicId=&q=&status=
 */
exports.getDecisions = async (req, res) => {
    try {
        const query = { organization: req.organization._id };
        if (req.query.epicId && isId(req.query.epicId)) query.epic = req.query.epicId;
        if (req.query.status && ['active', 'superseded'].includes(req.query.status)) query.status = req.query.status;
        if (req.query.q && String(req.query.q).trim()) {
            query.$text = { $search: String(req.query.q).trim() };
        }

        const decisions = await Decision.find(query)
            .populate('recordedBy', 'name')
            .populate('epic', 'title taskKey')
            .populate('meeting', 'title startedAt')
            .sort({ decidedAt: -1 })
            .limit(Number(req.query.limit) || 200);

        res.json({ decisions });
    } catch (err) {
        console.error('Error fetching decisions:', err.message);
        res.status(500).send('Server Error: Could not fetch decisions');
    }
};

/**
 * @desc    Log a standalone decision (outside any meeting)
 * @route   POST /api/horizon/meetings/decisions/log
 * @body    { decision, rationale?, epicId? }
 */
exports.createDecision = async (req, res) => {
    try {
        if (!req.body.decision || !String(req.body.decision).trim()) {
            return res.status(400).json({ msg: 'Decision text is required' });
        }
        let epicId = null;
        if (req.body.epicId) {
            if (!isId(req.body.epicId)) return res.status(400).json({ msg: 'Invalid epic ID format' });
            const epic = await Task.findOne({ _id: req.body.epicId, organization: req.organization._id, taskType: 'epic' });
            if (!epic) return res.status(404).json({ msg: 'Epic not found in your organization' });
            epicId = epic._id;
        }
        const decision = await Decision.create({
            organization: req.organization._id,
            recordedBy: req.user._id,
            decision: String(req.body.decision).trim(),
            rationale: req.body.rationale,
            epic: epicId,
        });
        const populated = await Decision.findById(decision._id)
            .populate('recordedBy', 'name').populate('epic', 'title taskKey');
        res.status(201).json({ msg: 'Decision logged', decision: populated });
    } catch (err) {
        console.error('Error creating decision:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: err.message });
        res.status(500).send('Server Error: Could not create decision');
    }
};

/**
 * @desc    Edit a decision (text/rationale, or mark superseded)
 * @route   PUT /api/horizon/meetings/decisions/:id
 */
exports.updateDecision = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ msg: 'Invalid decision ID format' });
        const decision = await Decision.findOne({ _id: req.params.id, organization: req.organization._id });
        if (!decision) return res.status(404).json({ msg: 'Decision not found in your organization' });

        if (req.body.decision !== undefined && String(req.body.decision).trim()) decision.decision = String(req.body.decision).trim();
        if (req.body.rationale !== undefined) decision.rationale = req.body.rationale;
        if (req.body.status && ['active', 'superseded'].includes(req.body.status)) decision.status = req.body.status;
        if (req.body.supersededNote !== undefined) decision.supersededNote = req.body.supersededNote;

        await decision.save();
        const populated = await Decision.findById(decision._id)
            .populate('recordedBy', 'name').populate('epic', 'title taskKey').populate('meeting', 'title startedAt');
        res.json({ msg: 'Decision updated', decision: populated });
    } catch (err) {
        console.error('Error updating decision:', err.message);
        res.status(500).send('Server Error: Could not update decision');
    }
};

/**
 * @desc    Delete a decision
 * @route   DELETE /api/horizon/meetings/decisions/:id
 */
exports.deleteDecision = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ msg: 'Invalid decision ID format' });
        const decision = await Decision.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
        if (!decision) return res.status(404).json({ msg: 'Decision not found in your organization' });
        res.json({ msg: 'Decision deleted' });
    } catch (err) {
        console.error('Error deleting decision:', err.message);
        res.status(500).send('Server Error: Could not delete decision');
    }
};
