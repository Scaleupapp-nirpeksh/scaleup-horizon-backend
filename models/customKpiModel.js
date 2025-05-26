    // models/customKpiModel.js
    const mongoose = require('mongoose');

    const customKpiSchema = new mongoose.Schema({
        name: { type: String, required: true, trim: true },
        displayName: { type: String, required: true },
        description: { type: String },
        category: {
            type: String,
            enum: ['Financial', 'Growth', 'Operational', 'Sales', 'Customer', 'Custom'],
            default: 'Custom'
        },
        
        // Formula definition
        formula: { type: String, required: true }, // e.g., "(revenue - expenses) / revenue * 100"
        formulaVariables: [{
            variable: { type: String, required: true }, // e.g., "revenue"
            source: {
                type: String,
                enum: ['revenue', 'expense', 'bank_balance', 'user_count', 'custom_metric', 'constant'],
                required: true
            },
            filter: {
                field: String, // e.g., "category", "date", "source"
                operator: String, // e.g., "equals", "contains", "between"
                value: mongoose.Schema.Types.Mixed // Can be string, number, date, array
            },
            aggregation: {
                type: String,
                enum: ['sum', 'average', 'count', 'min', 'max', 'latest'],
                default: 'sum'
            },
            timeframe: {
                type: String,
                enum: ['current_month', 'last_month', 'current_quarter', 'last_quarter', 
                    'current_year', 'last_30_days', 'last_90_days', 'all_time', 'custom'],
                default: 'current_month'
            },
            customTimeframe: {
                start: Date,
                end: Date
            }
        }],
        
        // Display settings
        displayFormat: {
            type: {
                type: String,
                enum: ['number', 'percentage', 'currency', 'ratio'],
                default: 'number'
            },
            decimals: { type: Number, default: 2 },
            prefix: String, // e.g., "$", "₹"
            suffix: String, // e.g., "%", "users"
        },
        
        // Tracking settings
        trackingFrequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'quarterly'],
            default: 'monthly'
        },
        
        // Targets and alerts
        targets: [{
            period: { type: String }, // e.g., "2025-Q1", "2025-05"
            value: { type: Number, required: true },
            type: { type: String, enum: ['min', 'max', 'exact'], default: 'min' }
        }],
        
        alerts: [{
            condition: {
                type: String,
                enum: ['above', 'below', 'equals', 'change_percent'],
                required: true
            },
            threshold: { type: Number, required: true },
            alertType: {
                type: String,
                enum: ['email', 'dashboard', 'both'],
                default: 'dashboard'
            },
            isActive: { type: Boolean, default: true }
        }],
        
        // Visualization
        visualization: {
            chartType: {
                type: String,
                enum: ['line', 'bar', 'area', 'gauge', 'number'],
                default: 'line'
            },
            color: { type: String, default: '#6366F1' },
            showTrend: { type: Boolean, default: true },
            showTarget: { type: Boolean, default: true }
        },
        
        // Calculated values cache
        cache: {
            lastCalculated: Date,
            currentValue: Number,
            previousValue: Number,
            trend: Number, // Percentage change
            historicalValues: [{
                date: Date,
                value: Number,
                target: Number
            }]
        },
        
        // Metadata
        isActive: { type: Boolean, default: true },
        isPinned: { type: Boolean, default: false }, // Show on main dashboard
        tags: [String],
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
        lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
    });

    customKpiSchema.index({ name: 1, createdBy: 1 }, { unique: true });
    customKpiSchema.index({ 'cache.lastCalculated': 1 });
    
    // Fix to prevent model redefinition
    const CustomKPI = mongoose.models.CustomKPI || mongoose.model('CustomKPI', customKpiSchema);
    module.exports = CustomKPI;