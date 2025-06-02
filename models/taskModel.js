// models/taskModel.js
const mongoose = require('mongoose');

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
    }
);

// Indexes for better query performance
taskSchema.index({ organization: 1, status: 1, priority: 1 });
taskSchema.index({ organization: 1, assignee: 1, status: 1 });
taskSchema.index({ organization: 1, dueDate: 1, status: 1 });
taskSchema.index({ organization: 1, category: 1 });
taskSchema.index({ organization: 1, createdAt: -1 });

// Virtual for checking if task is overdue
taskSchema.virtual('isOverdue').get(function() {
    return this.dueDate && 
           this.dueDate < new Date() && 
           !['completed', 'cancelled'].includes(this.status);
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

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;