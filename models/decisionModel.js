// models/decisionModel.js
// The org-wide decision log: what was decided, why, and where it came from.
// Decisions usually originate in meetings but can be logged standalone.
const mongoose = require('mongoose');

const decisionSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },

    decision: { type: String, required: [true, 'Decision text is required'], trim: true, maxlength: 1000 },
    rationale: { type: String, trim: true, maxlength: 5000 },

    meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', default: null, index: true },
    // Business epic this decision belongs to
    epic: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },

    decidedAt: { type: Date, default: Date.now },

    // 'superseded' marks decisions later reversed/replaced — kept for the record
    status: { type: String, enum: ['active', 'superseded'], default: 'active', index: true },
    supersededNote: { type: String, trim: true, maxlength: 1000 },
}, { timestamps: true, collection: 'decisions' });

decisionSchema.index({ organization: 1, decidedAt: -1 });
decisionSchema.index({ organization: 1, decision: 'text', rationale: 'text' });

module.exports = mongoose.model('Decision', decisionSchema);
