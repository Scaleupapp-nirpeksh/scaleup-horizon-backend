// models/manualKpiSnapshotModel.js
const mongoose = require('mongoose');

// User's original featureUsageDetailSchema - Preserved
const featureUsageDetailSchema = new mongoose.Schema({
    _id: false, // ADDED: To prevent sub-document IDs if not needed
    quizzesPlayed: { type: Number, default: 0 },
    contentItemsCreated: { type: Number, default: 0 }, // Posts, Articles
    learnListsCreated: { type: Number, default: 0 },
    studyGroupMessagesSent: { type: Number, default: 0 },
    directMessagesSent: { type: Number, default: 0 },
    // Add more specific feature counts as needed
});

// User's original retentionCohortSchema - Preserved
const retentionCohortSchema = new mongoose.Schema({
    _id: false, // ADDED: To prevent sub-document IDs if not needed
    cohortStartDate: { type: Date, required: true }, // e.g., Start of the week/month for the cohort
    cohortName: { type: String, trim: true }, // Added trim // e.g., "Week of 2025-05-20", "May 2025 Signups"
    week1RetentionPercent: { type: Number, min: 0, max: 100 }, // Added min/max
    week4RetentionPercent: { type: Number, min: 0, max: 100 }, // Added min/max
    month1RetentionPercent: { type: Number, min: 0, max: 100 }, // Added min/max
    // Add more retention periods as needed
});

// User's original manualKpiSnapshotSchema - With multi-tenancy fields added
const manualKpiSnapshotSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a manual KPI snapshot.'], // Added required message
        index: true,
    },
    // `enteredBy` field already exists and references HorizonUser, serving as the user link.

    // --- User's Existing Fields (Preserved) ---
    snapshotDate: { // The date this snapshot represents (e.g., end of day for DAU)
        type: Date,
        required: true,
        // unique: true // This unique constraint should be per-organization, not global.
                       // Handled by a compound index with `organization`.
    },
    totalRegisteredUsers: { type: Number, min: 0 }, // Added min
    newUsersToday: { type: Number, min: 0 }, // Or new users for the period this snapshot covers // Added min
    dau: { type: Number, min: 0 }, // Daily Active Users for snapshotDate // Added min
    mau: { type: Number, min: 0 }, // Monthly Active Users (typically a rolling 30-day count, or for the month of snapshotDate) // Added min

    featureUsage: { // Preserved user's structure
        type: featureUsageDetailSchema,
        default: () => ({}) // Ensure it defaults to an object if not provided
    },

    retentionCohorts: [retentionCohortSchema], // Can store multiple cohort data points relevant to this snapshot period

    notes: { type: String, trim: true }, // Added trim
    enteredBy: { // Ensuring ref is correct as per our HorizonUser model
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: [true, 'User ID of the person entering the snapshot is required.'] // Added required message
    },
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
    // updatedAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'manualkpisnapshots', // ADDED: Explicit collection name
});

// User's original pre('save') hook - Only manual updatedAt removed
manualKpiSnapshotSchema.pre('save', function(next) {
    // this.updatedAt = Date.now(); // REMOVED: Handled by timestamps: true
    // User's existing logic can remain here if any was intended beyond updatedAt
    next();
});

// --- Indexes (ADDED/Updated) ---
// Unique snapshotDate per organization
manualKpiSnapshotSchema.index({ organization: 1, snapshotDate: 1 }, { unique: true });
manualKpiSnapshotSchema.index({ organization: 1, enteredBy: 1 });


const ManualKpiSnapshot = mongoose.models.ManualKpiSnapshot || mongoose.model('ManualKpiSnapshot', manualKpiSnapshotSchema);
module.exports = ManualKpiSnapshot;
