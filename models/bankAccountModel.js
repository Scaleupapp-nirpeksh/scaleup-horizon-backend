// models/bankAccountModel.js
const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization', // References the Organization model from Phase 1
        required: [true, 'Organization ID is required for a bank account.'],
        index: true, // Crucial for efficient querying by organization
    },
    user: { // The user within the organization who added/manages this bank account record
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser', // References the HorizonUser model from Phase 1
        required: [true, 'User ID is required for a bank account record.'],
        index: true,
    },
    // --- Existing Fields ---
    accountName: {
        type: String,
        required: [true, 'Account name is required.'],
        trim: true,
        maxlength: [150, 'Account name cannot exceed 150 characters.']
    },
    bankName: {
        type: String,
        required: [true, 'Bank name is required.'],
        trim: true,
        maxlength: [100, 'Bank name cannot exceed 100 characters.']
    },
    accountNumber: { // For reference, typically last 4 digits or a masked version
        type: String,
        trim: true,
        maxlength: [50, 'Account number reference cannot exceed 50 characters.']
    },
    // accountType: { // E.g., 'checking', 'savings', 'credit_card' - consider adding
    //     type: String,
    //     trim: true,
    //     enum: ['checking', 'savings', 'credit_card', 'loan', 'other']
    // },
    currentBalance: {
        type: Number,
        required: [true, 'Current balance is required.'],
        default: 0,
    },
    currency: { // This should ideally align with the Organization's default currency
        type: String,
        uppercase: true,
        trim: true,
        required: [true, 'Currency is required for the bank account.'],
        default: 'INR', // Default, but should ideally be set based on organization context
        // Consider validating against a list of supported currencies if not dynamically set
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'], // Match Organization model's enum
    },
    lastBalanceUpdate: {
        type: Date,
        default: Date.now,
    },
    notes: {
        type: String,
        trim: true,
        maxlength: [1000, 'Notes cannot exceed 1000 characters.']
    },
    // createdAt: { type: Date, default: Date.now }, // Replaced by timestamps: true
    // Consider adding an 'isActive' or 'status' field if bank accounts can be archived/closed
    // status: { type: String, enum: ['active', 'closed', 'archived'], default: 'active'}
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt
    collection: 'bankaccounts',
});

// Compound index for ensuring an account name (or number) is unique within an organization
// Adjust based on what uniquely identifies a bank account within an org
bankAccountSchema.index({ organization: 1, accountName: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
// If accountNumber should be unique within an org (and it's not masked and is reliably present):
// bankAccountSchema.index({ organization: 1, accountNumber: 1 }, { unique: true, partialFilterExpression: { accountNumber: { $exists: true, $ne: null, $ne: "" } } });


const BankAccount = mongoose.model('BankAccount', bankAccountSchema);

module.exports = BankAccount;
