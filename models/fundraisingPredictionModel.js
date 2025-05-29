// models/fundraisingPredictionModel.js
const mongoose = require('mongoose');

// User's original fundingMilestoneSchema - Preserved
const fundingMilestoneSchema = new mongoose.Schema({
    _id: false, // Added to prevent sub-document IDs if not needed
    name: { type: String, required: true },
    targetDate: { type: Date },
    metricType: { type: String, enum: ['users', 'revenue', 'product', 'other'] },
    targetValue: { type: Number },
    currentValue: { type: Number },
    percentageComplete: { type: Number, default: 0 },
    impact: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium' }
});

// User's original probabilityFactorSchema - Preserved
const probabilityFactorSchema = new mongoose.Schema({
    _id: false, // Added to prevent sub-document IDs if not needed
    factor: { type: String, required: true },
    weight: { type: Number, default: 1 },
    currentStatus: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
    impact: { type: Number },
    notes: { type: String }
});

// User's original fundraisingPredictionSchema - With multi-tenancy fields added
const fundraisingPredictionSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a fundraising prediction.'], // Added required message
        index: true,
    },
    // `createdBy` field already exists and references HorizonUser, serving as the user link.

    // --- User's Existing Fields (Preserved) ---
    predictionName: { type: String, required: true, trim: true },
    targetRoundSize: { type: Number, required: true },
    targetValuation: { type: Number },
    currency: { // ADDED: Currency for targetRoundSize and targetValuation
        type: String,
        uppercase: true,
        trim: true,
        required: [true, 'Currency is required for fundraising targets.'],
        default: 'INR', // Default, should align with Organization's default
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    },
    roundType: { type: String, enum: ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Bridge', 'Other'] },

    currentDate: { type: Date, default: Date.now },
    predictedStartDate: { type: Date },
    predictedCloseDate: { type: Date },
    confidenceInterval: { type: Number, default: 30 }, // +/- days

    overallProbability: { type: Number, min: 0, max: 1 },
    timelineProbability: { type: Number, min: 0, max: 1 },
    amountProbability: { type: Number, min: 0, max: 1 },

    probabilityFactors: [probabilityFactorSchema],
    keyMilestones: [fundingMilestoneSchema],

    marketConditions: { // Preserved user's structure
        _id: false, // Added
        sectorSentiment: { type: String, enum: ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'], default: 'neutral' },
        comparableDeals: [{
            _id: false, // Added
            companyName: { type: String },
            roundSize: { type: Number },
            valuation: { type: Number },
            date: { type: Date },
            similarity: { type: Number, min: 0, max: 1 }
        }],
        averageRoundSize: { type: Number },
        averageValuation: { type: Number },
        averageTimeToClose: { type: Number }
    },

    recommendations: [{ // Preserved user's structure
        _id: false, // Added
        priority: { type: String, enum: ['high', 'medium', 'low'] },
        action: { type: String, required: true },
        deadline: { type: Date },
        impact: { type: String }
    }],

    actualCloseDate: { type: Date },
    actualRoundSize: { type: Number },
    accuracyScore: { type: Number },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    linkedRoundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', index: true }, // Added index
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
    // updatedAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'fundraisingpredictions', // ADDED: Explicit collection name
});

// User's original pre('save') hook - Only manual updatedAt removed
fundraisingPredictionSchema.pre('save', function(next) {
    // this.updatedAt = Date.now(); // REMOVED: Handled by timestamps: true
    // User's existing logic can remain here if any was intended beyond updatedAt
    next();
});

// --- Indexes (ADDED) ---
fundraisingPredictionSchema.index({ organization: 1, predictionName: 1 }, {
    unique: true,
    collation: { locale: 'en', strength: 2 }, // Case-insensitive unique name within an org
    partialFilterExpression: { predictionName: { $type: "string" } }
});
fundraisingPredictionSchema.index({ organization: 1, roundType: 1 });
fundraisingPredictionSchema.index({ organization: 1, overallProbability: -1 });


module.exports = mongoose.models.FundraisingPrediction || mongoose.model('FundraisingPrediction', fundraisingPredictionSchema);
