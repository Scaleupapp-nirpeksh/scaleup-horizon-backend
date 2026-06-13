// models/otpModel.js
// Short-lived one-time passcodes for phone login and phone-change verification.
// Codes are stored hashed; the plaintext only ever lives in the SMS.
const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    // E.164 phone the code was sent to
    phone: { type: String, required: true, index: true },

    // 'login' — authenticate by phone; 'change_phone' — verify a new number
    purpose: { type: String, enum: ['login', 'change_phone'], required: true },

    codeHash: { type: String, required: true },

    // For change_phone: who is changing, so we update the right account
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', default: null },

    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },

    expiresAt: { type: Date, required: true },
}, { timestamps: true, collection: 'otps' });

// TTL index — Mongo auto-deletes expired codes.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ phone: 1, purpose: 1, createdAt: -1 });

module.exports = mongoose.model('Otp', otpSchema);
