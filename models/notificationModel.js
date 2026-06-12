// models/notificationModel.js
// In-app notifications (assignment, comments, mentions, due reminders).
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
            index: true,
        },
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ['task_assigned', 'task_comment', 'comment_mention', 'task_due', 'briefing', 'system'],
            required: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        message: {
            type: String,
            trim: true,
            maxlength: 1000,
        },
        relatedTask: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
            default: null,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'notifications',
    }
);

notificationSchema.index({ recipient: 1, organization: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, organization: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
