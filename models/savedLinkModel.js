// models/savedLinkModel.js
// Per-organization library of reusable external links (company website,
// pitch site, demo video…) offered as picker options when building data
// rooms — org-scoped, exactly like the document library.
const mongoose = require('mongoose');

const savedLinkSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },
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
}, { timestamps: true, collection: 'savedlinks' });

savedLinkSchema.index({ organization: 1, url: 1 }, { unique: true });

module.exports = mongoose.model('SavedLink', savedLinkSchema);
