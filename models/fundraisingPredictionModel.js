// models/fundraisingPredictionModel.js
const mongoose = require('mongoose');

const fundingMilestoneSchema = new mongoose.Schema({
    name: { type: String, required: true }, // e.g., "Reach 10K MAU", "Launch v2"
    targetDate: { type: Date },
    metricType: { type: String, enum: ['users', 'revenue', 'product', 'other'] },
    targetValue: { type: Number },
    currentValue: { type: Number },
    percentageComplete: { type: Number, default: 0 },
    impact: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium' }
}, { _id: false });

const probabilityFactorSchema = new mongoose.Schema({
    factor: { type: String, required: true }, // e.g., "Current burn rate", "Market conditions"
    weight: { type: Number, default: 1 }, // Importance weight
    currentStatus: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
    impact: { type: Number }, // -1 to 1, how it affects probability
    notes: { type: String }
}, { _id: false });

const fundraisingPredictionSchema = new mongoose.Schema({
    predictionName: { type: String, required: true, trim: true },
    targetRoundSize: { type: Number, required: true },
    targetValuation: { type: Number },
    roundType: { type: String, enum: ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Bridge', 'Other'] },
    
    // Timeline predictions
    currentDate: { type: Date, default: Date.now },
    predictedStartDate: { type: Date },
    predictedCloseDate: { type: Date },
    confidenceInterval: { type: Number, default: 30 }, // +/- days
    
    // Probability calculations
    overallProbability: { type: Number, min: 0, max: 1 }, // 0-1
    timelineProbability: { type: Number, min: 0, max: 1 },
    amountProbability: { type: Number, min: 0, max: 1 },
    
    // Factors affecting probability
    probabilityFactors: [probabilityFactorSchema],
    
    // Milestones to track
    keyMilestones: [fundingMilestoneSchema],
    
    // Market analysis
    marketConditions: {
        sectorSentiment: { type: String, enum: ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'], default: 'neutral' },
        comparableDeals: [{
            companyName: { type: String },
            roundSize: { type: Number },
            valuation: { type: Number },
            date: { type: Date },
            similarity: { type: Number, min: 0, max: 1 } // How similar to our company
        }],
        averageRoundSize: { type: Number },
        averageValuation: { type: Number },
        averageTimeToClose: { type: Number } // Days
    },
    
    // Recommendations
    recommendations: [{
        priority: { type: String, enum: ['high', 'medium', 'low'] },
        action: { type: String, required: true },
        deadline: { type: Date },
        impact: { type: String }
    }],
    
    // Historical accuracy (for ML improvement)
    actualCloseDate: { type: Date },
    actualRoundSize: { type: Number },
    accuracyScore: { type: Number }, // Calculated post-facto
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    linkedRoundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

fundraisingPredictionSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('FundraisingPrediction', fundraisingPredictionSchema);