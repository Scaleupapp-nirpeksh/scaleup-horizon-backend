// routes/chiefOfStaffRoutes.js
const express = require('express');
const router = express.Router();
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole,
} = require('../middleware/authMiddleware');
const chiefOfStaffService = require('../services/chiefOfStaffService');

router.use(protect);
router.use(requireActiveOrganization);
const member = authorizeOrganizationRole(['owner', 'member']);

/**
 * @desc    The daily Chief of Staff brief: ranked insights + top-3 focus
 * @route   GET /api/horizon/chief-of-staff/brief
 */
router.get('/brief', member, async (req, res) => {
    try {
        const brief = await chiefOfStaffService.buildBrief(req.organization._id);
        res.json({ ...brief, ask: chiefOfStaffService.askAvailable() });
    } catch (err) {
        console.error('Error building chief-of-staff brief:', err.message, err.stack);
        res.status(500).send('Server Error: Could not build brief');
    }
});

/**
 * @desc    Ask the Chief of Staff a question (LLM layer; needs ANTHROPIC_API_KEY)
 * @route   POST /api/horizon/chief-of-staff/ask
 */
router.post('/ask', member, async (req, res) => {
    try {
        if (!req.body.question || !String(req.body.question).trim()) {
            return res.status(400).json({ msg: 'Question is required' });
        }
        const result = await chiefOfStaffService.answerQuestion(req.organization._id, String(req.body.question).trim());
        if (!result.available) {
            return res.status(501).json({ msg: 'Conversational Q&A is not configured. Add ANTHROPIC_API_KEY to the server environment to enable it.' });
        }
        res.json({ answer: result.answer });
    } catch (err) {
        console.error('Error answering chief-of-staff question:', err.message);
        res.status(502).json({ msg: 'The assistant could not answer right now. Try again in a moment.' });
    }
});

module.exports = router;
