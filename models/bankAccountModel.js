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





