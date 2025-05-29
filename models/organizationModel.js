// models/organizationModel.js
const mongoose = require('mongoose');

/**
 * @typedef {object} OrganizationSettings
 * @property {string} [dateFormat] - Preferred date format (e.g., 'MM/DD/YYYY', 'DD/MM/YYYY').
 * @property {number} [financialYearStartMonth] - Month when the financial year starts (1-12).
 * @property {number} [financialYearStartDay] - Day of the month when the financial year starts (1-31).
 */

const organizationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Organization name is a required field.'],
            trim: true,
            maxlength: [150, 'Organization name cannot exceed 150 characters.'],
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser', // References the 'HorizonUser' model
            required: [true, 'Organization owner is a required field.'],
            index: true,
        },
        industry: {
            type: String,
            trim: true,
            maxlength: [100, 'Industry name cannot exceed 100 characters.'],
            default: null,
        },
        timezone: {
            type: String,
            trim: true,
            default: 'Asia/Kolkata', // Defaulted to Indian Standard Time
        },
        currency: {
            type: String,
            trim: true,
            uppercase: true,
            required: [true, 'Default currency for the organization is required.'],
            default: 'INR', // Defaulted to Indian Rupee
            enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'],
        },
        /**
         * @type {OrganizationSettings}
         */
        settings: {
            dateFormat: { type: String, default: 'YYYY-MM-DD' },
            financialYearStartMonth: { type: Number, min: 1, max: 12, default: 4 }, // April
            financialYearStartDay: { type: Number, min: 1, max: 31, default: 1 },
        },
        isArchived: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'organizations',
    }
);

organizationSchema.index({ name: 1, isArchived: 1 });

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;