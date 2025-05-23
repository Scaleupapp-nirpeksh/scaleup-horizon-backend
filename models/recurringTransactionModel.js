// models/recurringTransactionModel.js
const mongoose = require('mongoose');

const recurringTransactionSchema = new mongoose.Schema({
    // Basic Information
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['expense', 'revenue'], required: true },
    
    // Transaction Details
    amount: { type: Number, required: true },
    isVariableAmount: { type: Boolean, default: false },
    amountVariation: {
        type: { type: String, enum: ['percentage', 'range'], default: 'percentage' },
        value: { type: Number, default: 0 }, // For percentage variation
        min: Number, // For range variation
        max: Number
    },
    
    // Category and Details
    category: { type: String, required: true },
    description: { type: String },
    vendor: { type: String }, // For expenses
    source: { type: String }, // For revenue
    paymentMethod: { type: String },
    
    // Recurrence Pattern
    frequency: {
        type: String,
        enum: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'custom'],
        required: true
    },
    customFrequency: {
        interval: Number, // e.g., every 2 weeks
        unit: { type: String, enum: ['days', 'weeks', 'months'] }
    },
    
    // Schedule Details
    startDate: { type: Date, required: true },
    endDate: { type: Date }, // Optional end date
    nextDueDate: { type: Date, required: true },
    
    // Day/Date specifications
    dayOfWeek: { type: Number, min: 0, max: 6 }, // 0 = Sunday, 6 = Saturday
    dayOfMonth: { type: Number, min: 1, max: 31 },
    monthOfYear: { type: Number, min: 1, max: 12 }, // For annual
    
    // Advanced scheduling
    weekOfMonth: { type: Number, min: 1, max: 5 }, // e.g., 2nd Tuesday
    adjustmentRule: {
        type: String,
        enum: ['exact', 'next_business_day', 'previous_business_day', 'closest_business_day'],
        default: 'exact'
    },
    
    // Execution tracking
    isActive: { type: Boolean, default: true },
    isPaused: { type: Boolean, default: false },
    lastProcessedDate: { type: Date },
    totalOccurrences: { type: Number, default: 0 },
    missedOccurrences: { type: Number, default: 0 },
    
    // Auto-creation settings
    autoCreate: { type: Boolean, default: true },
    requiresApproval: { type: Boolean, default: false },
    approvalThreshold: { type: Number }, // Amount above which approval is needed
    daysInAdvance: { type: Number, default: 0 }, // Create X days before due date
    
    // Notifications
    notifications: {
        enabled: { type: Boolean, default: true },
        daysBefore: { type: Number, default: 1 },
        notificationsSent: [{ date: Date, type: String }]
    },
    
    // Associated records
    createdTransactions: [{
        transactionId: { type: mongoose.Schema.Types.ObjectId },
        transactionType: { type: String, enum: ['Expense', 'Revenue'] },
        date: Date,
        amount: Number,
        status: { type: String, enum: ['created', 'approved', 'rejected'] }
    }],
    
    // Metadata
    tags: [String],
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

recurringTransactionSchema.index({ nextDueDate: 1, isActive: 1 });
recurringTransactionSchema.index({ type: 1, category: 1 });
recurringTransactionSchema.index({ createdBy: 1 });

const RecurringTransaction = mongoose.model('RecurringTransaction', recurringTransactionSchema);
