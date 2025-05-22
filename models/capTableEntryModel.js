// models/capTableEntryModel.js
const mongoose = require('mongoose');

const capTableEntrySchema = new mongoose.Schema({
    shareholderName: { type: String, required: true }, // Founder name, Investor name, "ESOP Pool"
    shareholderType: {
        type: String,
        enum: ['Founder', 'Investor', 'ESOP Pool', 'Other'],
        required: true,
    },
    numberOfShares: { type: Number }, // Or units for SAFEs/Notes before conversion
    percentageOwnership: { type: Number }, // This will be calculated and displayed
    securityType: {
        type: String,
        enum: ['Common Stock', 'Preferred Stock', 'SAFE', 'Convertible Note', 'Option Pool'],
        required: true,
    },
    investmentAmount: { type: Number }, // For investors
    grantDate: { type: Date }, // For founders/ESOP
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

capTableEntrySchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const CapTableEntry = mongoose.model('CapTableEntry', capTableEntrySchema);
module.exports = CapTableEntry;
