// models/cashFlowForecastModel.js
const mongoose = require('mongoose');

// User's original categoryForecastSchema - Preserved
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
        _id: false, // Added to prevent sub-document IDs if not needed
        month: { type: Number, min: 1, max: 12 },
        factor: { type: Number, default: 1 } // Multiplier for that month
    }],
    confidence: { type: Number, min: 0, max: 1, default: 0.8 }
}, { _id: false });

// User's original weeklyForecastSchema - Preserved
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

// Main cashFlowForecastSchema with multi-tenancy fields added
const cashFlowForecastSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a cash flow forecast.'],
        index: true,
    },
    // `createdBy` field already exists and references HorizonUser, serving as the user link.

    // --- User's Existing Fields (Preserved) ---
    forecastName: { type: String, required: true, trim: true },
    description: { type: String, trim: true }, // Added trim
    forecastType: {
        type: String,
        enum: ['Short-term', 'Medium-term', 'Long-term', 'Custom'],
        default: 'Short-term'
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    granularity: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },

    initialCashPosition: { type: Number, required: true },
    outstandingReceivables: { type: Number, default: 0 },
    outstandingPayables: { type: Number, default: 0 },

    categoryForecasts: [categoryForecastSchema],
    weeklyForecasts: [weeklyForecastSchema], // Preserved user's naming

    minimumCashBalance: { type: Number },
    minimumCashDate: { type: Date },
    requiresAdditionalFunding: { type: Boolean, default: false },
    additionalFundingNeeded: { type: Number },
    additionalFundingDate: { type: Date },

    scenarioAnalysis: { // Preserved user's structure
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

    alerts: [{ // Preserved user's structure
        _id: false, // Added to prevent sub-document IDs if not needed
        severity: { type: String, enum: ['critical', 'warning', 'info'] },
        message: { type: String },
        date: { type: Date },
        metric: { type: String }
    }],

    modelVersion: { type: String, default: 'v1.0' },
    lastRecalibrated: { type: Date, default: Date.now },
    accuracyMetrics: { // Preserved user's structure
        mape: { type: Number }, // Mean Absolute Percentage Error
        rmse: { type: Number }, // Root Mean Square Error
        r2Score: { type: Number } // R-squared score
    },

    // --- Currency Field (ADDED for consistency) ---
    currency: {
        type: String,
        uppercase: true,
        trim: true,
        required: [true, 'Currency is required for the forecast.'],
        default: 'INR', // Default, should align with Organization's default
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'], // Consistent with Organization model
    },

    createdBy: { // Ensuring ref is correct as per our HorizonUser model
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: true
    },
    isActive: { type: Boolean, default: true, index: true }, // Added index

    // createdAt and updatedAt will be handled by timestamps: true
    // createdAt: { type: Date, default: Date.now }, // User's original
    // updatedAt: { type: Date, default: Date.now }, // User's original
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'cashflowforecasts', // ADDED: Explicit collection name
});

// User's original pre('save') hook - modified to remove manual updatedAt
cashFlowForecastSchema.pre('save', function(next) {
    // this.updatedAt = Date.now(); // REMOVED: Handled by timestamps: true
    // Any other pre-save logic the user might add later can go here.
    // For example, validating startDate vs endDate
    if (this.startDate && this.endDate && this.startDate > this.endDate) {
        const err = new Error('Forecast start date cannot be after the end date.');
        // err.status = 400; // Optional: for controller to pick up
        return next(err);
    }
    next();
});

// --- Indexes (ADDED) ---
cashFlowForecastSchema.index({ organization: 1, isActive: 1, forecastType: 1 });
cashFlowForecastSchema.index({ organization: 1, forecastName: 1 }, {
    unique: true,
    collation: { locale: 'en', strength: 2 }, // Case-insensitive unique name within an org
    partialFilterExpression: { forecastName: { $type: "string" } } // Only apply unique if name exists
});


module.exports = mongoose.models.CashFlowForecast || mongoose.model('CashFlowForecast', cashFlowForecastSchema);
