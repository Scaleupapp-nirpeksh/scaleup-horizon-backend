// models/userModel.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); //
const crypto = require('crypto'); // For generating tokens

/**
 * @typedef {object} UserPreferences
 * @property {string} [theme] - E.g., 'light', 'dark'.
 * @property {string} [language] - E.g., 'en', 'es'.
 * @property {object} [notifications] - User-specific notification preferences for the platform.
 * @property {boolean} [notifications.emailEnabled] - Global email notification preference.
 * @property {boolean} [notifications.inAppEnabled] - Global in-app notification preference.
 */

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [true, 'Email is a required field.'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/.+\@.+\..+/, 'Please fill a valid email address'],
        },
        password: {
            type: String,
            // Not required initially if account is pending setup via admin link,
            // but will be set when user completes setup.
            // For direct registration (first owner), it is required.
            required: function() { return !this.accountSetupToken; }, // Required if not being set up via token
            minlength: [8, 'Password must be at least 8 characters long.'],
        },
        name: {
            type: String,
            required: [true, 'Name is a required field.'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters.'],
        },
        // Phone verification fields removed as per new strategy.
        // Email verification (isVerified, verificationToken etc.) can be added later if desired
        // for the self-registering owner, or as a secondary verification.
        // For now, focusing on account setup for admin-added users.

        isAccountActive: { // Tracks if the user has completed their initial setup (if admin-provisioned) or self-registered.
            type: Boolean,
            default: false, // Set to true after self-registration or setup completion
        },
        accountSetupToken: { // For admin-provisioned users to set their initial password
            type: String,
            default: null,
        },
        accountSetupTokenExpiresAt: {
            type: Date,
            default: null,
        },
        forcePasswordChange: { // Could be used if an admin resets a password later
            type: Boolean,
            default: false,
        },
        passwordResetToken: { // For standard "forgot password" flow via email
            type: String,
            default: null,
        },
        passwordResetTokenExpiresAt: {
            type: Date,
            default: null,
        },
        isPlatformAdmin: {
            type: Boolean,
            default: false,
        },
        activeOrganization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            default: null,
        },
        defaultOrganization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            default: null,
        },
        /**
         * @type {UserPreferences}
         */
        preferences: {
            theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
            language: { type: String, default: 'en' },
            notifications: {
                emailEnabled: { type: Boolean, default: true }, // For password resets and other comms
                inAppEnabled: { type: Boolean, default: true },
            }
        },
        lastLoginAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true, // Adds createdAt, updatedAt
        collection: 'horizonusers',
    }
);

// Hash password before saving if it's modified
userSchema.pre('save', async function (next) {
    if (!this.isModified('password') || !this.password) { // Also check if password exists
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt); //
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function (enteredPassword) {
    if (!this.password) return false; // No password set (e.g. pending setup)
    try {
        return await bcrypt.compare(enteredPassword, this.password);
    } catch (error) {
        return false;
    }
};

// Method to generate a setup token (instance method)
userSchema.methods.generateAccountSetupToken = function () {
    const token = crypto.randomBytes(32).toString('hex');
    this.accountSetupToken = token;
    // Set expiry, e.g., 7 days for account setup
    this.accountSetupTokenExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return token;
};

// Method to generate a password reset token
userSchema.methods.generatePasswordResetToken = function () {
    const token = crypto.randomBytes(32).toString('hex');
    // In a real app, you might want to hash this token before saving to DB
    // this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
    this.passwordResetToken = token; // Storing plain for direct lookup in this example
    this.passwordResetTokenExpiresAt = Date.now() + 3600000; // 1 hour
    return token;
};


const HorizonUser = mongoose.model('HorizonUser', userSchema); //

module.exports = HorizonUser;