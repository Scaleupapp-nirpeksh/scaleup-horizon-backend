// models/revenueModel.js
const mongoose = require('mongoose');

// User's original revenueSchema - With multi-tenancy fields added
const revenueSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a revenue entry.'], // Added required message
        index: true,
    },
    user: { // ADDED: To track which user within the organization logged this revenue
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: [true, 'User ID is required for a revenue record.'], // Added required message
        index: true,
    },

    // --- User's Existing Fields (Preserved) ---
    date: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true, min: [0, 'Revenue amount cannot be negative.'] }, // Added min
    source: { type: String, required: true, trim: true }, // e.g., "Paid Quiz Entries", "Sponsorship", "Consulting"
    description: { type: String, trim: true },
    invoiceNumber: { type: String, trim: true, index: true }, // Added trim and index
    status: { type: String, enum: ['Received', 'Pending', 'Credited', 'Refunded'], default: 'Received', index: true }, // Added 'Credited', 'Refunded', index
    notes: { type: String, trim: true }, // Added trim
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true

    // --- Currency Field (ADDED for consistency and clarity) ---
    currency: {
        type: String,
        uppercase: true,
        trim: true,
        required: [true, 'Currency is required for the revenue entry.'],
        default: 'INR', // Default, should align with Organization's default
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'], // Consistent with Organization model
    },
    // --- Optional: Link to a customer or product if applicable ---
    // customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, // If you have a Customer model
    // productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, // If you have a Product model
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'revenues', // ADDED: Explicit collection name
});

// No pre-save hook was present in the original for updatedAt,
// and timestamps: true now handles both createdAt and updatedAt.
// If other pre-save logic is needed, it can be added here.
// revenueSchema.pre('save', function(next) {
//     next();
// });

// --- Indexes (ADDED) ---
revenueSchema.index({ organization: 1, date: -1 }); // Common query: revenues for an org, sorted by date
revenueSchema.index({ organization: 1, source: 1 });
revenueSchema.index({ organization: 1, status: 1 });
revenueSchema.index({ organization: 1, user: 1 }); // Revenues logged by a particular user in an org
// If invoiceNumber should be unique within an organization:
// revenueSchema.index({ organization: 1, invoiceNumber: 1 }, { unique: true, partialFilterExpression: { invoiceNumber: { $exists: true, $ne: null, $ne: "" } } });


// Check if the model already exists before compiling it
// This prevents the OverwriteModelError (User's original export line)
module.exports = mongoose.models.Revenue || mongoose.model('Revenue', revenueSchema);
