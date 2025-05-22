// models/documentModel.js
const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    fileName: { type: String, required: true, trim: true },
    fileType: { type: String, required: true }, // e.g., 'application/pdf', 'image/jpeg'
    fileSize: { type: Number }, // in bytes
    storageUrl: { type: String, required: true }, // URL from S3 or other storage
    storageKey: { type: String, required: true }, // Key for S3 object, for deletion
    description: { type: String, trim: true },
    category: {
        type: String,
        enum: ['Investor Agreement', 'Financial Report', 'Pitch Deck', 'Legal', 'Other'],
        default: 'Other'
    },
    associatedRoundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round' },
    associatedInvestorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor' },
    // Add other associations as needed, e.g., associatedExpenseId
    tags: [{ type: String, trim: true }],
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

documentSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.models.Document || mongoose.model('Document', documentSchema);
