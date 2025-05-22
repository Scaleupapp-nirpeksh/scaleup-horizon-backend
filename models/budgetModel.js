// models/budgetModel.js
const mongoose = require('mongoose');

const budgetItemSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        enum: ['Tech Infrastructure', 'Marketing & Sales', 'Salaries & Wages', 'Legal & Professional', 'Rent & Utilities', 'Software & Subscriptions', 'Travel & Entertainment', 'Office Supplies', 'Other'],
    },
    budgetedAmount: { type: Number, required: true, default: 0 },
    notes: { type: String, trim: true }
}, {_id: false});

const budgetSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, default: () => `Budget - ${new Date().getFullYear()}` }, // e.g., "Q3 2025 Budget", "Annual Budget 2026"
    periodType: {
        type: String,
        enum: ['Monthly', 'Quarterly', 'Annual', 'Custom'],
        required: true,
        default: 'Monthly'
    },
    periodStartDate: { type: Date, required: true },
    periodEndDate: { type: Date, required: true },
    totalBudgetedAmount: { type: Number, default: 0 }, // Sum of all budgetItems
    items: [budgetItemSchema],
    status: {
        type: String,
        enum: ['Draft', 'Active', 'Archived'],
        default: 'Draft'
    },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

budgetSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    this.totalBudgetedAmount = this.items.reduce((sum, item) => sum + item.budgetedAmount, 0);
    if (this.periodStartDate && this.periodEndDate && this.periodStartDate > this.periodEndDate) {
        next(new Error('Budget period start date cannot be after end date.'));
    } else {
        next();
    }
});

module.exports = mongoose.models.Budget || mongoose.model('Budget', budgetSchema);
