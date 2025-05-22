// models/manualKpiSnapshotModel.js
const mongoose = require('mongoose');

const featureUsageDetailSchema = new mongoose.Schema({
    quizzesPlayed: { type: Number, default: 0 },
    contentItemsCreated: { type: Number, default: 0 }, // Posts, Articles
    learnListsCreated: { type: Number, default: 0 },
    studyGroupMessagesSent: { type: Number, default: 0 },
    directMessagesSent: { type: Number, default: 0 },
    // Add more specific feature counts as needed
}, {_id: false});

const retentionCohortSchema = new mongoose.Schema({
    cohortStartDate: { type: Date, required: true }, // e.g., Start of the week/month for the cohort
    cohortName: { type: String }, // e.g., "Week of 2025-05-20", "May 2025 Signups"
    week1RetentionPercent: { type: Number }, // % active in week 1
    week4RetentionPercent: { type: Number }, // % active in week 4
    month1RetentionPercent: { type: Number }, // % active in month 1
    // Add more retention periods as needed
}, {_id: false});

const manualKpiSnapshotSchema = new mongoose.Schema({
    snapshotDate: { // The date this snapshot represents (e.g., end of day for DAU)
        type: Date,
        required: true,
        unique: true // Usually, one snapshot per date
    },
    totalRegisteredUsers: { type: Number },
    newUsersToday: { type: Number }, // Or new users for the period this snapshot covers
    dau: { type: Number }, // Daily Active Users for snapshotDate
    mau: { type: Number }, // Monthly Active Users (typically a rolling 30-day count, or for the month of snapshotDate)
    
    featureUsage: {
        type: featureUsageDetailSchema,
    },
    
    retentionCohorts: [retentionCohortSchema], // Can store multiple cohort data points relevant to this snapshot period

    notes: { type: String },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' }, // Who entered this data
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

manualKpiSnapshotSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const ManualKpiSnapshot = mongoose.model('ManualKpiSnapshot', manualKpiSnapshotSchema);
module.exports = ManualKpiSnapshot;
