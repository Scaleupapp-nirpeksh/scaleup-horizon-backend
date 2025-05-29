// models/budgetModel.js
const mongoose = require('mongoose');

// Subdocument schema for individual budget items
const budgetItemSchema = new mongoose.Schema({
    category: {
        type: String,
        required: [true, 'Budget item category is required.'],
        trim: true,
        // Consider making this an enum based on common business categories or allowing user-defined categories
        enum: ['Tech Infrastructure', 'Marketing & Sales', 'Salaries & Wages', 'Legal & Professional', 'Rent & Utilities', 'Software & Subscriptions', 'Travel & Entertainment', 'Office Supplies', 'Research & Development', 'Other'],
        // maxlength: [100, 'Category name cannot exceed 100 characters.'] // If not an enum
    },
    budgetedAmount: {
        type: Number,
        required: [true, 'Budgeted amount for item is required.'],
        default: 0,
        min: [0, 'Budgeted amount cannot be negative.']
    },
    notes: {
        type: String,
        trim: true,
        maxlength: [500, 'Budget item notes cannot exceed 500 characters.']
    }
}, { _id: false }); // _id: false because this is a subdocument embedded in an array

// Main schema for a Budget
const budgetSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization', // References the Organization model from Phase 1
        required: [true, 'Organization ID is required for a budget.'],
        index: true, // Crucial for efficient querying by organization
    },
    // `createdBy` field already exists and serves a similar purpose to the `user` field
    // we added in bankAccountModel. We'll ensure it's correctly used.
    // If `createdBy` is strictly for the initial creator, and you need to track
    // last modified by a *different* user, then a separate `lastModifiedBy` field might be needed.
    // For now, assuming `createdBy` refers to the HorizonUser within the organization.

    // --- Existing Fields (with potential enhancements) ---
    name: {
        type: String,
        required: [true, 'Budget name is required.'],
        trim: true,
        maxlength: [150, 'Budget name cannot exceed 150 characters.'],
        default: function() { // Using a function for default to ensure it's evaluated at creation
            const now = new Date();
            const monthNames = ["January", "February", "March", "April", "May", "June",
                                "July", "August", "September", "October", "November", "December"];
            return `Budget - ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
        }
    },
    periodType: {
        type: String,
        enum: ['Monthly', 'Quarterly', 'Annual', 'Custom'],
        required: [true, 'Budget period type is required.'],
        default: 'Monthly'
    },
    periodStartDate: {
        type: Date,
        required: [true, 'Budget period start date is required.']
    },
    periodEndDate: {
        type: Date,
        required: [true, 'Budget period end date is required.']
    },
    totalBudgetedAmount: { // This will be calculated by the pre-save hook
        type: Number,
        default: 0,
        min: [0, 'Total budgeted amount cannot be negative.']
    },
    items: [budgetItemSchema],
    status: {
        type: String,
        enum: ['Draft', 'Active', 'Archived', 'Closed'], // Added 'Closed'
        default: 'Draft',
        index: true,
    },
    currency: { // Added currency field, should align with Organization's currency
        type: String,
        uppercase: true,
        trim: true,
        required: [true, 'Currency is required for the budget.'],
        // Default should ideally be set based on organization context when creating
        default: 'INR',
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'], // Match Organization model's enum
    },
    notes: {
        type: String,
        trim: true,
        maxlength: [2000, 'Budget notes cannot exceed 2000 characters.']
    },
    createdBy: { // This should reference HorizonUser
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: [true, 'Creator user ID is required.']
    },
    // createdAt and updatedAt are handled by timestamps: true
    // createdAt: { type: Date, default: Date.now },
    // updatedAt: { type: Date, default: Date.now },
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt
    collection: 'budgets',
});

// --- Middleware (Hooks) ---
budgetSchema.pre('save', function(next) {
    // `this.updatedAt = Date.now();` // No longer needed due to timestamps: true

    // Calculate total budgeted amount from items
    this.totalBudgetedAmount = this.items.reduce((sum, item) => sum + (item.budgetedAmount || 0), 0);

    // Validate period dates
    if (this.periodStartDate && this.periodEndDate && this.periodStartDate > this.periodEndDate) {
        const err = new Error('Budget period start date cannot be after the end date.');
        err.status = 400; // Optional: set a status for better error handling in controller
        return next(err);
    }
    next();
});

// --- Indexes ---
// Index for common queries: finding budgets for an organization by status or period type
budgetSchema.index({ organization: 1, status: 1 });
budgetSchema.index({ organization: 1, periodType: 1 });
budgetSchema.index({ organization: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } }); // Budget names unique within an org

// Ensure the model is not re-declared if already compiled (useful for some testing/hot-reloading scenarios)
module.exports = mongoose.models.Budget || mongoose.model('Budget', budgetSchema);
