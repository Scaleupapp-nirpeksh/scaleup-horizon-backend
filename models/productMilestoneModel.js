// models/productMilestoneModel.js
const mongoose = require('mongoose');

/**
 * Task Schema - nested document for milestone tasks
 */
const taskSchema = new mongoose.Schema({
    taskName: { 
        type: String, 
        required: true, 
        trim: true 
    },
    description: { 
        type: String, 
        trim: true 
    },
    assignee: { 
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
    dependencies: [{ 
        type: String,
        trim: true 
    }],
    notes: { 
        type: String,
        trim: true 
    }
}, { _id: true });

/**
 * Impact Assessment Schema - for tracking business impact of milestone
 */
const impactAssessmentSchema = new mongoose.Schema({
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
    impactMetric: { 
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
}, { _id: false });

/**
 * Main Product Milestone Schema
 * Tracks product features, projects, and initiatives
 */
const productMilestoneSchema = new mongoose.Schema({
    // Basic milestone information
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
    
    // Status and progress
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
    
    // Timeline
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
    
    // Team assignment
    productOwner: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Headcount' 
    },
    teamMembers: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Headcount' 
    }],
    
    // Tasks and dependencies
    tasks: [taskSchema],
    dependencies: [{
        milestoneName: { 
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
    
    // Business impact
    businessImpact: impactAssessmentSchema,
    
    // Resources and tracking
    estimatedEffort: { 
        type: Number,
        comment: 'Estimated person-days required' 
    },
    actualEffort: { 
        type: Number,
        comment: 'Actual person-days spent' 
    },
    budget: { 
        type: Number,
        comment: 'Budget allocated (if applicable)' 
    },
    
    // Categorization and prioritization
    quarter: { 
        type: String,
        match: /^[0-9]{4}-Q[1-4]$/,
        comment: 'Format: YYYY-QN (e.g., 2025-Q2)' 
    },
    priority: { 
        type: String,
        enum: ['Critical', 'High', 'Medium', 'Low'],
        default: 'Medium' 
    },
    tags: [{ 
        type: String, 
        trim: true 
    }],
    
    // External connections
    relatedDocuments: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Document' 
    }],
    
    // Investor presentation data
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
    
    // Additional info
    notes: { 
        type: String, 
        trim: true 
    },
    
    // Metadata
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'HorizonUser', 
        required: true 
    },
    updatedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'HorizonUser' 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

/**
 * Pre-save middleware for product milestone
 * Updates completion percentage and dates based on tasks
 */
productMilestoneSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Update completion percentage based on tasks if available
    if (this.tasks && this.tasks.length > 0) {
        const totalTasks = this.tasks.length;
        const completedTasks = this.tasks.filter(task => 
            task.status === 'Completed'
        ).length;
        
        // Calculate weighted average of task completion percentages
        const totalCompletionPercentage = this.tasks.reduce((sum, task) => 
            sum + (task.completionPercentage || 0), 0);
            
        this.completionPercentage = totalTasks > 0 
            ? Math.round(totalCompletionPercentage / totalTasks) 
            : 0;
            
        // Update status if all tasks are completed
        if (totalTasks > 0 && completedTasks === totalTasks) {
            this.status = 'Completed';
            this.actualEndDate = this.actualEndDate || new Date();
        }
    }
    
    // Set actualStartDate if status changed to In Development
    if (this.status === 'In Development' && !this.actualStartDate) {
        this.actualStartDate = new Date();
    }
    
    // Set actualEndDate if status changed to Completed
    if (this.status === 'Completed' && !this.actualEndDate) {
        this.actualEndDate = new Date();
    }
    
    next();
});

/**
 * Static method to get milestone status summary
 */
productMilestoneSchema.statics.getStatusSummary = async function() {
    return this.aggregate([
        { $group: { 
            _id: '$status', 
            count: { $sum: 1 } 
        }},
        { $sort: { _id: 1 } }
    ]);
};

/**
 * Static method to get milestones by quarter
 */
productMilestoneSchema.statics.getMilestonesByQuarter = async function() {
    return this.aggregate([
        { $match: { quarter: { $exists: true, $ne: null } } },
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

// Add indexes for common queries
productMilestoneSchema.index({ status: 1 });
productMilestoneSchema.index({ quarter: 1 });
productMilestoneSchema.index({ plannedEndDate: 1 });
productMilestoneSchema.index({ priority: 1, status: 1 });
productMilestoneSchema.index({ visibleToInvestors: 1, highlightInReports: 1 });

// Create model
const ProductMilestone = mongoose.model('ProductMilestone', productMilestoneSchema);
module.exports = ProductMilestone;