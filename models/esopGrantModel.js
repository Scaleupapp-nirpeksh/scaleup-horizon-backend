// models/esopGrantModel.js
const mongoose = require('mongoose');

// User's original vestingEventSchema - Preserved
const vestingEventSchema = new mongoose.Schema({
    vestDate: { type: Date, required: true },
    optionsVested: { type: Number, required: true },
    isCliff: { type: Boolean, default: false },
    notes: {type: String }
}, {_id: false});

// User's original esopGrantSchema - With multi-tenancy fields added
const esopGrantSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for an ESOP grant.'], // Added required message
        index: true,
    },
    // `createdBy` field already exists and references HorizonUser, serving as the user link.

    // --- User's Existing Fields (Preserved) ---
    employeeName: { type: String, required: true, trim: true },
    employeeId: { type: String, trim: true }, // Optional: Link to an internal employee ID
    numberOfOptionsGranted: { type: Number, required: true },
    strikePrice: { type: Number, required: true },
    grantDate: { type: Date, required: true },
    vestingScheduleType: {
        type: String,
        enum: ['Time-based Cliff', 'Time-based Graded', 'Milestone-based', 'Custom (manual events)'],
        default: 'Custom (manual events)',
    },
    vestingPeriodYears: { type: Number },
    cliffPeriodMonths: { type: Number },
    vestingFrequency: { type: String, enum: ['Monthly', 'Quarterly', 'Annually', 'None'], default: 'None' },

    vestingEvents: [vestingEventSchema],

    totalOptionsVested: { type: Number, default: 0 },
    totalOptionsExercised: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    agreementUrl: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
    // updatedAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'esopgrants', // ADDED: Explicit collection name
});

// User's original pre('save') hook - Only manual updatedAt removed
esopGrantSchema.pre('save', function(next) {
    // this.updatedAt = Date.now(); // REMOVED: Handled by timestamps: true

    // User's original logic for totalOptionsVested - Preserved
    let vestedCount = 0;
    const today = new Date();
    if (this.vestingEvents && this.vestingEvents.length > 0) {
        this.vestingEvents.forEach(event => {
            if (event.vestDate && new Date(event.vestDate) <= today) {
                vestedCount += event.optionsVested;
            }
        });
    }
    this.totalOptionsVested = vestedCount;

    // User's original logic for ensuring totalOptionsVested does not exceed numberOfOptionsGranted - Preserved
    if (this.totalOptionsVested > this.numberOfOptionsGranted) {
        this.totalOptionsVested = this.numberOfOptionsGranted;
    }
    // User's original logic for ensuring totalOptionsExercised does not exceed totalOptionsVested - Preserved
    if (this.totalOptionsExercised > this.totalOptionsVested) {
        console.warn(`Warning: Exercised options (${this.totalOptionsExercised}) for grant ${this._id} exceed vested options (${this.totalOptionsVested}). Capping exercised to vested.`);
        this.totalOptionsExercised = this.totalOptionsVested;
    }

    next();
});

// User's original instance method - Preserved
esopGrantSchema.methods.calculateVesting = function() {
    const today = new Date();
    let calculatedVested = 0;

    if (this.vestingScheduleType === 'Custom (manual events)') {
        if (this.vestingEvents && this.vestingEvents.length > 0) {
            this.vestingEvents.forEach(event => {
                if (event.vestDate && new Date(event.vestDate) <= today) {
                    calculatedVested += event.optionsVested;
                }
            });
        }
    } else if (this.vestingScheduleType === 'Time-based Cliff' || this.vestingScheduleType === 'Time-based Graded') {
        const grantDate = new Date(this.grantDate);
        const monthsPassed = (today.getFullYear() - grantDate.getFullYear()) * 12 + (today.getMonth() - grantDate.getMonth());

        if (this.cliffPeriodMonths && monthsPassed >= this.cliffPeriodMonths) {
            console.log(`Vesting calculation for grant ${this._id} based on schedule type '${this.vestingScheduleType}' needs full implementation.`);
        }
    }
    // ... other schedule types ...

    this.totalOptionsVested = Math.min(calculatedVested, this.numberOfOptionsGranted);
    return this.save(); // Returns a promise
};

// --- Indexes (ADDED) ---
esopGrantSchema.index({ organization: 1, employeeName: 1 });
esopGrantSchema.index({ organization: 1, employeeId: 1 }); // If employeeId is consistently used
esopGrantSchema.index({ organization: 1, grantDate: -1 });


module.exports = mongoose.models.ESOPGrant || mongoose.model('ESOPGrant', esopGrantSchema);
