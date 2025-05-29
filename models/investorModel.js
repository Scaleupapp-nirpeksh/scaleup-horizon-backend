// models/investorModel.js
const mongoose = require('mongoose');

// User's original trancheSchema - Preserved
const trancheSchema = new mongoose.Schema({
    _id: false, // ADDED: To prevent sub-document IDs if not needed
    trancheNumber: { type: Number, required: true },
    agreedAmount: { type: Number, required: true },
    receivedAmount: { type: Number, default: 0 },
    dateAgreed: { type: Date },
    dateReceived: { type: Date },
    triggerCondition: { type: String, trim: true }, // Added trim
    status: {
        type: String,
        enum: ['Pending', 'Partially Received', 'Fully Received', 'Cancelled'],
        default: 'Pending',
    },
});

// User's original investorSchema - With multi-tenancy fields added
const investorSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for an investor record.'], // Added required message
        index: true,
    },
    // ADDED: To track which user within the organization added/manages this investor relationship
    // If `roundId`'s `createdBy` isn't sufficient or if investors can be added independently of a round first.
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: [true, 'User ID of the person adding the investor is required.'],
    },

    // --- User's Existing Fields (Preserved) ---
    name: { type: String, required: true, trim: true }, // Name of the individual investor or primary contact
    contactPerson: { type: String, trim: true }, // Could be same as name or different for a fund
    email: { type: String, trim: true, lowercase: true }, // Added lowercase
    phone: { type: String, trim: true },
    entityName: { type: String, trim: true }, // If investing via a company/fund
    investorType: { // ADDED: To categorize investor type
        type: String,
        enum: ['Angel', 'VC Firm', 'Corporate VC', 'Family Office', 'Accelerator', 'Incubator', 'Individual', 'Other'],
        trim: true,
    },
    investmentVehicle: { // This might be specific to a particular investment/round with this investor
        type: String,
        enum: ['SAFE', 'Convertible Note', 'Equity', 'Other'],
    },
    // SAFE/Note specific terms (simplified for MVP) - These might better belong on a specific "Investment" or "Security" model linked to this investor and a round.
    safeValuationCap: { type: Number, min: 0 }, // Added min
    safeDiscountRate: { type: Number, min: 0, max: 1 }, // e.g., 0.2 for 20% - Added min/max
    noteInterestRate: { type: Number, min: 0 }, // Added min
    noteMaturityDate: { type: Date },

    totalCommittedAmount: { type: Number, default: 0, min: 0 }, // Added min
    totalReceivedAmount: { type: Number, default: 0, min: 0 }, // Added min

    // roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', required: true },
    // An investor can exist independently of a specific round initially, or participate in multiple rounds.
    // The link to a round is better managed on the 'Round' model (who participated) or a separate 'Investment' model.
    // If this investor record is *only* in the context of one specific round, then roundId is fine.
    // For a more general CRM-like investor model, this might be an array of rounds they participated in.
    // For now, preserving as is, but flagging for review.
    // If keeping, it should be indexed:
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', required: true, index: true },


    tranches: [trancheSchema], // These tranches are specific to the investment in the 'roundId'
    status: { // Overall status of this investor (could be general or specific to roundId)
        type: String,
        enum: ['Lead', 'Contacted', 'Introduced', 'Pitched', 'Follow-up', 'Negotiating', 'Soft Committed', 'Hard Committed', 'Invested', 'Declined', 'Passed', 'On Hold'], // Expanded enum
        default: 'Introduced',
        index: true, // Added index
    },
    notes: { type: String, trim: true }, // Added trim
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
    // updatedAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'investors', // ADDED: Explicit collection name
});

// User's original pre('save') hook - Only manual updatedAt removed
investorSchema.pre('save', function(next) {
    // this.updatedAt = Date.now(); // REMOVED: Handled by timestamps: true

    // User's original logic for recalculating totals - Preserved
    // Ensure tranches is an array before reducing
    if (Array.isArray(this.tranches)) {
        this.totalCommittedAmount = this.tranches.reduce((sum, t) => sum + (t.agreedAmount || 0), 0);
        this.totalReceivedAmount = this.tranches.reduce((sum, t) => sum + (t.receivedAmount || 0), 0);
    } else {
        this.totalCommittedAmount = 0;
        this.totalReceivedAmount = 0;
    }
    next();
});

// --- Indexes (ADDED) ---
investorSchema.index({ organization: 1, name: 1 }, { collation: { locale: 'en', strength: 2 } }); // Investor names can be similar, index for searching
investorSchema.index({ organization: 1, entityName: 1 }, { collation: { locale: 'en', strength: 2 } });
investorSchema.index({ organization: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $exists: true, $ne: null, $ne: "" } } }); // Email unique within an org
investorSchema.index({ organization: 1, status: 1 });
investorSchema.index({ organization: 1, roundId: 1 }); // If roundId is kept and queried often

const Investor = mongoose.models.Investor || mongoose.model('Investor', investorSchema);
module.exports = Investor;
