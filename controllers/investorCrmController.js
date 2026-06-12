// controllers/investorCrmController.js
// Lightweight pipeline-CRM operations on investors: stage moves, follow-up
// dates and the interaction log. Deliberately separate from updateInvestor,
// which runs heavyweight equity recalculations.
const mongoose = require('mongoose');
const Investor = require('../models/investorModel');

const PIPELINE_STATUSES = ['Lead', 'Contacted', 'Introduced', 'Pitched', 'Follow-up',
    'Negotiating', 'Soft Committed', 'Hard Committed', 'Invested', 'Declined', 'Passed', 'On Hold'];

/**
 * @desc    Move an investor through the pipeline / set follow-up date
 * @route   PATCH /api/horizon/fundraising/investors/:id/pipeline
 * @access  Private
 * @body    { status?, nextFollowUpDate? (null clears) }
 */
exports.updatePipeline = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        const { status, nextFollowUpDate } = req.body;

        const investor = await Investor.findOne({
            _id: req.params.id,
            organization: req.organization._id,
        });
        if (!investor) return res.status(404).json({ msg: 'Investor not found in your organization' });

        if (status !== undefined) {
            if (!PIPELINE_STATUSES.includes(status)) {
                return res.status(400).json({ msg: `Invalid status. Use one of: ${PIPELINE_STATUSES.join(', ')}` });
            }
            if (status !== investor.status) {
                investor.relationshipHistory = investor.relationshipHistory || [];
                investor.relationshipHistory.push({
                    date: new Date(),
                    status,
                    notes: `Moved from ${investor.status} to ${status}`,
                    updatedBy: req.user._id,
                });
                investor.status = status;
            }
        }
        if (nextFollowUpDate !== undefined) {
            if (nextFollowUpDate === null || nextFollowUpDate === '') {
                investor.nextFollowUpDate = null;
            } else {
                const d = new Date(nextFollowUpDate);
                if (isNaN(d.getTime())) return res.status(400).json({ msg: 'Invalid follow-up date' });
                investor.nextFollowUpDate = d;
            }
        }

        await investor.save();
        res.json({ msg: 'Pipeline updated', investor });
    } catch (err) {
        console.error('Error updating investor pipeline:', err.message, err.stack);
        res.status(500).send('Server Error: Could not update pipeline');
    }
};

/**
 * @desc    Log an interaction (call/email/meeting/note) with an investor
 * @route   POST /api/horizon/fundraising/investors/:id/interactions
 * @access  Private
 * @body    { type, summary, date?, nextFollowUpDate? }
 */
exports.addInteraction = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        const { type = 'note', summary, date, nextFollowUpDate } = req.body;
        if (!summary || !String(summary).trim()) {
            return res.status(400).json({ msg: 'Interaction summary is required' });
        }

        const investor = await Investor.findOne({
            _id: req.params.id,
            organization: req.organization._id,
        });
        if (!investor) return res.status(404).json({ msg: 'Investor not found in your organization' });

        const when = date ? new Date(date) : new Date();
        if (isNaN(when.getTime())) return res.status(400).json({ msg: 'Invalid interaction date' });

        investor.interactions = investor.interactions || [];
        investor.interactions.push({ date: when, type, summary: String(summary).trim(), by: req.user._id });
        if (!investor.lastContactedAt || when > investor.lastContactedAt) {
            investor.lastContactedAt = when;
        }
        if (nextFollowUpDate !== undefined && nextFollowUpDate !== null && nextFollowUpDate !== '') {
            const d = new Date(nextFollowUpDate);
            if (!isNaN(d.getTime())) investor.nextFollowUpDate = d;
        }

        await investor.save();

        const populated = await Investor.findById(investor._id)
            .populate('interactions.by', 'name');
        res.status(201).json({ msg: 'Interaction logged', investor: populated });
    } catch (err) {
        console.error('Error adding investor interaction:', err.message, err.stack);
        res.status(500).send('Server Error: Could not log interaction');
    }
};
