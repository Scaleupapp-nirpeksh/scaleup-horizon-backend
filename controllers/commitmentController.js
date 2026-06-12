// controllers/commitmentController.js
// CRUD + payment recording for informal commitments / pending payments.
const mongoose = require('mongoose');
const Commitment = require('../models/commitmentModel');

const EDITABLE_FIELDS = ['direction', 'counterparty', 'title', 'category', 'totalAmount',
    'dueDate', 'payWhen', 'includeInRunway', 'business', 'notes'];

function buildSummary(commitments) {
    const summary = {
        payableOutstanding: 0, receivableOutstanding: 0,
        payableCount: 0, receivableCount: 0,
        settledCount: 0, runwayImpact: 0,
    };
    for (const c of commitments) {
        const outstanding = c.status === 'waived' ? 0 : Math.max(0, c.totalAmount - c.amountPaid);
        if (['settled', 'waived'].includes(c.status)) { summary.settledCount += 1; continue; }
        if (c.direction === 'payable') {
            summary.payableOutstanding += outstanding;
            summary.payableCount += 1;
            if (c.includeInRunway) summary.runwayImpact += outstanding;
        } else {
            summary.receivableOutstanding += outstanding;
            summary.receivableCount += 1;
        }
    }
    return summary;
}

/**
 * @desc    List commitments + org-wide summary totals
 * @route   GET /api/horizon/financials/commitments?status=&direction=
 * @access  Private
 */
exports.getCommitments = async (req, res) => {
    try {
        const query = { organization: req.organization._id };
        if (req.query.direction && ['payable', 'receivable'].includes(req.query.direction)) {
            query.direction = req.query.direction;
        }
        if (req.query.status === 'open') query.status = { $in: ['pending', 'partially_paid'] };
        else if (req.query.status) query.status = req.query.status;

        const [commitments, allForSummary] = await Promise.all([
            Commitment.find(query)
                .populate('payments.recordedBy', 'name')
                .sort({ status: 1, dueDate: 1, createdAt: -1 }),
            Commitment.find({ organization: req.organization._id })
                .select('direction status totalAmount amountPaid includeInRunway'),
        ]);

        res.json({ commitments, summary: buildSummary(allForSummary) });
    } catch (err) {
        console.error('Error fetching commitments:', err.message);
        res.status(500).send('Server Error: Could not fetch commitments');
    }
};

/**
 * @desc    Create a commitment
 * @route   POST /api/horizon/financials/commitments
 * @access  Private
 */
exports.createCommitment = async (req, res) => {
    try {
        const doc = new Commitment({
            organization: req.organization._id,
            addedBy: req.user._id,
        });
        for (const f of EDITABLE_FIELDS) {
            if (req.body[f] !== undefined) doc[f] = req.body[f];
        }
        await doc.save();
        res.status(201).json({ msg: 'Commitment added', commitment: doc });
    } catch (err) {
        console.error('Error creating commitment:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: err.message });
        res.status(500).send('Server Error: Could not add commitment');
    }
};

/**
 * @desc    Update commitment fields (also: status='waived' to waive, any other
 *          allowed status to un-waive — the pre-save hook re-derives it)
 * @route   PUT /api/horizon/financials/commitments/:id
 * @access  Private
 */
exports.updateCommitment = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid commitment ID format' });
        }
        const doc = await Commitment.findOne({ _id: req.params.id, organization: req.organization._id });
        if (!doc) return res.status(404).json({ msg: 'Commitment not found in your organization' });

        for (const f of EDITABLE_FIELDS) {
            if (req.body[f] !== undefined) doc[f] = req.body[f];
        }
        if (req.body.status === 'waived') doc.status = 'waived';
        else if (req.body.status !== undefined && doc.status === 'waived') doc.status = 'pending'; // un-waive; hook re-derives

        await doc.save();
        res.json({ msg: 'Commitment updated', commitment: doc });
    } catch (err) {
        console.error('Error updating commitment:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: err.message });
        res.status(500).send('Server Error: Could not update commitment');
    }
};

/**
 * @desc    Record a (partial) payment against a commitment
 * @route   POST /api/horizon/financials/commitments/:id/payments
 * @access  Private
 */
exports.addPayment = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid commitment ID format' });
        }
        const amount = Number(req.body.amount);
        if (!amount || amount <= 0) return res.status(400).json({ msg: 'Payment amount must be greater than 0' });

        const doc = await Commitment.findOne({ _id: req.params.id, organization: req.organization._id });
        if (!doc) return res.status(404).json({ msg: 'Commitment not found in your organization' });

        const when = req.body.date ? new Date(req.body.date) : new Date();
        if (isNaN(when.getTime())) return res.status(400).json({ msg: 'Invalid payment date' });

        doc.payments.push({ date: when, amount, notes: req.body.notes, recordedBy: req.user._id });
        await doc.save();
        res.status(201).json({ msg: 'Payment recorded', commitment: doc });
    } catch (err) {
        console.error('Error recording commitment payment:', err.message);
        res.status(500).send('Server Error: Could not record payment');
    }
};

/**
 * @desc    Delete a payment entry (mis-entry correction)
 * @route   DELETE /api/horizon/financials/commitments/:id/payments/:paymentId
 * @access  Private
 */
exports.deletePayment = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid commitment ID format' });
        }
        const doc = await Commitment.findOne({ _id: req.params.id, organization: req.organization._id });
        if (!doc) return res.status(404).json({ msg: 'Commitment not found in your organization' });

        const before = doc.payments.length;
        doc.payments = doc.payments.filter(p => String(p._id) !== req.params.paymentId);
        if (doc.payments.length === before) return res.status(404).json({ msg: 'Payment entry not found' });

        await doc.save();
        res.json({ msg: 'Payment removed', commitment: doc });
    } catch (err) {
        console.error('Error deleting commitment payment:', err.message);
        res.status(500).send('Server Error: Could not delete payment');
    }
};

/**
 * @desc    Delete a commitment
 * @route   DELETE /api/horizon/financials/commitments/:id
 * @access  Private
 */
exports.deleteCommitment = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid commitment ID format' });
        }
        const doc = await Commitment.findOneAndDelete({
            _id: req.params.id,
            organization: req.organization._id,
        });
        if (!doc) return res.status(404).json({ msg: 'Commitment not found in your organization' });
        res.json({ msg: 'Commitment deleted' });
    } catch (err) {
        console.error('Error deleting commitment:', err.message);
        res.status(500).send('Server Error: Could not delete commitment');
    }
};
