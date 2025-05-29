// models/headcountModel.js
const mongoose = require('mongoose');

/**
 * Compensation Schema - nested document for tracking employee compensation details
 * Includes base, variable, equity, and other compensation elements
 */
const compensationSchema = new mongoose.Schema({
    _id: false, // ADDED: To prevent sub-document IDs if not needed
    baseSalary: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'INR',
        enum: ['INR', 'USD', 'EUR', 'GBP']
    },
    variableCompensation: {
        type: Number,
        default: 0,
        min: 0
    },
    variableFrequency: {
        type: String,
        enum: ['Monthly', 'Quarterly', 'Annually', 'One-time'],
        default: 'Annually'
    },
    equityPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    equityVestingSchedule: {
        type: String,
        trim: true
    },
    benefits: {
        type: Number,
        default: 0,
        min: 0,
        comment: 'Monthly cost of benefits'
    },
    totalAnnualCost: {
        type: Number,
        default: 0,
        min: 0
    },
    notes: {
        type: String,
        trim: true
    }
}); // User's original _id: false was not present, added for consistency if sub-docs don't need own IDs

/**
 * Budget Tracking Schema - for tracking planned vs actual costs
 */
const budgetTrackingSchema = new mongoose.Schema({
    _id: false, // ADDED: To prevent sub-document IDs if not needed
    budgetedAnnualCost: {
        type: Number,
        min: 0
    },
    budgetCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Budget', // This should also be organization-scoped when linking
        comment: 'Reference to associated budget category'
    },
    actualVsBudgetVariance: {
        type: Number,
        default: 0
    },
    budgetNotes: {
        type: String,
        trim: true
    }
}); // User's original _id: false was not present

/**
 * Main Headcount Schema
 * Tracks all employee data including role, department, status, and compensation
 */
const headcountSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a headcount entry.'], // Added required message
        index: true,
    },
    // `createdBy` and `updatedBy` fields already exist and reference HorizonUser.

    // --- User's Existing Fields (Preserved) ---
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: { // This should ideally be unique within an organization if used as an identifier
        type: String,
        trim: true,
        lowercase: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    department: {
        type: String,
        required: true,
        enum: [
            'Engineering',
            'Product',
            'Design',
            'Marketing',
            'Sales',
            'Customer Success',
            'Finance',
            'HR',
            'Operations',
            'Executive',
            'Other'
        ]
    },
    reportingTo: { // This Headcount record should also belong to the same organization
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Headcount',
        comment: 'Manager/supervisor of this employee'
    },
    level: {
        type: String,
        enum: ['Intern', 'Entry', 'Mid', 'Senior', 'Lead', 'Manager', 'Director', 'VP', 'C-Suite', 'Founder'],
        default: 'Mid'
    },
    status: {
        type: String,
        required: true,
        enum: [
            'Active',
            'Former',
            'Offer Extended',
            'Interviewing',
            'Open Requisition'
        ],
        default: 'Active',
        index: true
    },
    employmentType: {
        type: String,
        required: true,
        enum: [
            'Full-time',
            'Part-time',
            'Contractor',
            'Intern',
            'Advisor'
        ],
        default: 'Full-time',
        index: true
    },
    location: {
        type: String,
        trim: true
    },
    remoteStatus: {
        type: String,
        enum: ['Remote', 'Hybrid', 'In-office'],
        default: 'Remote'
    },
    startDate: {
        type: Date
    },
    endDate: {
        type: Date
    },
    requisitionOpenDate: {
        type: Date,
        comment: 'When position was opened for hiring'
    },
    targetHireDate: {
        type: Date,
        comment: 'Target date to fill the position'
    },
    compensation: compensationSchema,
    budgetTracking: budgetTrackingSchema,
    hiringDetails: { // Preserved user's structure
        _id: false, // ADDED
        requisitionId: {
            type: String,
            trim: true
        },
        hiringPriority: {
            type: String,
            enum: ['Critical', 'High', 'Medium', 'Low'],
            default: 'Medium'
        },
        hiringStage: {
            type: String,
            enum: [
                'Not Started',
                'Sourcing',
                'Screening',
                'Interviewing',
                'Offer Stage',
                'Closed'
            ],
            default: 'Not Started'
        },
        numberOfCandidates: {
            type: Number,
            default: 0,
            min: 0
        },
        interviewsCompleted: {
            type: Number,
            default: 0,
            min: 0
        },
        recruiter: {
            type: String,
            trim: true
        }
    },
    performanceTracking: { // Preserved user's structure
        _id: false, // ADDED
        lastReviewDate: {
            type: Date
        },
        reviewScore: {
            type: Number,
            min: 1,
            max: 5
        },
        keyAccomplishments: [{
            type: String,
            trim: true
        }],
        developmentAreas: [{
            type: String,
            trim: true
        }]
    },
    tags: [{
        type: String,
        trim: true
    }],
    notes: {
        type: String,
        trim: true
    },
    relatedExpenses: [{ // These Expense records should also belong to the same organization
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expense'
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser'
    },
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
    // updatedAt: { type: Date, default: Date.now }  // Will be handled by timestamps: true
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'headcounts', // ADDED: Explicit collection name
});

/**
 * User's original Pre-save middleware for headcount - Only manual updatedAt removed
 * Calculates total annual cost and budget variance before saving
 */
headcountSchema.pre('save', function(next) {
    // this.updatedAt = Date.now(); // REMOVED: Handled by timestamps: true

    // User's original logic for totalAnnualCost and variance - Preserved
    if (this.compensation) {
        const { baseSalary, variableCompensation, benefits } = this.compensation;
        const annualBase = baseSalary || 0;
        const annualVariable = variableCompensation || 0;
        const annualBenefits = (benefits || 0) * 12;

        this.compensation.totalAnnualCost = annualBase + annualVariable + annualBenefits;

        if (this.budgetTracking && this.budgetTracking.budgetedAnnualCost != null) { // Check for null/undefined
            this.budgetTracking.actualVsBudgetVariance =
                this.budgetTracking.budgetedAnnualCost - this.compensation.totalAnnualCost;
        }
    }
    next();
});

// User's original Static methods - Preserved
headcountSchema.statics.getTotalHeadcount = async function(organizationId, statusFilter = 'Active') {
    const query = statusFilter ? { organization: organizationId, status: statusFilter } : { organization: organizationId };
    return this.countDocuments(query);
};

headcountSchema.statics.getHeadcountByDepartment = async function(organizationId, statusFilter = 'Active') {
    const query = statusFilter ? { organization: organizationId, status: statusFilter } : { organization: organizationId };
    return this.aggregate([
        { $match: query },
        {
            $group: {
                _id: '$department',
                count: { $sum: 1 },
                totalAnnualCost: { $sum: '$compensation.totalAnnualCost' }
            }
        },
        { $sort: { _id: 1 } }
    ]);
};

headcountSchema.statics.getTotalAnnualCost = async function(organizationId, statusFilter = 'Active') {
    const query = statusFilter ? { organization: organizationId, status: statusFilter } : { organization: organizationId };
    const result = await this.aggregate([
        { $match: query },
        {
            $group: {
                _id: null,
                totalAnnualCost: { $sum: '$compensation.totalAnnualCost' }
            }
        }
    ]);
    return result.length > 0 ? result[0].totalAnnualCost : 0;
};

// User's original Indexes - Preserved and new ones added
headcountSchema.index({ organization: 1, department: 1, status: 1 }); // ADDED organization
headcountSchema.index({ organization: 1, employmentType: 1, status: 1 }); // ADDED organization
headcountSchema.index({ organization: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $exists: true, $ne: null, $ne: "" } } }); // Email unique within an org
headcountSchema.index({ organization: 1, startDate: -1 }); // ADDED organization
headcountSchema.index({ organization: 1, 'compensation.totalAnnualCost': -1 }); // ADDED organization
// Preserving original indexes, but they are now less specific without organization
// headcountSchema.index({ department: 1, status: 1 });
// headcountSchema.index({ employmentType: 1, status: 1 });
// headcountSchema.index({ startDate: -1 });
// headcountSchema.index({ 'compensation.totalAnnualCost': -1 });


// Create model (User's original export structure)
const Headcount = mongoose.model('Headcount', headcountSchema);
module.exports = Headcount;
