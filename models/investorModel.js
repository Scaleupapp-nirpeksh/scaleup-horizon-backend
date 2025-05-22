// models/investorModel.js
const mongoose = require('mongoose');

const trancheSchema = new mongoose.Schema({
    trancheNumber: { type: Number, required: true },
    agreedAmount: { type: Number, required: true },
    receivedAmount: { type: Number, default: 0 },
    dateAgreed: { type: Date },
    dateReceived: { type: Date },
    triggerCondition: { type: String }, // e.g., "Milestone X reached", "Specific Date"
    status: {
        type: String,
        enum: ['Pending', 'Partially Received', 'Fully Received', 'Cancelled'],
        default: 'Pending',
    },
});

const investorSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    entityName: { type: String, trim: true }, // If investing via a company/fund
    investmentVehicle: {
        type: String,
        enum: ['SAFE', 'Convertible Note', 'Equity', 'Other'],
    },
    // SAFE/Note specific terms (simplified for MVP)
    safeValuationCap: { type: Number },
    safeDiscountRate: { type: Number }, // e.g., 0.2 for 20%
    noteInterestRate: { type: Number },
    noteMaturityDate: { type: Date },

    totalCommittedAmount: { type: Number, default: 0 },
    totalReceivedAmount: { type: Number, default: 0 },
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', required: true },
    tranches: [trancheSchema],
    status: { // Overall status of this investor in the round
        type: String,
        enum: ['Introduced', 'Pitched', 'Soft Committed', 'Hard Committed', 'Invested', 'Declined'],
        default: 'Introduced',
    },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

investorSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    // Recalculate total committed and received from tranches if needed, or handle in controller
    this.totalCommittedAmount = this.tranches.reduce((sum, t) => sum + t.agreedAmount, 0);
    this.totalReceivedAmount = this.tranches.reduce((sum, t) => sum + t.receivedAmount, 0);
    next();
});

const Investor = mongoose.model('Investor', investorSchema);
module.exports = Investor;
