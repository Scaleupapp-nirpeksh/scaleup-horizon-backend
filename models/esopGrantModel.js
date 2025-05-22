// models/esopGrantModel.js
const mongoose = require('mongoose');

const vestingEventSchema = new mongoose.Schema({
    vestDate: { type: Date, required: true },
    optionsVested: { type: Number, required: true },
    isCliff: { type: Boolean, default: false },
    notes: {type: String }
}, {_id: false});

const esopGrantSchema = new mongoose.Schema({
    employeeName: { type: String, required: true, trim: true },
    employeeId: { type: String, trim: true }, // Optional: Link to an internal employee ID
    numberOfOptionsGranted: { type: Number, required: true },
    strikePrice: { type: Number, required: true },
    grantDate: { type: Date, required: true },
    vestingScheduleType: {
        type: String,
        enum: ['Time-based Cliff', 'Time-based Graded', 'Milestone-based', 'Custom (manual events)'],
        default: 'Custom (manual events)', // Defaulting to manual events for clarity
    },
    vestingPeriodYears: { type: Number }, // e.g., 4 for a 4-year vest
    cliffPeriodMonths: { type: Number }, // e.g., 12 for a 1-year cliff
    vestingFrequency: { type: String, enum: ['Monthly', 'Quarterly', 'Annually', 'None'], default: 'None' }, // After cliff

    // For 'Custom (manual events)' or pre-calculated schedules
    vestingEvents: [vestingEventSchema], 

    totalOptionsVested: { type: Number, default: 0 },
    totalOptionsExercised: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    agreementUrl: { type: String }, // Link to the grant agreement document
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

esopGrantSchema.pre('save', function(next) {
    this.updatedAt = Date.now();

    // Calculate totalOptionsVested based on vestingEvents whose date has passed
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

    // Ensure totalOptionsVested does not exceed numberOfOptionsGranted
    if (this.totalOptionsVested > this.numberOfOptionsGranted) {
        this.totalOptionsVested = this.numberOfOptionsGranted;
    }
    // Ensure totalOptionsExercised does not exceed totalOptionsVested
    if (this.totalOptionsExercised > this.totalOptionsVested) {
        // This scenario should ideally be handled at the point of exercising options
        // For pre-save, we can cap it or throw an error. Let's log a warning or cap.
        console.warn(`Warning: Exercised options (${this.totalOptionsExercised}) for grant ${this._id} exceed vested options (${this.totalOptionsVested}). Capping exercised to vested.`);
        this.totalOptionsExercised = this.totalOptionsVested; 
    }

    next();
});

// Method to manually trigger vesting calculation (e.g., by a cron job or admin action)
// This would be more robust for complex, non-event-driven schedules.
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
        // Placeholder for more complex time-based vesting logic
        // This would involve calculating elapsed time since grantDate, applying cliff, and then frequency.
        // Example (very simplified, needs proper date math library like moment.js or date-fns for accuracy):
        const grantDate = new Date(this.grantDate);
        const monthsPassed = (today.getFullYear() - grantDate.getFullYear()) * 12 + (today.getMonth() - grantDate.getMonth());

        if (this.cliffPeriodMonths && monthsPassed >= this.cliffPeriodMonths) {
            // Cliff met. Calculate vested options based on frequency and period.
            // This logic needs to be carefully implemented.
            // For now, we'll stick to vestingEvents for simplicity in pre-save.
            // A more robust solution would generate vestingEvents based on schedule or calculate on the fly here.
            console.log(`Vesting calculation for grant ${this._id} based on schedule type '${this.vestingScheduleType}' needs full implementation.`);
        }
    }
    // ... other schedule types ...
    
    this.totalOptionsVested = Math.min(calculatedVested, this.numberOfOptionsGranted);
    return this.save(); // Returns a promise
};


module.exports = mongoose.models.ESOPGrant || mongoose.model('ESOPGrant', esopGrantSchema);
