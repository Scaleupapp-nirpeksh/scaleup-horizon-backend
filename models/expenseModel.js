// models/expenseModel.js
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    date: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true },
    category: {
        type: String,
        required: true,
        enum: ['Tech Infrastructure', 'Marketing & Sales', 'Salaries & Wages', 'Legal & Professional', 'Rent & Utilities', 'Software & Subscriptions', 'Travel & Entertainment', 'Office Supplies', 'Other'],
    },
    vendor: { type: String, trim: true },
    description: { type: String, required: true, trim: true },
    paymentMethod: { type: String, enum: ['Bank Transfer', 'Credit Card', 'Cash', 'UPI'] },
    receiptUrl: { type: String }, // Optional: link to uploaded receipt
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
});

// Check if the model already exists before compiling it
// This prevents the OverwriteModelError
module.exports = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
