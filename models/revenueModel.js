// models/revenueModel.js
const mongoose = require('mongoose');

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

// Check if the model already exists before compiling it
// This prevents the OverwriteModelError
module.exports = mongoose.models.Revenue || mongoose.model('Revenue', revenueSchema);
