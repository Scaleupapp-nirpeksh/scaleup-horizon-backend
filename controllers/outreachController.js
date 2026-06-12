// controllers/outreachController.js
// Personalized investor outreach: business write-up, targets, web research,
// AI drafting, and the mark-sent → pipeline handoff.
const mongoose = require('mongoose');
const { OutreachProfile, OutreachTarget } = require('../models/outreachModel');
const Investor = require('../models/investorModel');
const outreachService = require('../services/outreachService');

const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const NOT_CONFIGURED = 'AI research and drafting need ANTHROPIC_API_KEY on the server.';

async function findOrgTarget(req) {
    if (!isId(req.params.id)) return null;
    return OutreachTarget.findOne({ _id: req.params.id, organization: req.organization._id });
}

// ------------------------------------------------------------- profile

exports.getProfile = async (req, res) => {
    try {
        const profile = await OutreachProfile.findOne({ organization: req.organization._id });
        res.json({
            businessWriteup: profile ? profile.businessWriteup : '',
            updatedAt: profile ? profile.updatedAt : null,
            aiAvailable: outreachService.available(),
        });
    } catch (err) {
        console.error('Error fetching outreach profile:', err.message);
        res.status(500).send('Server Error: Could not fetch outreach profile');
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const profile = await OutreachProfile.findOneAndUpdate(
            { organization: req.organization._id },
            { $set: { businessWriteup: String(req.body.businessWriteup || '').slice(0, 20000), updatedBy: req.user._id } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json({ msg: 'Write-up saved', businessWriteup: profile.businessWriteup });
    } catch (err) {
        console.error('Error saving outreach profile:', err.message);
        res.status(500).send('Server Error: Could not save write-up');
    }
};

// ------------------------------------------------------------- targets

const TARGET_FIELDS = ['name', 'email', 'linkedinUrl', 'notes'];

exports.createTarget = async (req, res) => {
    try {
        if (!req.body.name || !String(req.body.name).trim()) {
            return res.status(400).json({ msg: 'Name is required' });
        }
        const target = new OutreachTarget({
            organization: req.organization._id,
            addedBy: req.user._id,
        });
        for (const f of TARGET_FIELDS) if (req.body[f] !== undefined) target[f] = req.body[f];
        if (Array.isArray(req.body.otherLinks)) {
            target.otherLinks = req.body.otherLinks.filter(l => l && String(l).trim()).slice(0, 10);
        }
        await target.save();
        res.status(201).json({ msg: 'Person added', target });
    } catch (err) {
        console.error('Error creating outreach target:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: err.message });
        res.status(500).send('Server Error: Could not add person');
    }
};

exports.getTargets = async (req, res) => {
    try {
        const query = { organization: req.organization._id };
        if (req.query.status && ['new', 'researched', 'drafted', 'sent'].includes(req.query.status)) {
            query.status = req.query.status;
        }
        const targets = await OutreachTarget.find(query).sort({ createdAt: -1 }).limit(300);
        res.json({ targets });
    } catch (err) {
        console.error('Error listing outreach targets:', err.message);
        res.status(500).send('Server Error: Could not list people');
    }
};

exports.updateTarget = async (req, res) => {
    try {
        const target = await findOrgTarget(req);
        if (!target) return res.status(404).json({ msg: 'Person not found in your organization' });

        for (const f of TARGET_FIELDS) if (req.body[f] !== undefined) target[f] = req.body[f];
        if (Array.isArray(req.body.otherLinks)) {
            target.otherLinks = req.body.otherLinks.filter(l => l && String(l).trim()).slice(0, 10);
        }
        // Manual edits to the draft are first-class — founders polish before sending
        if (req.body.draft && (req.body.draft.subject !== undefined || req.body.draft.body !== undefined)) {
            target.draft = target.draft || {};
            if (req.body.draft.subject !== undefined) target.draft.subject = String(req.body.draft.subject).slice(0, 300);
            if (req.body.draft.body !== undefined) target.draft.body = String(req.body.draft.body).slice(0, 10000);
            target.draft.draftedAt = target.draft.draftedAt || new Date();
            if (target.status === 'new' || target.status === 'researched') target.status = 'drafted';
        }
        await target.save();
        res.json({ msg: 'Updated', target });
    } catch (err) {
        console.error('Error updating outreach target:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: err.message });
        res.status(500).send('Server Error: Could not update person');
    }
};

exports.deleteTarget = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ msg: 'Invalid ID format' });
        const target = await OutreachTarget.findOneAndDelete({ _id: req.params.id, organization: req.organization._id });
        if (!target) return res.status(404).json({ msg: 'Person not found in your organization' });
        res.json({ msg: 'Person removed' });
    } catch (err) {
        console.error('Error deleting outreach target:', err.message);
        res.status(500).send('Server Error: Could not remove person');
    }
};

// ---------------------------------------------------------- AI actions

exports.researchTarget = async (req, res) => {
    try {
        const target = await findOrgTarget(req);
        if (!target) return res.status(404).json({ msg: 'Person not found in your organization' });

        const result = await outreachService.researchTarget(target);
        if (!result.available) return res.status(501).json({ msg: NOT_CONFIGURED });

        target.research = { summary: result.summary, sources: result.sources, researchedAt: new Date() };
        if (target.status === 'new') target.status = 'researched';
        await target.save();
        res.json({ msg: 'Research complete', target });
    } catch (err) {
        console.error('Error researching outreach target:', err.message);
        res.status(502).json({ msg: 'Research failed — try again in a moment.' });
    }
};

exports.draftEmail = async (req, res) => {
    try {
        const target = await findOrgTarget(req);
        if (!target) return res.status(404).json({ msg: 'Person not found in your organization' });

        const profile = await OutreachProfile.findOne({ organization: req.organization._id });
        if (!profile || !profile.businessWriteup.trim()) {
            return res.status(400).json({ msg: 'Add your business write-up first — it powers every draft.' });
        }

        const result = await outreachService.draftEmail({
            target,
            businessWriteup: profile.businessWriteup,
            senderName: req.user.name,
            orgName: req.organization.name,
            feedback: req.body.feedback ? String(req.body.feedback).slice(0, 2000) : null,
            previousDraft: req.body.feedback ? target.draft : null,
        });
        if (!result.available) return res.status(501).json({ msg: NOT_CONFIGURED });

        target.draft = { subject: result.subject, body: result.body, draftedAt: new Date() };
        if (target.status !== 'sent') target.status = 'drafted';
        await target.save();
        res.json({ msg: 'Draft ready', target });
    } catch (err) {
        console.error('Error drafting outreach email:', err.message);
        res.status(502).json({ msg: 'Drafting failed — try again in a moment.' });
    }
};

// ----------------------------------------------------------- mark sent

exports.markSent = async (req, res) => {
    try {
        const target = await findOrgTarget(req);
        if (!target) return res.status(404).json({ msg: 'Person not found in your organization' });

        target.status = 'sent';
        target.sentAt = new Date();

        // Optionally drop them into the investor pipeline as a contacted prospect
        if (req.body.addToPipeline && !target.investorId) {
            const prospect = new Investor({
                organization: req.organization._id,
                addedBy: req.user._id,
                name: target.name,
                email: target.email || undefined,
                investorType: 'Other',
                source: 'Cold outreach (AI-drafted)',
                status: 'Contacted',
                lastContactedAt: new Date(),
                tranches: [],
                totalCommittedAmount: 0,
                interactions: [{
                    date: new Date(),
                    type: 'email',
                    summary: `Outreach email sent${target.draft?.subject ? `: "${target.draft.subject}"` : ''}`,
                    by: req.user._id,
                }],
            });
            await prospect.save();
            target.investorId = prospect._id;
        }

        await target.save();
        res.json({ msg: 'Marked as sent', target });
    } catch (err) {
        console.error('Error marking outreach sent:', err.message);
        res.status(500).send('Server Error: Could not mark as sent');
    }
};
