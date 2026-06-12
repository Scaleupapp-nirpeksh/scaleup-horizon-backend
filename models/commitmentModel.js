// models/commitmentModel.js
// Informal commitments & pending payments — the money the company owes
// (team dues, founder reimbursements, vendor dues) or is owed, that never
// shows up in bank balances or the expense ledger. Feeds "honest runway".
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true, min: 0.01 },
    notes: { type: String, trim: true, maxlength: 500 },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },
}, { _id: true });

const commitmentSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },

    // 'payable' = we owe this; 'receivable' = someone owes us
    direction: {
        type: String,
        enum: ['payable', 'receivable'],
        default: 'payable',
        index: true,
    },
    counterparty: { type: String, required: [true, 'Counterparty is required'], trim: true, maxlength: 200 },
    title: { type: String, trim: true, maxlength: 300 },
    category: {
        type: String,
        enum: ['team_dues', 'founder_reimbursement', 'vendor', 'subscription', 'deposit', 'loan', 'other'],
        default: 'other',
        index: true,
    },

    totalAmount: { type: Number, required: [true, 'Amount is required'], min: 0.01 },
    payments: [paymentSchema],
    // Maintained in pre-save from payments[] so list queries never re-sum
    amountPaid: { type: Number, default: 0, min: 0 },

    // 'waived' is the only manually-set status; the rest derive from payments
    status: {
        type: String,
        enum: ['pending', 'partially_paid', 'settled', 'waived'],
        default: 'pending',
        index: true,
    },

    dueDate: { type: Date, default: null },
    // Free-text trigger when there is no hard date ("After FFF round closes")
    payWhen: { type: String, trim: true, maxlength: 200 },

    // Counts against cash when computing honest runway (default yes for payables)
    includeInRunway: { type: Boolean, default: true },

    business: { type: String, trim: true, maxlength: 100 },
    notes: { type: String, trim: true, maxlength: 2000 },
}, { timestamps: true, collection: 'commitments' });

commitmentSchema.index({ organization: 1, status: 1, direction: 1 });

commitmentSchema.pre('save', function (next) {
    this.amountPaid = (this.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    if (this.status !== 'waived') {
        this.status = this.amountPaid <= 0 ? 'pending'
            : this.amountPaid >= this.totalAmount ? 'settled'
            : 'partially_paid';
    }
    next();
});

commitmentSchema.virtual('outstanding').get(function () {
    if (this.status === 'waived') return 0;
    return Math.max(0, (this.totalAmount || 0) - (this.amountPaid || 0));
});

commitmentSchema.set('toJSON', { virtuals: true });
commitmentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Commitment', commitmentSchema);
