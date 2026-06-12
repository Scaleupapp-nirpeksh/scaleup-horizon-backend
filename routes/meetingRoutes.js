// routes/meetingRoutes.js
// Founder meeting mode + org decision log.
const express = require('express');
const router = express.Router();
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole,
} = require('../middleware/authMiddleware');
const meetingController = require('../controllers/meetingController');

router.use(protect);
router.use(requireActiveOrganization);

const member = authorizeOrganizationRole(['owner', 'member']);

// Decision log (must come before /:id routes)
router.get('/decisions/log', member, meetingController.getDecisions);
router.post('/decisions/log', member, meetingController.createDecision);
router.put('/decisions/:id', member, meetingController.updateDecision);
router.delete('/decisions/:id', member, meetingController.deleteDecision);

// Meetings
router.post('/', member, meetingController.startMeeting);
router.get('/', member, meetingController.getMeetings);
router.get('/:id', member, meetingController.getMeetingById);
router.patch('/:id', member, meetingController.updateMeeting);
router.post('/:id/decisions', member, meetingController.addMeetingDecision);
router.post('/:id/action-items', member, meetingController.addActionItem);
router.post('/:id/end', member, meetingController.endMeeting);

module.exports = router;
