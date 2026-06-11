// models/taskLinkModel.js
// JIRA-style links between two tasks. parentTask/subtasks on the Task model
// covers hierarchy (epic -> story); this covers everything else.
const mongoose = require('mongoose');

const LINK_TYPES = ['blocks', 'relates_to', 'duplicates'];

// Inverse labels for displaying a link from the target task's perspective
const INVERSE_LABELS = {
    blocks: 'is_blocked_by',
    relates_to: 'relates_to',
    duplicates: 'is_duplicated_by',
};

const taskLinkSchema = new mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
            index: true,
        },
        // Directional: "<sourceTask> <linkType> <targetTask>"
        sourceTask: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
            required: true,
            index: true,
        },
        targetTask: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
            required: true,
            index: true,
        },
        linkType: {
            type: String,
            enum: LINK_TYPES,
            required: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser',
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'tasklinks',
    }
);

taskLinkSchema.index(
    { organization: 1, sourceTask: 1, targetTask: 1, linkType: 1 },
    { unique: true }
);

taskLinkSchema.statics.LINK_TYPES = LINK_TYPES;
taskLinkSchema.statics.INVERSE_LABELS = INVERSE_LABELS;

const TaskLink = mongoose.model('TaskLink', taskLinkSchema);

module.exports = TaskLink;
