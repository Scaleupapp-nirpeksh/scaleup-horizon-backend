// routes/investorMeetingRoutes.js
const express = require('express');
const router = express.Router();
// --- MULTI-TENANCY: Import all necessary middleware ---
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware');
const investorMeetingController = require('../controllers/investorMeetingController');

// --- MULTI-TENANCY: Apply global protection and require an active organization for all routes ---
router.use(protect);
router.use(requireActiveOrganization);

// @route   POST /api/horizon/investor-meetings
// @desc    Create a new investor meeting
// @access  Private - Organization members
router.post('/', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.createMeeting);

// @route   GET /api/horizon/investor-meetings
// @desc    Get all investor meetings with optional filtering
// @access  Private - Organization members
router.get('/', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.getMeetings);

// @route   GET /api/horizon/investor-meetings/statistics
// @desc    Get meeting statistics
// @access  Private - Organization members
router.get('/statistics', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.getMeetingStatistics);

// @route   GET /api/horizon/investor-meetings/:id
// @desc    Get a single investor meeting by ID
// @access  Private - Organization members
router.get('/:id', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.getMeetingById);

// @route   PUT /api/horizon/investor-meetings/:id
// @desc    Update an investor meeting
// @access  Private - Organization members
router.put('/:id', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.updateMeeting);

// @route   DELETE /api/horizon/investor-meetings/:id
// @desc    Delete an investor meeting
// @access  Private - Organization members
router.delete('/:id', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.deleteMeeting);

// @route   POST /api/horizon/investor-meetings/:id/prepare
// @desc    Prepare meeting data (populate metrics, milestones, etc.)
// @access  Private - Organization members
router.post('/:id/prepare', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.prepareMeeting);

// @route   POST /api/horizon/investor-meetings/:id/talking-points
// @desc    Add a talking point to a meeting
// @access  Private - Organization members
router.post('/:id/talking-points', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.addTalkingPoint);

// @route   PATCH /api/horizon/investor-meetings/:id/notes
// @desc    Update meeting notes and summary
// @access  Private - Organization members
router.patch('/:id/notes', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.updateMeetingNotes);

// @route   POST /api/horizon/investor-meetings/:id/feedback
// @desc    Add investor feedback
// @access  Private - Organization members
router.post('/:id/feedback', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.addFeedback);

// @route   POST /api/horizon/investor-meetings/:id/action-items
// @desc    Add action item
// @access  Private - Organization members
router.post('/:id/action-items', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.addActionItem);

// @route   PATCH /api/horizon/investor-meetings/:id/action-items/:actionId
// @desc    Update action item status
// @access  Private - Organization members
router.patch('/:id/action-items/:actionId', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.updateActionItem);

// @route   POST /api/horizon/investor-meetings/:id/complete
// @desc    Complete a meeting and add effectiveness rating
// @access  Private - Organization members
router.post('/:id/complete', authorizeOrganizationRole(['owner', 'member']), investorMeetingController.completeMeeting);

module.exports = router;