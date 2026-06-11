// models/taskCounterModel.js
// Per-organization sequence used to issue human-readable task keys (e.g. SLT-42).
const mongoose = require('mongoose');

const taskCounterSchema = new mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
            unique: true,
        },
        // Short uppercase prefix shown before the number (derived from the org
        // name on first use, e.g. "ScaleUp Learning Technologies" -> "SLT")
        prefix: {
            type: String,
            trim: true,
            uppercase: true,
            maxlength: 6,
        },
        seq: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        collection: 'taskcounters',
    }
);

// Derive a prefix from an organization name: first letter of up to four
// words; single-word names use their first four letters (Tesla -> TESL)
taskCounterSchema.statics.derivePrefix = function(orgName) {
    if (!orgName) return 'TASK';
    const words = String(orgName)
        .split(/\s+/)
        .map(w => w.replace(/[^A-Za-z]/g, ''))
        .filter(Boolean);
    if (words.length === 0) return 'TASK';
    if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
    return words.map(w => w[0].toUpperCase()).slice(0, 4).join('');
};

const TaskCounter = mongoose.model('TaskCounter', taskCounterSchema);

module.exports = TaskCounter;
