// models/deviceModel.js
// Registered push devices (one per install per user). APNs token for iOS;
// the structure also supports FCM later for Android.
const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['ios', 'android'], default: 'ios' },
    // APNs needs to know if the build is sandbox (dev) or production.
    environment: { type: String, enum: ['sandbox', 'production'], default: 'production' },
    appVersion: { type: String, trim: true },
    lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'devices' });

module.exports = mongoose.model('Device', deviceSchema);
