// models/meetingModel.js
// Founder discussion meetings (the weekly per-business sessions) — distinct
// from investorMeetingModel. A meeting collects live notes, decisions and
// action items (real tasks) against a business epic.
const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },

    title: { type: String, required: [true, 'Meeting title is required'], trim: true, maxlength: 300 },
    // The business epic this discussion is about (optional — ad-hoc meetings allowed)
    epic: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },

    status: { type: String, enum: ['in_progress', 'ended'], default: 'in_progress', index: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },

    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' }],

    // Live notes, autosaved from the meeting screen
    notes: { type: String, default: '', maxlength: 50000 },

    // Tasks created during this meeting
    actionItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],

    recapSentAt: { type: Date, default: null },
}, { timestamps: true, collection: 'meetings' });

meetingSchema.index({ organization: 1, status: 1, startedAt: -1 });

module.exports = mongoose.model('Meeting', meetingSchema);
