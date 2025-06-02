// models/taskCommentModel.js
const mongoose = require('mongoose');

const taskCommentSchema = new mongoose.Schema(
    {
        // Multi-tenancy and relationships
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: [true, 'Organization is required'],
            index: true,
        },
        task: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
            required: [true, 'Task reference is required'],
            index: true,
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser',
            required: [true, 'Comment author is required'],
        },
        
        // Comment content
        content: {
            type: String,
            required: [true, 'Comment content is required'],
            trim: true,
            maxlength: [2000, 'Comment cannot exceed 2000 characters'],
        },
        
        // Comment type for special actions
        type: {
            type: String,
            enum: ['comment', 'status_change', 'assignment_change', 'priority_change', 'system'],
            default: 'comment',
        },
        
        // Metadata for system-generated comments
        metadata: {
            oldValue: String,
            newValue: String,
            field: String,
        },
        
        // Mentions
        mentions: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser',
        }],
        
        // Attachments
        attachments: [{
            filename: String,
            url: String,
            size: Number,
            mimeType: String,
        }],
        
        // Edit tracking
        isEdited: {
            type: Boolean,
            default: false,
        },
        editedAt: {
            type: Date,
            default: null,
        },
        editHistory: [{
            content: String,
            editedAt: Date,
        }],
        
        // Soft delete
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'taskcomments',
    }
);

// Compound indexes for efficient queries
taskCommentSchema.index({ task: 1, createdAt: -1 });
taskCommentSchema.index({ organization: 1, task: 1, isDeleted: 1 });
taskCommentSchema.index({ author: 1, createdAt: -1 });

// Pre-save hook for edit tracking
taskCommentSchema.pre('save', function(next) {
    if (this.isModified('content') && !this.isNew) {
        this.isEdited = true;
        this.editedAt = Date.now();
        
        // Save to edit history
        if (!this.editHistory) {
            this.editHistory = [];
        }
        this.editHistory.push({
            content: this.content,
            editedAt: this.editedAt,
        });
    }
    next();
});

// Instance method to soft delete
taskCommentSchema.methods.softDelete = function() {
    this.isDeleted = true;
    this.deletedAt = Date.now();
    return this.save();
};

// Static method to create system comment
taskCommentSchema.statics.createSystemComment = async function(taskId, organizationId, field, oldValue, newValue, authorId) {
    const systemComment = new this({
        organization: organizationId,
        task: taskId,
        author: authorId,
        type: `${field}_change`,
        content: `Changed ${field} from "${oldValue || 'none'}" to "${newValue}"`,
        metadata: {
            field,
            oldValue,
            newValue,
        },
    });
    return systemComment.save();
};

const TaskComment = mongoose.model('TaskComment', taskCommentSchema);

module.exports = TaskComment;