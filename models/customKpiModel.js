// models/customKpiModel.js
const mongoose = require('mongoose');

// --- Subdocument Schemas (User's Original Structure Preserved with minor additions) ---

const formulaVariableSchema = new mongoose.Schema({
    _id: false, // No separate _id for these subdocuments
    variable: {
        type: String,
        required: [true, 'Variable name in formula is required.'],
        trim: true,
        maxlength: [50, 'Variable name cannot exceed 50 characters.']
    },
    source: {
        type: String,
        enum: ['revenue', 'expense', 'bank_balance', 'user_count', 'headcount', 'custom_metric', 'manual_input', 'constant'], // Added 'headcount', 'manual_input'
        required: [true, 'Source for formula variable is required.']
    },
    filter: { // Optional filter for the data source
        _id: false,
        field: { type: String, trim: true, maxlength: [50, 'Filter field name cannot exceed 50 characters.'] },
        operator: {
            type: String,
            // Add more operators as needed by your kpiService
            enum: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equals', 'less_than_or_equals', 'contains', 'starts_with', 'ends_with', 'in_array', 'not_in_array', 'between']
        },
        value: mongoose.Schema.Types.Mixed // Can be string, number, date, array of values
    },
    aggregation: {
        type: String,
        enum: ['sum', 'average', 'count', 'min', 'max', 'latest', 'earliest'], // Added 'earliest'
        default: 'sum'
    },
    timeframe: {
        type: String,
        enum: ['current_day', 'previous_day', 'current_week', 'previous_week', 'current_month', 'last_month', 'current_quarter', 'last_quarter',
               'current_year', 'last_year', 'last_7_days', 'last_30_days', 'last_90_days', 'last_365_days', 'month_to_date', 'quarter_to_date', 'year_to_date', 'all_time', 'custom'], // Expanded options
        default: 'current_month'
    },
    customTimeframe: { // Used if timeframe is 'custom'
        _id: false,
        start: { type: Date },
        end: { type: Date }
    }
});

const displayFormatSchema = new mongoose.Schema({
    _id: false,
    type: {
        type: String,
        enum: ['number', 'percentage', 'currency', 'ratio', 'duration_days', 'duration_hm'], // Added duration
        default: 'number'
    },
    decimals: {
        type: Number,
        default: 2,
        min: [0, 'Number of decimals cannot be negative.'],
        max: [6, 'Number of decimals cannot exceed 6.']
    },
    prefix: { type: String, trim: true, maxlength: [10, 'Prefix cannot exceed 10 characters.'] }, // e.g., "$", "₹"
    suffix: { type: String, trim: true, maxlength: [10, 'Suffix cannot exceed 10 characters.'] }  // e.g., "%", "users"
});

const kpiTargetSchema = new mongoose.Schema({
    _id: false,
    period: { type: String, trim: true, maxlength: [20, 'Target period cannot exceed 20 characters.'] }, // e.g., "2025-Q1", "2025-05", "Overall"
    value: { type: Number, required: [true, 'Target value is required.'] },
    type: { type: String, enum: ['min', 'max', 'exact', 'range_min', 'range_max'], default: 'min' } // Added range
});

const kpiAlertSchema = new mongoose.Schema({
    _id: false,
    condition: {
        type: String,
        enum: ['above_target', 'below_target', 'equals_target', 'percentage_change_increase', 'percentage_change_decrease', 'absolute_value_above', 'absolute_value_below'], // Expanded
        required: [true, 'Alert condition is required.']
    },
    threshold: { type: Number, required: [true, 'Alert threshold is required.'] }, // For percentage_change or absolute_value
    // targetPeriod: { type: String }, // Link to a specific target if alert is target-based
    alertType: {
        type: String,
        enum: ['email', 'dashboard', 'in_app_notification', 'all'], // Added in_app, all
        default: 'dashboard'
    },
    recipients: [{ type: String, trim: true }], // Could be user emails or role names
    messageTemplate: { type: String, trim: true, maxlength: [500, 'Alert message template cannot exceed 500 characters.'] }, // Optional custom message
    isActive: { type: Boolean, default: true }
});

const kpiVisualizationSchema = new mongoose.Schema({
    _id: false,
    chartType: {
        type: String,
        enum: ['line', 'bar', 'area', 'gauge', 'number_card', 'progress_bar', 'sparkline'], // Expanded
        default: 'line'
    },
    color: { type: String, default: '#6366F1', trim: true, maxlength: [20, 'Color hex/name cannot exceed 20 characters.'] }, // Allow more color formats
    showTrend: { type: Boolean, default: true },
    showTarget: { type: Boolean, default: true },
    // goalLineValue: { type: Number } // Optional goal line on chart
});

const kpiCacheSchema = new mongoose.Schema({
    _id: false,
    lastCalculated: { type: Date },
    currentValue: { type: Number },
    previousValue: { type: Number }, // Value from the prior period for trend calculation
    trend: { type: Number }, // Percentage change from previousValue to currentValue
    historicalValues: [{ // Stores periodic snapshots for charting
        _id: false,
        date: { type: Date, required: true }, // End date of the period this value represents
        value: { type: Number, required: true },
        target: { type: Number } // Target for that specific period, if applicable
    }]
});


// --- Main Custom KPI Schema ---
const customKpiSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a custom KPI.'],
        index: true,
    },
    // `createdBy` and `lastModifiedBy` already exist and reference HorizonUser.

    // --- User's Existing Fields (Preserved with minor enhancements) ---
    name: { // Internal programmatic name, should be unique within an org
        type: String,
        required: [true, 'Internal KPI name is required.'],
        trim: true,
        lowercase: true, // Good for programmatic use
        match: [/^[a-z0-9_]+$/, 'KPI name can only contain lowercase letters, numbers, and underscores.'],
        maxlength: [50, 'Internal KPI name cannot exceed 50 characters.']
    },
    displayName: { // User-facing name
        type: String,
        required: [true, 'Display name for KPI is required.'],
        trim: true,
        maxlength: [100, 'Display name cannot exceed 100 characters.']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters.']
    },
    category: {
        type: String,
        enum: ['Financial', 'Growth', 'Operational', 'Sales', 'Marketing', 'Product', 'Customer Success', 'Team', 'Custom'], // Expanded
        default: 'Custom',
        trim: true,
    },

    formula: {
        type: String,
        required: [true, 'KPI formula is required.'],
        trim: true,
        maxlength: [1000, 'Formula cannot exceed 1000 characters.']
    }, // e.g., "(revenue - expenses) / revenue * 100"
    formulaVariables: [formulaVariableSchema],

    displayFormat: displayFormatSchema, // Embedded subdocument

    trackingFrequency: { // How often the KPI value is expected to be snapshotted/calculated
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'quarterly', 'annually'], // Added 'annually'
        default: 'monthly'
    },

    targets: [kpiTargetSchema], // Embedded array of targets
    alerts: [kpiAlertSchema],   // Embedded array of alerts

    visualization: kpiVisualizationSchema, // Embedded subdocument
    cache: kpiCacheSchema,                 // Embedded subdocument for calculated values

    // Metadata
    isActive: { type: Boolean, default: true, index: true }, // Added index
    isPinned: { type: Boolean, default: false }, // Show on main dashboard
    tags: [{ type: String, trim: true, lowercase: true, maxlength: [30, 'Tag cannot exceed 30 characters.'] }],

    createdBy: { // Ensuring ref is correct
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: [true, 'Creator user ID is required.']
    },
    lastModifiedBy: { // Ensuring ref is correct
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser'
    },
    // createdAt and updatedAt are handled by timestamps: true
    // createdAt: { type: Date, default: Date.now }, // User's original
    // updatedAt: { type: Date, default: Date.now }  // User's original
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'customkpis', // ADDED: Explicit collection name
});

// --- Middleware (Hooks) ---
customKpiSchema.pre('save', function(next) {
    // `this.updatedAt = Date.now();` // REMOVED: Handled by timestamps: true
    if (this.isModified('name') && this.name) {
        this.name = this.name.toLowerCase().replace(/\s+/g, '_'); // Sanitize internal name
    }
    // Add any other pre-save validation or data manipulation logic here
    next();
});

// --- Indexes (Updated) ---
// Unique KPI internal name within an organization
customKpiSchema.index({ organization: 1, name: 1 }, { unique: true });
customKpiSchema.index({ organization: 1, displayName: 1 }, { collation: { locale: 'en', strength: 2 } }); // Display names can be similar but good to index
customKpiSchema.index({ organization: 1, isActive: 1, category: 1 });
customKpiSchema.index({ organization: 1, isPinned: 1 });
customKpiSchema.index({ organization: 1, tags: 1 }); // For searching by tags within an org
customKpiSchema.index({ 'cache.lastCalculated': 1 }); // User's original index

// Fix to prevent model redefinition (User's original)
const CustomKPI = mongoose.models.CustomKPI || mongoose.model('CustomKPI', customKpiSchema);
module.exports = CustomKPI;
