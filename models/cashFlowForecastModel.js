// models/cashFlowForecastModel.js
const mongoose = require('mongoose');

const categoryForecastSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        enum: ['Tech Infrastructure', 'Marketing & Sales', 'Salaries & Wages', 
               'Legal & Professional', 'Rent & Utilities', 'Software & Subscriptions', 
               'Travel & Entertainment', 'Office Supplies', 'Revenue', 'Other']
    },
    baseAmount: { type: Number, required: true },
    growthRate: { type: Number, default: 0 }, // Monthly growth rate
    seasonalityFactors: [{
        month: { type: Number, min: 1, max: 12 },
        factor: { type: Number, default: 1 } // Multiplier for that month
    }],
    confidence: { type: Number, min: 0, max: 1, default: 0.8 }
}, { _id: false });

const weeklyForecastSchema = new mongoose.Schema({
    weekNumber: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    
    // Inflows
    revenueProjected: { type: Number, default: 0 },
    investmentInflows: { type: Number, default: 0 },
    otherInflows: { type: Number, default: 0 },
    totalInflows: { type: Number, default: 0 },
    
    // Outflows
    operatingExpenses: { type: Number, default: 0 },
    payroll: { type: Number, default: 0 },
    otherOutflows: { type: Number, default: 0 },
    totalOutflows: { type: Number, default: 0 },
    
    // Net position
    netCashFlow: { type: Number },
    cumulativeCashFlow: { type: Number },
    cashBalance: { type: Number },
    
    // Confidence
    confidenceLevel: { type: Number, min: 0, max: 1, default: 0.8 },
    variance: { type: Number }, // Expected variance in %
}, { _id: false });

const cashFlowForecastSchema = new mongoose.Schema({
    forecastName: { type: String, required: true, trim: true },
    description: { type: String },
    forecastType: {
        type: String,
        enum: ['Short-term', 'Medium-term', 'Long-term', 'Custom'],
        default: 'Short-term'
    },
    
    // Forecast period
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    granularity: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
    
    // Starting position
    initialCashPosition: { type: Number, required: true },
    outstandingReceivables: { type: Number, default: 0 },
    outstandingPayables: { type: Number, default: 0 },
    
    // Category-wise forecasts
    categoryForecasts: [categoryForecastSchema],
    
    // Weekly/Monthly projections
    weeklyForecasts: [weeklyForecastSchema],
    
    // Key metrics
    minimumCashBalance: { type: Number },
    minimumCashDate: { type: Date },
    requiresAdditionalFunding: { type: Boolean, default: false },
    additionalFundingNeeded: { type: Number },
    additionalFundingDate: { type: Date },
    
    // Scenario analysis
    scenarioAnalysis: {
        bestCase: {
            endingCash: { type: Number },
            minimumCash: { type: Number },
            probability: { type: Number }
        },
        worstCase: {
            endingCash: { type: Number },
            minimumCash: { type: Number },
            probability: { type: Number }
        },
        mostLikely: {
            endingCash: { type: Number },
            minimumCash: { type: Number },
            probability: { type: Number }
        }
    },
    
    // Alerts and recommendations
    alerts: [{
        severity: { type: String, enum: ['critical', 'warning', 'info'] },
        message: { type: String },
        date: { type: Date },
        metric: { type: String }
    }],
    
    // Model accuracy tracking
    modelVersion: { type: String, default: 'v1.0' },
    lastRecalibrated: { type: Date, default: Date.now },
    accuracyMetrics: {
        mape: { type: Number }, // Mean Absolute Percentage Error
        rmse: { type: Number }, // Root Mean Square Error
        r2Score: { type: Number } // R-squared score
    },
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

cashFlowForecastSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('CashFlowForecast', cashFlowForecastSchema);