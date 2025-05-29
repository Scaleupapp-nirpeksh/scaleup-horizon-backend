// models/capTableEntryModel.js
const mongoose = require('mongoose');

const capTableEntrySchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization', // References the Organization model from Phase 1
        required: [true, 'Organization ID is required for a cap table entry.'],
        index: true, // Crucial for efficient querying by organization
    },
    user: { // The user within the organization who created or last modified this entry
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser', // References the HorizonUser model from Phase 1
        required: [true, 'User ID is required for a cap table entry.'],
        index: true,
    },

    // --- Existing Fields (with potential enhancements) ---
    shareholderName: {
        type: String,
        required: [true, 'Shareholder name is required (e.g., Founder, Investor, ESOP Pool).'],
        trim: true,
        maxlength: [150, 'Shareholder name cannot exceed 150 characters.']
    },
    shareholderType: {
        type: String,
        enum: ['Founder', 'Investor', 'ESOP Pool', 'Employee', 'Advisor', 'Other'], // Added Employee, Advisor
        required: [true, 'Shareholder type is required.'],
    },
    // It's often better to link to a specific Round or Security Issuance document if those exist
    // round: { type: mongoose.Schema.Types.ObjectId, ref: 'Round' }, // Example if you have a Round model

    numberOfShares: { // Number of shares or units (e.g., for options, RSUs)
        type: Number,
        required: function() {
            // Shares are usually required unless it's a SAFE/Note before conversion that doesn't specify units yet.
            return this.securityType !== 'SAFE' && this.securityType !== 'Convertible Note';
        },
        min: [0, 'Number of shares cannot be negative.']
    },
    // percentageOwnership is typically calculated dynamically based on total outstanding shares.
    // Storing it can lead to inconsistencies. It's better to calculate it on the fly when needed.
    // If you must store it, ensure robust mechanisms to update it whenever share counts change.
    // percentageOwnership: { type: Number, min: [0, 'Percentage ownership cannot be negative.'], max: [100, 'Percentage ownership cannot exceed 100.'] },

    securityType: {
        type: String,
        enum: [
            'Common Stock',
            'Preferred Stock', // Could be Series A, Series B etc. Maybe a separate field for Series.
            'SAFE', // Simple Agreement for Future Equity
            'Convertible Note',
            'Option', // From ESOP Pool granted to individuals
            'RSU', // Restricted Stock Unit
            'Warrant',
            'ESOP Pool Allocation' // Representing the total pool itself
        ],
        required: [true, 'Security type is required.'],
    },
    // series: { type: String, trim: true }, // E.g., "Series A", "Series Seed" - if securityType is Preferred Stock

    investmentAmount: { // For investors (SAFE, Convertible Note, Preferred Stock rounds)
        type: Number,
        min: [0, 'Investment amount cannot be negative.']
    },
    currency: { // Currency of the investmentAmount
        type: String,
        uppercase: true,
        trim: true,
        // Required if investmentAmount is present
        required: function() { return this.investmentAmount != null && this.investmentAmount > 0; },
        default: function() {
            // Ideally, this should be inherited from the Organization's default currency when created
            // or from the specific funding round if applicable.
            return this.parent()?.organization?.currency || 'INR'; // Example, needs proper context
        },
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'], // Match Organization model's enum
    },
    issueDate: { // Date the security was issued or investment was made
        type: Date,
        // required: true // Often required
    },
    grantDate: { // Specifically for options or founder stock
        type: Date
    },
    vestingSchedule: { // Could be a string description or a sub-document for more detail
        type: String, // E.g., "4-year vest, 1-year cliff", or link to a VestingSchedule model
        trim: true,
        maxlength: [255, 'Vesting schedule description cannot exceed 255 characters.']
    },
    cliffDate: { type: Date },
    exercisePrice: { // For options
        type: Number,
        min: [0, 'Exercise price cannot be negative.']
    },
    notes: {
        type: String,
        trim: true,
        maxlength: [2000, 'Notes cannot exceed 2000 characters.']
    },
    // createdAt: { type: Date, default: Date.now }, // Replaced by timestamps: true
    // updatedAt: { type: Date, default: Date.now }, // Replaced by timestamps: true
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt
    collection: 'captableentries',
});

// Middleware (Hooks)
// capTableEntrySchema.pre('save', function(next) {
//     // this.updatedAt = Date.now(); // No longer needed due to timestamps: true
//     // Any other pre-save logic, e.g., calculating percentageOwnership if total shares are available here.
//     // However, calculating percentageOwnership accurately on individual entry save is tricky
//     // as it depends on the sum of all other entries' shares for the same organization.
//     // This is better done at a higher level or when querying.
//     next();
// });

// --- Indexes ---
// Index for common queries: finding cap table entries for an organization
capTableEntrySchema.index({ organization: 1 });
capTableEntrySchema.index({ organization: 1, shareholderName: 1 });
capTableEntrySchema.index({ organization: 1, securityType: 1 });
// Consider a unique index if a shareholder should only have one entry of a specific security type
// e.g., unique for (organization, shareholderName, securityType, issueDate)
// This depends heavily on how you structure your cap table data (e.g., one entry per grant/investment).

const CapTableEntry = mongoose.model('CapTableEntry', capTableEntrySchema);
module.exports = CapTableEntry;
