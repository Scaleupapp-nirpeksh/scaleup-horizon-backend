// models/expenseModel.js
const mongoose = require('mongoose');

// User's original expenseSchema - With multi-tenancy fields added
const expenseSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for an expense.'], // Added required message
        index: true,
    },
    user: { // ADDED: To track which user within the organization logged this expense
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: [true, 'User ID is required for an expense record.'], // Added required message
        index: true,
    },

    // --- User's Existing Fields (Preserved) ---
    date: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true },
    category: {
        type: String,
        required: true,
        enum: ['Tech Infrastructure', 'Marketing & Sales', 'Salaries & Wages', 'Legal & Professional', 'Rent & Utilities', 'Software & Subscriptions', 'Travel & Entertainment', 'Office Supplies', 'Other'],
    },
    vendor: { type: String, trim: true },
    description: { type: String, required: true, trim: true },
    paymentMethod: { type: String, enum: ['Bank Transfer', 'Credit Card', 'Cash', 'UPI', 'Other'] }, // Added 'Other'
    receiptUrl: { type: String, trim: true }, // Optional: link to uploaded receipt, added trim
    notes: { type: String, trim: true }, // Added trim
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true

    // --- Currency Field (ADDED for consistency and clarity) ---
    currency: {
        type: String,
        uppercase: true,
        trim: true,
        required: [true, 'Currency is required for the expense.'],
        default: 'INR', // Default, should align with Organization's default
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'], // Consistent with Organization model
    },
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'expenses', // ADDED: Explicit collection name
});

// No pre-save hook was present in the original for updatedAt,
// and timestamps: true now handles both createdAt and updatedAt.

// --- Indexes (ADDED) ---
expenseSchema.index({ organization: 1, date: -1 }); // Common query: expenses for an org, sorted by date
expenseSchema.index({ organization: 1, category: 1 });
expenseSchema.index({ organization: 1, user: 1 }); // Expenses logged by a particular user in an org

// Check if the model already exists before compiling it
// This prevents the OverwriteModelError (User's original export line)
module.exports = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
