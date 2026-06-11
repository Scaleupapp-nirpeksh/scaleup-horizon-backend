// controllers/notificationController.js
const mongoose = require('mongoose');
const Notification = require('../models/notificationModel');

/**
 * @desc    List the current user's notifications in the active organization
 * @route   GET /api/horizon/notifications
 * @access  Private
 */
exports.getNotifications = async (req, res) => {
    try {
        const { unreadOnly = false, page = 1, limit = 15 } = req.query;

        const query = {
            recipient: req.user._id,
            organization: req.organization._id,
        };
        if (unreadOnly === 'true') query.isRead = false;

        const pageNum = parseInt(page, 10);
        const limitNum = Math.min(parseInt(limit, 10) || 15, 50);

        const [notifications, totalCount, unreadCount] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate('relatedTask', 'title taskKey taskType status'),
            Notification.countDocuments(query),
            Notification.countDocuments({
                recipient: req.user._id,
                organization: req.organization._id,
                isRead: false,
            }),
        ]);

        res.json({
            notifications,
            unreadCount,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(totalCount / limitNum),
                totalCount,
            },
        });
    } catch (err) {
        console.error('Error fetching notifications:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch notifications');
    }
};

/**
 * @desc    Mark a notification as read
 * @route   POST /api/horizon/notifications/:id/read
 * @access  Private
 */
exports.markRead = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid notification ID format' });
        }
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user._id },
            { $set: { isRead: true, readAt: new Date() } },
            { new: true }
        );
        if (!notification) {
            return res.status(404).json({ msg: 'Notification not found' });
        }
        res.json({ msg: 'Marked as read', notification });
    } catch (err) {
        console.error('Error marking notification read:', err.message, err.stack);
        res.status(500).send('Server Error: Could not update notification');
    }
};

/**
 * @desc    Mark all notifications as read (active organization)
 * @route   POST /api/horizon/notifications/read-all
 * @access  Private
 */
exports.markAllRead = async (req, res) => {
    try {
        const result = await Notification.updateMany(
            { recipient: req.user._id, organization: req.organization._id, isRead: false },
            { $set: { isRead: true, readAt: new Date() } }
        );
        res.json({ msg: 'All notifications marked as read', updated: result.modifiedCount });
    } catch (err) {
        console.error('Error marking all notifications read:', err.message, err.stack);
        res.status(500).send('Server Error: Could not update notifications');
    }
};
