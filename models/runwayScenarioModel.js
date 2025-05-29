// models/runwayScenarioModel.js
const mongoose = require('mongoose');

// User's original assumptionSchema - Preserved
const assumptionSchema = new mongoose.Schema({
    _id: false, // ADDED: To prevent sub-document IDs if not needed
    metric: { type: String, required: true }, // e.g., "monthly_burn_rate", "revenue_growth_rate"
    baseValue: { type: Number, required: true },
    growthRate: { type: Number, default: 0 }, // Monthly growth rate as decimal (0.1 = 10%)
    variancePercentage: { type: Number, default: 0 }, // For sensitivity analysis
});

// User's original monthlyProjectionSchema - Preserved
const monthlyProjectionSchema = new mongoose.Schema({
    _id: false, // ADDED: To prevent sub-document IDs if not needed
    month: { type: Number, required: true }, // Month number from start (1, 2, 3...)
    date: { type: Date, required: true },

    // Financial metrics
    startingCash: { type: Number, required: true },
    revenue: { type: Number, default: 0 },
    expenses: { type: Number, required: true },
    netCashFlow: { type: Number, required: true }, // revenue - expenses
    endingCash: { type: Number, required: true },

    // Growth metrics
    headcount: { type: Number },
    activeUsers: { type: Number },
    payingCustomers: { type: Number },

    // Runway status
    runwayRemaining: { type: Number }, // Months remaining
    isOutOfCash: { type: Boolean, default: false },
});

// User's original plannedFundraisingEventSchema (extracted for clarity, was inline)
const plannedFundraisingEventSchema = new mongoose.Schema({
    _id: false, // ADDED
    month: { type: Number, required: [true, 'Month for fundraising event is required.'] }, // Added required
    amount: { type: Number, required: [true, 'Amount for fundraising event is required.'], min: 0 }, // Added required, min
    currency: { // ADDED: Currency for the fundraising amount
        type: String,
        uppercase: true,
        trim: true,
        required: [true, 'Currency is required for the fundraising event amount.'],
        default: 'INR',
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    },
    probability: { type: Number, default: 1.0, min: 0, max: 1 }, // Added min/max
    notes: { type: String, trim: true } // Added trim
});

// User's original runwayScenarioSchema - With multi-tenancy fields added
const runwayScenarioSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a runway scenario.'], // Added required message
        index: true,
    },
    // `createdBy` field already exists and references HorizonUser.

    // --- User's Existing Fields (Preserved) ---
    name: { type: String, required: true, trim: true }, // e.g., "Conservative", "Base Case", "Aggressive"
    description: { type: String, trim: true },
    scenarioType: {
        type: String,
        enum: ['Conservative', 'Base', 'Optimistic', 'Custom'],
        default: 'Custom'
    },
    currency: { // ADDED: Main currency for this scenario's monetary values
        type: String,
        uppercase: true,
        trim: true,
        required: [true, 'Currency is required for the runway scenario.'],
        default: 'INR',
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    },
    startDate: { type: Date, required: true, default: Date.now },
    initialCashBalance: { type: Number, required: true }, // Can be negative (overdraft)
    initialMonthlyBurn: { type: Number, required: true, min: 0 }, // Burn is typically positive, Added min
    initialMonthlyRevenue: { type: Number, default: 0, min: 0 }, // Added min

    assumptions: [assumptionSchema],

    projectionMonths: { type: Number, default: 24, min: [1, 'Projection must be for at least 1 month.'] }, // Added min
    monthlyProjections: [monthlyProjectionSchema],

    totalRunwayMonths: { type: Number, min: 0 }, // Added min
    dateOfCashOut: { type: Date },
    totalCashBurned: { type: Number, min: 0 }, // Added min
    totalRevenueGenerated: { type: Number, min: 0 }, // Added min
    breakEvenMonth: { type: Number, min: 0 }, // Month number when profitable, null if never, Added min

    plannedFundraisingEvents: [plannedFundraisingEventSchema],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    isActive: { type: Boolean, default: true, index: true }, // Added index to isActive
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
    // updatedAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'runwayscenarios', // ADDED: Explicit collection name
});

// User's original pre('save') hook - Only manual updatedAt removed
runwayScenarioSchema.pre('save', function(next) {
    // this.updatedAt = Date.now(); // REMOVED: Handled by timestamps: true
    // User's existing logic can remain here if any was intended beyond updatedAt
    if (this.startDate && this.monthlyProjections && this.monthlyProjections.length > 0) {
        const firstProjectionDate = new Date(this.monthlyProjections[0].date);
        if (firstProjectionDate < this.startDate) {
            // Potentially add validation or adjustment logic here
        }
    }
    next();
});

// User's original Index - Preserved and new ones added
runwayScenarioSchema.index({ organization: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } }); // ADDED: Name unique within org
runwayScenarioSchema.index({ organization: 1, createdBy: 1, isActive: 1, createdAt: -1 }); // ADDED: organization to existing index
// Original index: runwayScenarioSchema.index({ createdBy: 1, isActive: 1, createdAt: -1 }); // Now less specific

module.exports = mongoose.models.RunwayScenario || mongoose.model('RunwayScenario', runwayScenarioSchema);
