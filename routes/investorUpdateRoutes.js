// routes/investorUpdateRoutes.js
const express = require('express');
const router = express.Router();
const { protect, requireActiveOrganization, authorizeOrganizationRole } = require('../middleware/authMiddleware');
const { buildDraft, sendUpdate } = require('../services/investorUpdateService');
const InvestorUpdate = require('../models/investorUpdateModel');

router.use(protect);
router.use(requireActiveOrganization);

// Build a draft (POST so intro/asks can be long text)
router.post('/draft',
    authorizeOrganizationRole(['owner', 'member']),
    async (req, res) => {
        try {
            const { intro, asks } = req.body || {};
            const draft = await buildDraft(req.organization._id, { intro, asks });
            res.json(draft);
        } catch (err) {
            console.error('Error building investor update draft:', err.message, err.stack);
            res.status(500).send('Server Error: Could not build the update draft');
        }
    }
);

// Send the update to recipients
router.post('/send',
    authorizeOrganizationRole(['owner', 'member']),
    async (req, res) => {
        try {
            const { subject, intro, asks, recipients } = req.body || {};
            if (!Array.isArray(recipients) || recipients.length === 0) {
                return res.status(400).json({ msg: 'At least one recipient is required' });
            }
            if (recipients.length > 100) {
                return res.status(400).json({ msg: 'Maximum 100 recipients per update' });
            }
            const result = await sendUpdate(req.organization._id, req.user._id, {
                subject, intro, asks, recipients,
                replyTo: req.user.email || null,
            });
            res.json({
                msg: `Update sent to ${result.sent} recipient${result.sent === 1 ? '' : 's'}`
                    + (result.failed ? ` (${result.failed} failed)` : ''),
                ...result,
            });
        } catch (err) {
            console.error('Error sending investor update:', err.message, err.stack);
            res.status(500).json({ msg: err.message || 'Could not send the update' });
        }
    }
);

// History
router.get('/',
    authorizeOrganizationRole(['owner', 'member']),
    async (req, res) => {
        try {
            const updates = await InvestorUpdate.find({ organization: req.organization._id })
                .select('-html')
                .sort({ createdAt: -1 })
                .limit(50)
                .populate('sentBy', 'name');
            res.json(updates);
        } catch (err) {
            console.error('Error fetching investor updates:', err.message, err.stack);
            res.status(500).send('Server Error: Could not fetch updates');
        }
    }
);

module.exports = router;
