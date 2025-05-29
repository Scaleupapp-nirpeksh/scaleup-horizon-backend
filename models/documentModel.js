// models/documentModel.js
const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization', // References the Organization model from Phase 1
        required: [true, 'Organization ID is required for a document.'],
        index: true, // Crucial for efficient querying by organization
    },
    // `uploadedBy` field already exists and references HorizonUser, serving as the user link.

    // --- User's Existing Fields (Preserved with minor enhancements) ---
    fileName: {
        type: String,
        required: [true, 'File name is required.'],
        trim: true,
        maxlength: [255, 'File name cannot exceed 255 characters.'] // Added maxlength
    },
    fileType: { // e.g., 'application/pdf', 'image/jpeg', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        type: String,
        required: [true, 'File type (MIME type) is required.'],
        trim: true,
        lowercase: true, // MIME types are generally case-insensitive but often stored lowercase
        maxlength: [100, 'File type cannot exceed 100 characters.']
    },
    fileSize: { // in bytes
        type: Number,
        min: [0, 'File size cannot be negative.'] // Added min validation
    },
    storageUrl: { // URL from S3, Google Cloud Storage, Azure Blob Storage, etc.
        type: String,
        required: [true, 'Storage URL is required.'],
        trim: true,
        // Consider adding URL validation if needed, though often provider-specific
        maxlength: [1024, 'Storage URL cannot exceed 1024 characters.']
    },
    storageKey: { // Key/path for the object in S3 or other storage, useful for deletion/management
        type: String,
        required: [true, 'Storage key/path is required.'],
        trim: true,
        maxlength: [1024, 'Storage key cannot exceed 1024 characters.']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters.']
    },
    category: {
        type: String,
        enum: [
            'Investor Agreement', 'Shareholder Agreement', 'Financial Report', 'Pitch Deck', 'Board Minutes',
            'Legal Document', 'Compliance Document', 'Invoice', 'Receipt', 'Contract', 'Employee Document', 'Other'
        ], // Expanded enum
        default: 'Other',
        trim: true,
    },
    // Associations - these should also be organization-scoped when queried/linked
    associatedRoundId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Round', // Assuming you have a Round model
        index: true, // Index if you query documents by round
    },
    associatedInvestorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Investor', // Assuming you have an Investor model
        index: true, // Index if you query documents by investor
    },
    associatedMeetingId: { // Example: link to an InvestorMeeting
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InvestorMeeting',
        index: true,
    },
    // Add other associations as needed, e.g., associatedExpenseId, associatedKPIId

    tags: [{
        type: String,
        trim: true,
        lowercase: true,
        maxlength: [50, 'Tag cannot exceed 50 characters.']
    }],

    uploadedBy: { // Ensuring ref is correct as per our HorizonUser model
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: [true, 'Uploader user ID is required.']
    },
    // createdAt and updatedAt will be handled by timestamps: true
    // createdAt: { type: Date, default: Date.now }, // User's original
    // updatedAt: { type: Date, default: Date.now }, // User's original
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'documents', // ADDED: Explicit collection name
});

// User's original pre('save') hook - modified to remove manual updatedAt
documentSchema.pre('save', function(next) {
    // this.updatedAt = Date.now(); // REMOVED: Handled by timestamps: true
    // Add any other pre-save logic here if needed
    if (this.isModified('fileName') && this.fileName) {
        // Example: sanitize filename if necessary, though actual file storage key is more critical
    }
    next();
});

// --- Indexes (ADDED/Updated) ---
documentSchema.index({ organization: 1, fileName: 1 }, { collation: { locale: 'en', strength: 2 } }); // File names can be similar, but good to index with org
documentSchema.index({ organization: 1, category: 1 });
documentSchema.index({ organization: 1, uploadedBy: 1 });
documentSchema.index({ organization: 1, tags: 1 });
// Unique index on storageKey within an organization to prevent duplicate file references
documentSchema.index({ organization: 1, storageKey: 1 }, { unique: true });


module.exports = mongoose.models.Document || mongoose.model('Document', documentSchema);
