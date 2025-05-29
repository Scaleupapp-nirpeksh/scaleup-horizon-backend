// models/roundModel.js
const mongoose = require('mongoose');

// User's original roundSchema - With multi-tenancy fields added
const roundSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a funding round.'], // Added required message
        index: true,
    },
    createdBy: { // ADDED: To track which user within the organization created this round
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: [true, 'User ID of the creator is required for a funding round.'], // Added required message
    },

    // --- User's Existing Fields (Preserved) ---
    name: { type: String, required: true, trim: true }, // e.g., "Pre-Seed FFF"
    targetAmount: { type: Number, required: true, min: [0, 'Target amount cannot be negative.'] }, // Added min
    currency: { // ADDED: Currency for targetAmount and other monetary values
        type: String,
        uppercase: true,
        trim: true,
        required: [true, 'Currency is required for the funding round.'],
        default: 'INR', // Default, should align with Organization's default
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    },
    currentValuationPreMoney: { type: Number, min: 0 }, // Added min
    currentValuationPostMoney: { type: Number, min: 0 }, // Can be calculated or input, Added min
    softCommitmentsTotal: { type: Number, default: 0, min: 0 }, // Added min
    hardCommitmentsTotal: { type: Number, default: 0, min: 0 }, // Added min
    totalFundsReceived: { type: Number, default: 0, min: 0 }, // Added min
    openDate: { type: Date, default: Date.now },
    targetCloseDate: { type: Date },
    actualCloseDate: { type: Date }, // ADDED: To track when the round actually closed
    status: {
        type: String,
        enum: ['Planning', 'Open', 'Closing', 'Closed', 'On Hold', 'Cancelled'], // Added 'On Hold', 'Cancelled'
        default: 'Planning',
        index: true, // Added index
    },
    roundType: { // ADDED: To specify the type of round
        type: String,
        enum: ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Bridge', 'Angel', 'Debt', 'Grant', 'Other'],
        trim: true,
    },
    notes: { type: String, trim: true }, // Added trim
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
    // updatedAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'rounds', // ADDED: Explicit collection name
});

// User's original pre('save') hook - Only manual updatedAt removed
roundSchema.pre('save', function(next) {
    // this.updatedAt = Date.now(); // REMOVED: Handled by timestamps: true

    // User's existing logic can remain here if any was intended beyond updatedAt
    // For example, calculating post-money valuation if pre-money and funds raised are available
    if (this.isModified('currentValuationPreMoney') || this.isModified('totalFundsReceived')) {
        if (this.currentValuationPreMoney != null && this.totalFundsReceived != null) {
            // this.currentValuationPostMoney = this.currentValuationPreMoney + this.totalFundsReceived;
            // This calculation might be better handled in a controller or service after an investment is logged.
        }
    }
    if (this.openDate && this.targetCloseDate && this.openDate > this.targetCloseDate) {
        return next(new Error('Round open date cannot be after the target close date.'));
    }
    if (this.targetCloseDate && this.actualCloseDate && this.targetCloseDate > this.actualCloseDate && this.status === 'Closed') {
        // Just a note, not an error - round closed earlier than targeted.
    }
    next();
});

// --- Indexes (ADDED) ---
roundSchema.index({ organization: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } }); // Round names unique within an org
roundSchema.index({ organization: 1, status: 1 });
roundSchema.index({ organization: 1, openDate: -1 });
roundSchema.index({ organization: 1, roundType: 1 });


const Round = mongoose.models.Round || mongoose.model('Round', roundSchema);
module.exports = Round;
