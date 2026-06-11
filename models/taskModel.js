// Updated taskModel.js with subcategory support
const mongoose = require('mongoose');
// Ensure the counter model is registered before the key-assignment hook runs
require('./taskCounterModel');

const taskSchema = new mongoose.Schema(
    {
        // Multi-tenancy fields
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: [true, 'Organization is required'],
            index: true,
        },
        creator: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser',
            required: [true, 'Task creator is required'],
        },
        
        // Human-readable per-org identifier (e.g. SLT-42), assigned on create
        taskKey: {
            type: String,
            trim: true,
            index: true,
        },

        // Epic/task distinction (epics group child tasks via parentTask)
        taskType: {
            type: String,
            enum: ['epic', 'task'],
            default: 'task',
            index: true,
        },

        // Basic task information
        title: {
            type: String,
            required: [true, 'Task title is required'],
            trim: true,
            maxlength: [200, 'Task title cannot exceed 200 characters'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [5000, 'Task description cannot exceed 5000 characters'],
        },
        
        // Task categorization and organization
        category: {
            type: String,
            enum: ['development', 'marketing', 'sales', 'operations', 'finance', 'hr', 'design', 'other'],
            default: 'other',
        },
        subcategory: {
            type: String,
            trim: true,
            maxlength: [100, 'Subcategory cannot exceed 100 characters'],
            default: null,
        },
        tags: [{
            type: String,
            trim: true,
            lowercase: true,
        }],
        
        // Task priority and status
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium',
            index: true,
        },
        status: {
            type: String,
            enum: ['todo', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled'],
            default: 'todo',
            index: true,
        },
        
        // Assignment
        assignee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser',
            default: null,
            index: true,
        },
        
        // Dates and deadlines
        dueDate: {
            type: Date,
            default: null,
            index: true,
        },
        startDate: {
            type: Date,
            default: null,
        },
        completedAt: {
            type: Date,
            default: null,
        },
        
        // Progress tracking
        estimatedHours: {
            type: Number,
            min: 0,
            default: null,
        },
        actualHours: {
            type: Number,
            min: 0,
            default: 0,
        },
        progress: {
            type: Number,
            min: 0,
            max: 100,
            default: 0,
        },
        
        // Related tasks
        parentTask: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
            default: null,
        },
        subtasks: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
        }],
        blockedBy: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
        }],
        
        // Additional metadata
        attachments: [{
            filename: String,
            url: String,
            uploadedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'HorizonUser',
            },
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
        }],
        
        // Activity tracking
        watchers: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser',
        }],
        lastActivityAt: {
            type: Date,
            default: Date.now,
        },
        
        // Workflow customization
        customFields: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
        },
        
        // Soft delete
        isArchived: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'tasks',
        // Include virtuals when converting to JSON
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes for better query performance
// Task keys are unique per org (partial: pre-existing tasks may not have one yet)
taskSchema.index(
    { organization: 1, taskKey: 1 },
    { unique: true, partialFilterExpression: { taskKey: { $type: 'string' } } }
);
taskSchema.index({ organization: 1, taskType: 1, isArchived: 1 });
taskSchema.index({ organization: 1, parentTask: 1 });
taskSchema.index({ organization: 1, status: 1, priority: 1 });
taskSchema.index({ organization: 1, assignee: 1, status: 1 });
taskSchema.index({ organization: 1, dueDate: 1, status: 1 });
taskSchema.index({ organization: 1, category: 1 });
taskSchema.index({ organization: 1, category: 1, subcategory: 1 });
taskSchema.index({ organization: 1, createdAt: -1 });

// Virtual for checking if task is overdue
taskSchema.virtual('isOverdue').get(function() {
    return this.dueDate && 
           this.dueDate < new Date() && 
           !['completed', 'cancelled'].includes(this.status);
});

// Virtual for display category (category + subcategory)
taskSchema.virtual('displayCategory').get(function() {
    if (this.subcategory) {
        return `${this.category} / ${this.subcategory}`;
    }
    return this.category;
});

// Assign a human-readable task key (e.g. SLT-42) on first save.
// Uses a per-org counter; the prefix is derived from the org name once.
taskSchema.pre('save', async function(next) {
    if (!this.isNew || this.taskKey) return next();
    try {
        const TaskCounter = mongoose.model('TaskCounter');
        let counter = await TaskCounter.findOneAndUpdate(
            { organization: this.organization },
            { $inc: { seq: 1 } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (!counter.prefix) {
            const Organization = mongoose.model('Organization');
            const org = await Organization.findById(this.organization).select('name');
            const prefix = TaskCounter.derivePrefix(org && org.name);
            await TaskCounter.updateOne(
                { _id: counter._id, prefix: { $in: [null, ''] } },
                { $set: { prefix } }
            );
            counter = await TaskCounter.findById(counter._id);
        }
        this.taskKey = `${counter.prefix}-${counter.seq}`;
        next();
    } catch (err) {
        // A task without a key is better than a failed save
        console.error('Could not assign task key:', err.message);
        next();
    }
});

// Pre-save hook to update lastActivityAt
taskSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.lastActivityAt = Date.now();
    }
    
    // Update completedAt when status changes to completed
    if (this.isModified('status')) {
        if (this.status === 'completed' && !this.completedAt) {
            this.completedAt = Date.now();
        } else if (this.status !== 'completed' && this.completedAt) {
            this.completedAt = null;
        }
    }
    
    next();
});

// Instance method to check if a user can modify this task
taskSchema.methods.canUserModify = function(userId, userRole) {
    return (
        this.creator.equals(userId) || 
        (this.assignee && this.assignee.equals(userId)) ||
        userRole === 'owner'
    );
};

// Static method to get available subcategories for an organization
taskSchema.statics.getSubcategoriesForOrganization = async function(organizationId, category) {
    const subcategories = await this.distinct('subcategory', {
        organization: organizationId,
        category: category,
        subcategory: { $nin: [null, ''] }
    });
    return subcategories.filter(Boolean).sort();
};

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;