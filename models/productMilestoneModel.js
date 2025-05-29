// models/productMilestoneModel.js
const mongoose = require('mongoose');

/**
 * User's original Task Schema - Preserved
 */
const taskSchema = new mongoose.Schema({
    // _id: true is default for subdocuments unless specified as false. User had it as true.
    taskName: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    assignee: { // This Headcount record should also belong to the same organization
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Headcount',
        comment: 'Team member responsible for this task'
    },
    status: {
        type: String,
        required: true,
        enum: [
            'Not Started',
            'In Progress',
            'Blocked',
            'Completed',
            'Cancelled'
        ],
        default: 'Not Started'
    },
    priority: {
        type: String,
        enum: ['Critical', 'High', 'Medium', 'Low'],
        default: 'Medium'
    },
    completionPercentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    startDate: {
        type: Date
    },
    dueDate: {
        type: Date
    },
    completedDate: {
        type: Date
    },
    dependencies: [{ // These could be task names or IDs of other tasks (potentially within this milestone or other milestones)
        type: String, // If names, consider if they need to be unique or how they are resolved.
        trim: true
    }],
    notes: {
        type: String,
        trim: true
    }
}); // User had _id: true, which is default, so kept as is.

/**
 * User's original Impact Assessment Schema - Preserved
 */
const impactAssessmentSchema = new mongoose.Schema({
    _id: false, // User had _id: false
    impactType: {
        type: String,
        enum: [
            'User Growth',
            'Revenue Increase',
            'Cost Reduction',
            'User Retention',
            'Conversion Rate',
            'Customer Satisfaction',
            'Technical Debt',
            'Other'
        ],
        required: true
    },
    projectedImpact: {
        type: String,
        trim: true,
        required: true
    },
    impactMetric: { // Name of the KPI or metric affected
        type: String,
        trim: true
    },
    baselineValue: {
        type: Number
    },
    targetValue: {
        type: Number
    },
    actualValue: {
        type: Number
    },
    confidenceLevel: {
        type: String,
        enum: ['Very High', 'High', 'Medium', 'Low', 'Very Low'],
        default: 'Medium'
    },
    notes: {
        type: String,
        trim: true
    }
});

/**
 * Main Product Milestone Schema - With multi-tenancy fields added
 */
const productMilestoneSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a product milestone.'], // Added required message
        index: true,
    },
    // `createdBy` and `updatedBy` fields already exist and reference HorizonUser.

    // --- User's Existing Fields (Preserved) ---
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    milestoneType: {
        type: String,
        required: true,
        enum: [
            'Feature',
            'Bug Fix',
            'Performance Improvement',
            'UX Enhancement',
            'Infrastructure',
            'Security',
            'Compliance',
            'Research',
            'Other'
        ],
        default: 'Feature'
    },
    status: {
        type: String,
        required: true,
        enum: [
            'Planning',
            'In Development',
            'Testing',
            'Deploying',
            'Completed',
            'On Hold',
            'Cancelled'
        ],
        default: 'Planning',
        index: true
    },
    completionPercentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    plannedStartDate: {
        type: Date,
        required: true
    },
    plannedEndDate: {
        type: Date,
        required: true
    },
    actualStartDate: {
        type: Date
    },
    actualEndDate: {
        type: Date
    },
    productOwner: { // This Headcount record should also belong to the same organization
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Headcount'
    },
    teamMembers: [{ // These Headcount records should also belong to the same organization
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Headcount'
    }],
    tasks: [taskSchema],
    dependencies: [{ // These ProductMilestone records should also belong to the same organization
        _id: false, // ADDED
        milestoneName: { // This is for display, the ID is the actual link
            type: String,
            trim: true
        },
        milestoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ProductMilestone'
        },
        dependencyType: {
            type: String,
            enum: ['Blocks', 'Blocked By', 'Related To'],
            default: 'Blocked By'
        }
    }],
    businessImpact: impactAssessmentSchema,
    estimatedEffort: {
        type: Number,
        comment: 'Estimated person-days required'
    },
    actualEffort: {
        type: Number,
        comment: 'Actual person-days spent'
    },
    budget: { // Consider adding currency if this budget is monetary
        type: Number,
        comment: 'Budget allocated (if applicable)'
    },
    quarter: {
        type: String,
        match: /^[0-9]{4}-Q[1-4]$/,
        comment: 'Format: YYYY-QN (e.g., 2025-Q2)',
        trim: true // Added trim
    },
    priority: {
        type: String,
        enum: ['Critical', 'High', 'Medium', 'Low'],
        default: 'Medium'
    },
    tags: [{
        type: String,
        trim: true,
        lowercase: true // Added lowercase
    }],
    relatedDocuments: [{ // These Document records should also belong to the same organization
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document'
    }],
    visibleToInvestors: {
        type: Boolean,
        default: true
    },
    investorSummary: {
        type: String,
        trim: true,
        comment: 'Concise summary for investor presentations'
    },
    highlightInReports: {
        type: Boolean,
        default: false
    },
    notes: {
        type: String,
        trim: true
    },
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
    collection: 'productmilestones', // ADDED: Explicit collection name
});

/**
 * User's original Pre-save middleware for product milestone - Only manual updatedAt removed
 * Updates completion percentage and dates based on tasks
 */
productMilestoneSchema.pre('save', function(next) {
    // this.updatedAt = Date.now(); // REMOVED: Handled by timestamps: true

    // User's original logic for completionPercentage and status/dates - Preserved
    if (this.tasks && this.tasks.length > 0) {
        const totalTasks = this.tasks.length;
        const completedTasks = this.tasks.filter(task =>
            task.status === 'Completed'
        ).length;

        const totalCompletionPercentage = this.tasks.reduce((sum, task) =>
            sum + (task.completionPercentage || 0), 0);

        this.completionPercentage = totalTasks > 0
            ? Math.round(totalCompletionPercentage / totalTasks)
            : 0;

        if (totalTasks > 0 && completedTasks === totalTasks && this.status !== 'Completed' && this.status !== 'Cancelled') { // Added checks for current status
            this.status = 'Completed';
            this.actualEndDate = this.actualEndDate || new Date();
        }
    }

    if (this.isModified('status')) { // Check if status is modified to avoid unintended updates
        if (this.status === 'In Development' && !this.actualStartDate) {
            this.actualStartDate = new Date();
        }
        if (this.status === 'Completed' && !this.actualEndDate) {
            this.actualEndDate = new Date();
        }
    }
    next();
});

/**
 * User's original Static method to get milestone status summary - Modified for multi-tenancy
 */
productMilestoneSchema.statics.getStatusSummary = async function(organizationId) { // ADDED organizationId
    const query = { organization: organizationId }; // ADDED organization filter
    return this.aggregate([
        { $match: query }, // Filter by organization
        { $group: {
            _id: '$status',
            count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
    ]);
};

/**
 * User's original Static method to get milestones by quarter - Modified for multi-tenancy
 */
productMilestoneSchema.statics.getMilestonesByQuarter = async function(organizationId) { // ADDED organizationId
    const query = { // ADDED organization filter
        organization: organizationId,
        quarter: { $exists: true, $ne: null }
    };
    return this.aggregate([
        { $match: query },
        { $group: {
            _id: '$quarter',
            milestones: { $push: {
                id: '$_id',
                name: '$name',
                status: '$status',
                completionPercentage: '$completionPercentage'
            }}
        }},
        { $sort: { _id: 1 } }
    ]);
};

// User's original Indexes - Preserved and new ones added/updated
productMilestoneSchema.index({ organization: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } }); // Name unique within org
productMilestoneSchema.index({ organization: 1, status: 1 }); // ADDED organization
productMilestoneSchema.index({ organization: 1, quarter: 1 }); // ADDED organization
productMilestoneSchema.index({ organization: 1, plannedEndDate: 1 }); // ADDED organization
productMilestoneSchema.index({ organization: 1, priority: 1, status: 1 }); // ADDED organization
productMilestoneSchema.index({ organization: 1, visibleToInvestors: 1, highlightInReports: 1 }); // ADDED organization
// Original indexes preserved but now less specific without organization:
// productMilestoneSchema.index({ status: 1 });
// productMilestoneSchema.index({ quarter: 1 });
// productMilestoneSchema.index({ plannedEndDate: 1 });
// productMilestoneSchema.index({ priority: 1, status: 1 });
// productMilestoneSchema.index({ visibleToInvestors: 1, highlightInReports: 1 });

// Create model (User's original export structure)
const ProductMilestone = mongoose.models.ProductMilestone || mongoose.model('ProductMilestone', productMilestoneSchema);
module.exports = ProductMilestone;
