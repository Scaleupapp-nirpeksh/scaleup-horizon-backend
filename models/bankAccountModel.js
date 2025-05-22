// models/bankAccountModel.js
const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
    accountName: { type: String, required: true, trim: true }, // e.g., "ScaleUp Operations HDFC"
    bankName: { type: String, required: true },
    accountNumber: { type: String }, // For reference, actual balance manually updated
    currentBalance: { type: Number, required: true, default: 0 },
    currency: { type: String, default: 'INR' },
    lastBalanceUpdate: { type: Date, default: Date.now },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
});
const BankAccount = mongoose.model('BankAccount', bankAccountSchema);

// models/expenseModel.js
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
const Expense = mongoose.model('Expense', expenseSchema);

// models/revenueModel.js
const revenueSchema = new mongoose.Schema({
    date: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true },
    source: { type: String, required: true, trim: true }, // e.g., "Paid Quiz Entries", "Sponsorship", "Consulting"
    description: { type: String, trim: true },
    invoiceNumber: { type: String },
    status: { type: String, enum: ['Received', 'Pending'], default: 'Received' },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
});
const Revenue = mongoose.model('Revenue', revenueSchema);

module.exports = { BankAccount, Expense, Revenue };
