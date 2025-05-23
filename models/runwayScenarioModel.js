// models/runwayScenarioModel.js
const mongoose = require('mongoose');

const assumptionSchema = new mongoose.Schema({
    metric: { type: String, required: true }, // e.g., "monthly_burn_rate", "revenue_growth_rate"
    baseValue: { type: Number, required: true },
    growthRate: { type: Number, default: 0 }, // Monthly growth rate as decimal (0.1 = 10%)
    variancePercentage: { type: Number, default: 0 }, // For sensitivity analysis
}, { _id: false });

const monthlyProjectionSchema = new mongoose.Schema({
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
}, { _id: false });

const runwayScenarioSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true }, // e.g., "Conservative", "Base Case", "Aggressive"
    description: { type: String, trim: true },
    scenarioType: {
        type: String,
        enum: ['Conservative', 'Base', 'Optimistic', 'Custom'],
        default: 'Custom'
    },
    
    // Starting conditions
    startDate: { type: Date, required: true, default: Date.now },
    initialCashBalance: { type: Number, required: true },
    initialMonthlyBurn: { type: Number, required: true },
    initialMonthlyRevenue: { type: Number, default: 0 },
    
    // Assumptions
    assumptions: [assumptionSchema],
    
    // Projections
    projectionMonths: { type: Number, default: 24 }, // How many months to project
    monthlyProjections: [monthlyProjectionSchema],
    
    // Summary metrics
    totalRunwayMonths: { type: Number },
    dateOfCashOut: { type: Date },
    totalCashBurned: { type: Number },
    totalRevenueGenerated: { type: Number },
    breakEvenMonth: { type: Number }, // Month number when profitable, null if never
    
    // Fundraising assumptions
    plannedFundraisingEvents: [{
        month: { type: Number },
        amount: { type: Number },
        probability: { type: Number, default: 1.0 }, // 0-1 probability
        notes: { type: String }
    }],
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    isActive: { type: Boolean, default: true }, // For soft delete
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

runwayScenarioSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Index for faster queries
runwayScenarioSchema.index({ createdBy: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model('RunwayScenario', runwayScenarioSchema);