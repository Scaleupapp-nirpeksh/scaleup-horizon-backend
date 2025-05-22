// models/roundModel.js
const mongoose = require('mongoose');

const roundSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true }, // e.g., "Pre-Seed FFF"
    targetAmount: { type: Number, required: true },
    currentValuationPreMoney: { type: Number },
    currentValuationPostMoney: { type: Number }, // Can be calculated or input
    softCommitmentsTotal: { type: Number, default: 0 },
    hardCommitmentsTotal: { type: Number, default: 0 },
    totalFundsReceived: { type: Number, default: 0 },
    openDate: { type: Date, default: Date.now },
    targetCloseDate: { type: Date },
    status: {
        type: String,
        enum: ['Planning', 'Open', 'Closing', 'Closed'],
        default: 'Planning',
    },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

roundSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Round = mongoose.model('Round', roundSchema);
module.exports = Round;
