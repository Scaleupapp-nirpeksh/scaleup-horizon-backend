// models/revenueCohortModel.js
const mongoose = require('mongoose');

// User's original cohortMetricsSchema - Preserved
const cohortMetricsSchema = new mongoose.Schema({
    _id: false, // User had _id: false
    periodNumber: { type: Number, required: true }, // 0, 1, 2, 3... months from cohort start
    periodLabel: { type: String, trim: true }, // Added trim // "Month 0", "Month 1", etc.

    activeUsers: { type: Number, default: 0, min: 0 }, // Added min
    churnedUsers: { type: Number, default: 0, min: 0 }, // Added min
    retentionRate: { type: Number, min: 0, max: 1 },

    revenue: { type: Number, default: 0, min: 0 }, // Added min
    averageRevenuePerUser: { type: Number, default: 0, min: 0 }, // Added min
    cumulativeRevenue: { type: Number, default: 0, min: 0 }, // Added min

    averageSessionsPerUser: { type: Number, min: 0 }, // Added min
    averageEngagementScore: { type: Number }, // Range might depend on scoring system

    isProjected: { type: Boolean, default: false },
    confidenceLevel: { type: Number, min: 0, max: 1 }
});

// User's original revenueCohortSchema - With multi-tenancy fields added
const revenueCohortSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a revenue cohort.'], // Added required message
        index: true,
    },
    // `createdBy` field already exists and references HorizonUser.

    // --- User's Existing Fields (Preserved) ---
    cohortName: { type: String, required: true, trim: true }, // e.g., "2024-01", "Q1 2024"
    cohortStartDate: { type: Date, required: true },
    cohortEndDate: { type: Date }, // For non-monthly cohorts
    cohortType: {
        type: String,
        enum: ['monthly', 'weekly', 'quarterly', 'custom'],
        default: 'monthly'
    },
    currency: { // ADDED: Currency for revenue metrics
        type: String,
        uppercase: true,
        trim: true,
        required: [true, 'Currency is required for the revenue cohort.'],
        default: 'INR', // Default, should align with Organization's default
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    },
    initialUsers: { type: Number, required: true, min: [0, 'Initial users cannot be negative.'] }, // Added min
    acquisitionChannel: { type: String, trim: true }, // Added trim // Primary acquisition channel
    acquisitionCost: { type: Number, min: 0 }, // Added min // Total CAC for this cohort
    averageCAC: { type: Number, min: 0 }, // Added min // Per user

    productType: { type: String, trim: true }, // Added trim // Which product/plan they signed up for
    averageContractValue: { type: Number, min: 0 }, // Added min
    paymentFrequency: { type: String, enum: ['monthly', 'quarterly', 'annual', 'one-time'] },

    metrics: [cohortMetricsSchema],
    projectionMonths: { type: Number, default: 24, min: 0 }, // Added min

    actualLTV: { type: Number, default: 0, min: 0 }, // Added min
    projectedLTV: { type: Number, default: 0, min: 0 }, // Added min
    ltcacRatio: { type: Number, default: 0 }, // Can be negative if LTV < CAC
    paybackPeriod: { type: Number, default: null, min: 0 }, // Added min

    benchmarkCohort: { type: mongoose.Schema.Types.ObjectId, ref: 'RevenueCohort' }, // This ref should also be org-scoped
    performanceVsBenchmark: { type: Number }, // % better/worse

    segments: [{ // Preserved user's structure
        _id: false, // ADDED
        segmentName: { type: String, trim: true }, // Added trim
        userCount: { type: Number, min: 0 }, // Added min
        revenueContribution: { type: Number, min: 0 }, // Added min
        retentionRate: { type: Number, min: 0, max: 1 } // Added min/max
    }],

    modelParameters: { // Preserved user's structure
        _id: false, // ADDED
        retentionCurveType: { type: String, enum: ['exponential', 'power', 'linear', 'custom'], default: 'exponential' },
        retentionDecayRate: { type: Number },
        revenueGrowthRate: { type: Number },
        seasonalityFactors: [{ type: Number }], // 12 monthly factors
        confidenceInterval: { type: Number, default: 0.95, min: 0, max: 1 } // Added min/max
    },

    insights: [{ // Preserved user's structure
        _id: false, // ADDED
        type: { type: String, enum: ['retention', 'revenue', 'ltv', 'general'] },
        severity: { type: String, enum: ['positive', 'neutral', 'warning', 'critical'] },
        message: { type: String, trim: true }, // Added trim
        recommendedAction: { type: String, trim: true } // Added trim
    }],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    // lastUpdated: { type: Date, default: Date.now }, // Will be handled by timestamps: true (as updatedAt)
    // createdAt: { type: Date, default: Date.now }    // Will be handled by timestamps: true
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'revenuecohorts', // ADDED: Explicit collection name
});

// User's original method to calculate LTV - Preserved
revenueCohortSchema.methods.calculateLTV = function() {
    // Ensure metrics is an array and has items before reducing / dividing
    if (!Array.isArray(this.metrics) || this.metrics.length === 0) {
        this.actualLTV = 0;
        return 0;
    }
    const totalRevenue = this.metrics.reduce((sum, m) => sum + (m.revenue || 0), 0);
    // const avgUsers = this.metrics.reduce((sum, m) => sum + (m.activeUsers || 0), 0) / this.metrics.length; // This is average of active users per period, not total unique users in cohort for LTV
    // LTV is typically Total Revenue from Cohort / Initial Users in Cohort
    this.actualLTV = this.initialUsers > 0 ? totalRevenue / this.initialUsers : 0;
    return this.actualLTV;
};

// User's original pre('save') hook - Modified to use 'updatedAt' from timestamps
revenueCohortSchema.pre('save', function(next) {
    // this.lastUpdated = Date.now(); // REMOVED: Handled by timestamps: true (as updatedAt)
    // Any other pre-save logic from user can remain here.
    // For example, validating cohortStartDate vs cohortEndDate if both are present.
    if (this.cohortStartDate && this.cohortEndDate && this.cohortStartDate > this.cohortEndDate) {
        return next(new Error('Cohort start date cannot be after end date.'));
    }
    next();
});

// --- Indexes (ADDED) ---
revenueCohortSchema.index({ organization: 1, cohortName: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
revenueCohortSchema.index({ organization: 1, cohortStartDate: -1, cohortType: 1 });
revenueCohortSchema.index({ organization: 1, acquisitionChannel: 1 });
revenueCohortSchema.index({ organization: 1, createdBy: 1 });


module.exports = mongoose.models.RevenueCohort || mongoose.model('RevenueCohort', revenueCohortSchema);
