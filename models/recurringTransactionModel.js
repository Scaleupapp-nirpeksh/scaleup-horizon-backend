// models/recurringTransactionModel.js
const mongoose = require('mongoose');

// Subdocument for amount variation details
const amountVariationSchema = new mongoose.Schema({
    _id: false, // ADDED: To prevent sub-document IDs if not needed
    type: { type: String, enum: ['percentage', 'range'], default: 'percentage' },
    value: { type: Number, default: 0 }, // For percentage variation (e.g., 0.1 for 10%)
    min: { type: Number, min: 0 }, // For range variation
    max: { type: Number, min: 0 }  // For range variation
});

// Subdocument for custom frequency details
const customFrequencySchema = new mongoose.Schema({
    _id: false, // ADDED
    interval: { type: Number, min: 1 }, // e.g., every 2 weeks
    unit: { type: String, enum: ['days', 'weeks', 'months'], required: true } // Made unit required if customFrequency is used
});

// Subdocument for notification settings
const notificationSettingsSchema = new mongoose.Schema({
    _id: false, // ADDED
    enabled: { type: Boolean, default: true },
    daysBefore: { type: Number, default: 1, min: 0 },
    notificationsSent: [{ // Preserved user's structure
        _id: false, // ADDED
        date: Date,
        type: String // e.g., 'Reminder', 'Confirmation'
    }]
});

// Subdocument for created transaction logs
const createdTransactionSchema = new mongoose.Schema({
    _id: false, // ADDED
    // transactionId can reference either Expense or Revenue model based on 'type'
    // This requires careful handling in application logic or a more generic Transaction model.
    transactionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    transactionType: { type: String, enum: ['Expense', 'Revenue'], required: true }, // To know which collection transactionId refers to
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['created', 'approved', 'rejected', 'failed'], default: 'created' } // Added 'failed'
});


// User's original recurringTransactionSchema - With multi-tenancy fields added
const recurringTransactionSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a recurring transaction.'], // Added required message
        index: true,
    },
    // `createdBy` and `lastModifiedBy` fields already exist and reference HorizonUser.

    // --- User's Existing Fields (Preserved) ---
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['expense', 'revenue'], required: true, index: true }, // Added index

    amount: { type: Number, required: true, min: [0, 'Amount cannot be negative.'] }, // Added min
    isVariableAmount: { type: Boolean, default: false },
    amountVariation: amountVariationSchema, // Embedded subdocument

    category: { type: String, required: true, trim: true }, // Added trim
    description: { type: String, trim: true }, // Added trim
    vendor: { type: String, trim: true }, // For expenses
    source: { type: String, trim: true }, // For revenue
    paymentMethod: { type: String, trim: true }, // Added trim, consider enum if list is fixed

    frequency: {
        type: String,
        enum: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'custom'],
        required: true
    },
    customFrequency: customFrequencySchema, // Embedded subdocument

    startDate: { type: Date, required: true },
    endDate: { type: Date }, // Optional end date
    nextDueDate: { type: Date, required: true, index: true }, // Preserved user's index

    dayOfWeek: { type: Number, min: 0, max: 6 }, // 0 = Sunday, 6 = Saturday
    dayOfMonth: { type: Number, min: 1, max: 31 },
    monthOfYear: { type: Number, min: 1, max: 12 }, // For annual

    weekOfMonth: { type: Number, min: 1, max: 5 }, // e.g., 2nd Tuesday
    adjustmentRule: { // How to handle due dates falling on weekends/holidays
        type: String,
        enum: ['exact', 'next_business_day', 'previous_business_day', 'closest_business_day', 'skip'], // Added 'skip'
        default: 'exact'
    },

    isActive: { type: Boolean, default: true, index: true }, // Preserved user's index
    isPaused: { type: Boolean, default: false },
    lastProcessedDate: { type: Date },
    totalOccurrencesGenerated: { type: Number, default: 0, min: 0 }, // Renamed for clarity, added min
    missedOccurrences: { type: Number, default: 0, min: 0 }, // Added min

    autoCreate: { type: Boolean, default: true }, // Auto-create actual transaction (expense/revenue)
    requiresApproval: { type: Boolean, default: false },
    approvalThreshold: { type: Number, min: 0 }, // Amount above which approval is needed // Added min
    daysInAdvanceToCreate: { type: Number, default: 0, min: 0 }, // Create X days before due date, renamed for clarity, added min

    notifications: notificationSettingsSchema, // Embedded subdocument

    createdTransactions: [createdTransactionSchema], // Log of transactions generated from this recurrence

    tags: [{ type: String, trim: true, lowercase: true }], // Added lowercase
    notes: { type: String, trim: true }, // Added trim
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
    // updatedAt: { type: Date, default: Date.now }  // Will be handled by timestamps: true
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'recurringtransactions', // ADDED: Explicit collection name
});

// No pre-save hook was in the original for updatedAt.
// If other pre-save logic is needed (e.g., validating customFrequency if frequency is 'custom'),
// it can be added here.
recurringTransactionSchema.pre('save', function(next) {
    if (this.frequency === 'custom' && (!this.customFrequency || !this.customFrequency.interval || !this.customFrequency.unit)) {
        return next(new Error('Custom frequency details (interval and unit) are required when frequency is set to "custom".'));
    }
    if (this.frequency !== 'custom') {
        this.customFrequency = undefined; // Clear customFrequency if not applicable
    }
    // Ensure amountVariation min/max are logical if type is 'range'
    if (this.isVariableAmount && this.amountVariation && this.amountVariation.type === 'range') {
        if (this.amountVariation.min == null || this.amountVariation.max == null) {
            return next(new Error('Min and Max values are required for range amount variation.'));
        }
        if (this.amountVariation.min > this.amountVariation.max) {
            return next(new Error('Min amount cannot be greater than Max amount for range variation.'));
        }
    }
    next();
});


// User's original Indexes - Preserved and new ones added/updated
recurringTransactionSchema.index({ organization: 1, nextDueDate: 1, isActive: 1 }); // ADDED organization
recurringTransactionSchema.index({ organization: 1, type: 1, category: 1 }); // ADDED organization
recurringTransactionSchema.index({ organization: 1, createdBy: 1 }); // ADDED organization
// Original indexes preserved but now less specific without organization:
// recurringTransactionSchema.index({ nextDueDate: 1, isActive: 1 });
// recurringTransactionSchema.index({ type: 1, category: 1 });
// recurringTransactionSchema.index({ createdBy: 1 });

const RecurringTransaction = mongoose.models.RecurringTransaction || mongoose.model('RecurringTransaction', recurringTransactionSchema);

module.exports = RecurringTransaction;
