// models/outreachModel.js
// AI-personalized investor outreach: the org's business write-up plus the
// people being approached, each with web research and a tailored draft.
const mongoose = require('mongoose');

// One per organization: the reusable "what we do" write-up that powers drafts
const outreachProfileSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        unique: true,
    },
    businessWriteup: { type: String, default: '', maxlength: 20000 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },
}, { timestamps: true, collection: 'outreachprofiles' });

const outreachTargetSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },

    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 200 },
    email: { type: String, trim: true, lowercase: true, maxlength: 320 },
    linkedinUrl: { type: String, trim: true, maxlength: 500 },
    otherLinks: [{ type: String, trim: true, maxlength: 1000 }],
    notes: { type: String, trim: true, maxlength: 5000 },

    research: {
        summary: { type: String, maxlength: 20000 },
        sources: [{ title: { type: String, maxlength: 300 }, url: { type: String, maxlength: 1000 } }],
        researchedAt: { type: Date, default: null },
    },

    draft: {
        subject: { type: String, maxlength: 300 },
        body: { type: String, maxlength: 10000 },
        draftedAt: { type: Date, default: null },
    },

    status: {
        type: String,
        enum: ['new', 'researched', 'drafted', 'sent'],
        default: 'new',
        index: true,
    },
    sentAt: { type: Date, default: null },
    // Pipeline prospect created when marked sent (optional)
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', default: null },
}, { timestamps: true, collection: 'outreachtargets' });

outreachTargetSchema.index({ organization: 1, status: 1, createdAt: -1 });

module.exports = {
    OutreachProfile: mongoose.model('OutreachProfile', outreachProfileSchema),
    OutreachTarget: mongoose.model('OutreachTarget', outreachTargetSchema),
};
