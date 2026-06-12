// models/dataRoomModel.js
// Investor data rooms: a curated, shareable set of documents behind a
// tokenized public link, with per-visitor access logging.
const mongoose = require('mongoose');

const accessLogSchema = new mongoose.Schema({
    at: { type: Date, default: Date.now },
    email: { type: String, trim: true, lowercase: true, maxlength: 320 },
    action: { type: String, enum: ['view_room', 'download_doc', 'view_link'], required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    // For download_doc this is the file name; for view_link the link title
    fileName: { type: String, trim: true, maxlength: 255 },
    linkUrl: { type: String, trim: true, maxlength: 2000 },
    ip: { type: String, trim: true, maxlength: 64 },
}, { _id: false });

const linkSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'Link title is required'], trim: true, maxlength: 200 },
    url: {
        type: String,
        required: [true, 'Link URL is required'],
        trim: true,
        maxlength: 2000,
        validate: {
            validator: (v) => /^https?:\/\/.+/i.test(v),
            message: 'Link URL must start with http:// or https://',
        },
    },
    description: { type: String, trim: true, maxlength: 500 },
}, { _id: true });

const dataRoomSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },

    name: { type: String, required: [true, 'Data room name is required'], trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },

    documents: [{
        document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
        label: { type: String, trim: true, maxlength: 255 },
    }],

    // External links shown alongside documents (website, pitch site, demo
    // video…) — visits are logged just like document downloads
    links: [linkSchema],

    shareToken: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },

    // Ask visitors for their email before showing documents (soft gate —
    // identifies who viewed what; no verification round-trip)
    requireEmail: { type: Boolean, default: true },

    accessLog: [accessLogSchema],
    viewCount: { type: Number, default: 0 },
    lastAccessedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'datarooms' });

dataRoomSchema.methods.isOpen = function () {
    if (!this.isActive) return false;
    if (this.expiresAt && new Date() > this.expiresAt) return false;
    return true;
};

module.exports = mongoose.model('DataRoom', dataRoomSchema);
