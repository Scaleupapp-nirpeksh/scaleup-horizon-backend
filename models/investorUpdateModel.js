// models/investorUpdateModel.js
// A sent investor update email — kept for history and resending reference.
const mongoose = require('mongoose');

const investorUpdateSchema = new mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
            index: true,
        },
        sentBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser',
            required: true,
        },
        subject: { type: String, required: true, trim: true, maxlength: 200 },
        periodLabel: { type: String, trim: true },
        intro: { type: String, trim: true, maxlength: 5000 },
        asks: { type: String, trim: true, maxlength: 5000 },
        html: { type: String }, // full rendered email
        recipients: [{
            _id: false,
            email: { type: String, required: true, trim: true, lowercase: true },
            name: { type: String, trim: true },
            investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', default: null },
        }],
        sentCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },
        metrics: { type: mongoose.Schema.Types.Mixed }, // snapshot of the numbers included
    },
    { timestamps: true, collection: 'investorupdates' }
);

investorUpdateSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model('InvestorUpdate', investorUpdateSchema);
