// models/revenueCohortModel.js
const mongoose = require('mongoose');

const cohortMetricsSchema = new mongoose.Schema({
    periodNumber: { type: Number, required: true }, // 0, 1, 2, 3... months from cohort start
    periodLabel: { type: String }, // "Month 0", "Month 1", etc.
    
    // User metrics
    activeUsers: { type: Number, default: 0 },
    churnedUsers: { type: Number, default: 0 },
    retentionRate: { type: Number, min: 0, max: 1 },
    
    // Revenue metrics
    revenue: { type: Number, default: 0 },
    averageRevenuePerUser: { type: Number, default: 0 },
    cumulativeRevenue: { type: Number, default: 0 },
    
    // Engagement metrics
    averageSessionsPerUser: { type: Number },
    averageEngagementScore: { type: Number },
    
    // Projections (for future periods)
    isProjected: { type: Boolean, default: false },
    confidenceLevel: { type: Number, min: 0, max: 1 }
}, { _id: false });

const revenueCohortSchema = new mongoose.Schema({
    cohortName: { type: String, required: true, trim: true }, // e.g., "2024-01", "Q1 2024"
    cohortStartDate: { type: Date, required: true },
    cohortEndDate: { type: Date }, // For non-monthly cohorts
    cohortType: {
        type: String,
        enum: ['monthly', 'weekly', 'quarterly', 'custom'],
        default: 'monthly'
    },
    
    // Initial cohort characteristics
    initialUsers: { type: Number, required: true },
    acquisitionChannel: { type: String }, // Primary acquisition channel
    acquisitionCost: { type: Number }, // Total CAC for this cohort
    averageCAC: { type: Number }, // Per user
    
    // Cohort behavior patterns
    productType: { type: String }, // Which product/plan they signed up for
    averageContractValue: { type: Number },
    paymentFrequency: { type: String, enum: ['monthly', 'quarterly', 'annual', 'one-time'] },
    
    // Historical and projected metrics
    metrics: [cohortMetricsSchema],
    projectionMonths: { type: Number, default: 24 }, // How far to project
    
    // Lifetime value calculations
    actualLTV: {
        type: Number,
        default: 0
    },
    projectedLTV: {
        type: Number,
        default: 0
    },
    ltcacRatio: {
        type: Number,
        default: 0
    },
    paybackPeriod: {
        type: Number,
        default: null
    }, // FIXED: Added missing comma here
    
    // Comparison metrics
    benchmarkCohort: { type: mongoose.Schema.Types.ObjectId, ref: 'RevenueCohort' },
    performanceVsBenchmark: { type: Number }, // % better/worse
    
    // Segmentation data
    segments: [{
        segmentName: { type: String },
        userCount: { type: Number },
        revenueContribution: { type: Number },
        retentionRate: { type: Number }
    }],
    
    // Model parameters (for projections)
    modelParameters: {
        retentionCurveType: { type: String, enum: ['exponential', 'power', 'linear', 'custom'], default: 'exponential' },
        retentionDecayRate: { type: Number },
        revenueGrowthRate: { type: Number },
        seasonalityFactors: [{ type: Number }], // 12 monthly factors
        confidenceInterval: { type: Number, default: 0.95 }
    },
    
    // Analysis insights
    insights: [{
        type: { type: String, enum: ['retention', 'revenue', 'ltv', 'general'] },
        severity: { type: String, enum: ['positive', 'neutral', 'warning', 'critical'] },
        message: { type: String },
        recommendedAction: { type: String }
    }],
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    lastUpdated: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

// Method to calculate LTV
revenueCohortSchema.methods.calculateLTV = function() {
    const totalRevenue = this.metrics.reduce((sum, m) => sum + (m.revenue || 0), 0);
    const avgUsers = this.metrics.reduce((sum, m) => sum + (m.activeUsers || 0), 0) / this.metrics.length;
    this.actualLTV = avgUsers > 0 ? totalRevenue / this.initialUsers : 0;
    return this.actualLTV;
};

revenueCohortSchema.pre('save', function(next) {
    this.lastUpdated = Date.now();
    next();
});

module.exports = mongoose.model('RevenueCohort', revenueCohortSchema);