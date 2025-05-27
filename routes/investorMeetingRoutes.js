// routes/investorMeetingRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const investorMeetingController = require('../controllers/investorMeetingController');

// Apply authentication to all routes
router.use(protect);

// @route   POST /api/horizon/investor-meetings
// @desc    Create a new investor meeting
// @access  Private
router.post('/', investorMeetingController.createMeeting);

// @route   GET /api/horizon/investor-meetings
// @desc    Get all investor meetings with optional filtering
// @access  Private
router.get('/', investorMeetingController.getMeetings);

// @route   GET /api/horizon/investor-meetings/statistics
// @desc    Get meeting statistics
// @access  Private
router.get('/statistics', investorMeetingController.getMeetingStatistics);

// @route   GET /api/horizon/investor-meetings/:id
// @desc    Get a single investor meeting by ID
// @access  Private
router.get('/:id', investorMeetingController.getMeetingById);

// @route   PUT /api/horizon/investor-meetings/:id
// @desc    Update an investor meeting
// @access  Private
router.put('/:id', investorMeetingController.updateMeeting);

// @route   DELETE /api/horizon/investor-meetings/:id
// @desc    Delete an investor meeting
// @access  Private
router.delete('/:id', investorMeetingController.deleteMeeting);

// @route   POST /api/horizon/investor-meetings/:id/prepare
// @desc    Prepare meeting data (populate metrics, milestones, etc.)
// @access  Private
router.post('/:id/prepare', investorMeetingController.prepareMeeting);

// @route   POST /api/horizon/investor-meetings/:id/talking-points
// @desc    Add a talking point to a meeting
// @access  Private
router.post('/:id/talking-points', investorMeetingController.addTalkingPoint);

// @route   PATCH /api/horizon/investor-meetings/:id/notes
// @desc    Update meeting notes and summary
// @access  Private
router.patch('/:id/notes', investorMeetingController.updateMeetingNotes);

// @route   POST /api/horizon/investor-meetings/:id/feedback
// @desc    Add investor feedback
// @access  Private
router.post('/:id/feedback', investorMeetingController.addFeedback);

// @route   POST /api/horizon/investor-meetings/:id/action-items
// @desc    Add action item
// @access  Private
router.post('/:id/action-items', investorMeetingController.addActionItem);

// @route   PATCH /api/horizon/investor-meetings/:id/action-items/:actionId
// @desc    Update action item status
// @access  Private
router.patch('/:id/action-items/:actionId', investorMeetingController.updateActionItem);

// @route   POST /api/horizon/investor-meetings/:id/complete
// @desc    Complete a meeting and add effectiveness rating
// @access  Private
router.post('/:id/complete', investorMeetingController.completeMeeting);

module.exports = router;