// models/investorReportModel.js
const mongoose = require('mongoose');

// User's original investorReportSchema - With multi-tenancy fields added
const investorReportSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for an investor report.'], // Added required message
        index: true,
    },
    // `createdBy` field already exists and references HorizonUser, serving as the user link.

    // --- User's Existing Fields (Preserved) ---
    reportTitle: {
        type: String,
        required: true,
        default: () => `Investor Update - ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` // Made default more readable
    },
    periodStartDate: { type: Date }, // Optional: For reports covering a specific period
    periodEndDate: { type: Date },   // Optional
    narrativeSummary: { // Founder's commentary
        type: String,
        required: true,
        trim: true
    },
    keyAchievements: [{ type: String, trim: true }],
    challengesFaced: [{ type: String, trim: true }],
    nextStepsFocus: [{ type: String, trim: true }],

    snapshotData: { // Preserved user's structure
        _id: false, // ADDED: To prevent sub-document IDs if not needed
        totalFundsRaisedThisRound: Number,
        currentBankBalance: Number,
        monthlyBurnRate: Number,
        estimatedRunwayMonths: Number,
        dau: Number,
        mau: Number,
        newUserGrowth: Number,
        // Add other key KPIs you want to snapshot
        // Consider adding currency for monetary values if not implied by organization context
    },

    sharedWithInvestorIds: [{ // These Investor records should also be organization-scoped or globally managed
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Investor'
    }],
    status: { // ADDED: Status of the report
        type: String,
        enum: ['Draft', 'Shared', 'Archived'],
        default: 'Draft',
        index: true,
    },
    version: { // ADDED: Version number for the report
        type: Number,
        default: 1,
        min: 1,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
    // No updatedAt was in the original, timestamps: true will add it.
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'investorreports', // ADDED: Explicit collection name
});

// No pre-save hook was in the original for updatedAt.
// If other pre-save logic is needed, it can be added here.
// investorReportSchema.pre('save', function(next) {
//     next();
// });

// --- Indexes (ADDED) ---
investorReportSchema.index({ organization: 1, reportTitle: 1 }, { collation: { locale: 'en', strength: 2 } });
investorReportSchema.index({ organization: 1, status: 1 });
investorReportSchema.index({ organization: 1, periodEndDate: -1 }); // If reports are often queried by period
investorReportSchema.index({ organization: 1, 'sharedWithInvestorIds': 1 });


// Check if the model already exists before compiling it (User's original export structure)
module.exports = mongoose.models.InvestorReport || mongoose.model('InvestorReport', investorReportSchema);
