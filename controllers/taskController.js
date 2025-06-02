// controllers/taskController.js
const mongoose = require('mongoose');
const Task = require('../models/taskModel');
const TaskComment = require('../models/taskCommentModel');
const Membership = require('../models/membershipModel');

// --- Task CRUD Operations ---

/**
 * @desc    Create a new task
 * @route   POST /api/horizon/tasks
 * @access  Private (Requires active organization)
 */
exports.createTask = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            title, description, category, tags, priority,
            assignee, dueDate, startDate, estimatedHours,
            parentTask, blockedBy, attachments
        } = req.body;

        // Validate required fields
        if (!title) {
            await session.abortTransaction();
            return res.status(400).json({ msg: 'Task title is required' });
        }

        // If assignee is provided, verify they are a member of the organization
        if (assignee) {
            const isValidAssignee = await Membership.findOne({
                user: assignee,
                organization: req.organization._id,
                status: 'active'
            }).session(session);

            if (!isValidAssignee) {
                await session.abortTransaction();
                return res.status(400).json({ msg: 'Assignee must be an active member of the organization' });
            }
        }

        // Create the task
        const newTask = new Task({
            organization: req.organization._id,
            creator: req.user._id,
            title,
            description,
            category,
            tags,
            priority,
            assignee,
            dueDate,
            startDate,
            estimatedHours,
            parentTask,
            blockedBy,
            attachments,
            watchers: [req.user._id] // Creator automatically watches the task
        });

        const task = await newTask.save({ session });

        // If this is a subtask, update the parent task
        if (parentTask) {
            await Task.findByIdAndUpdate(
                parentTask,
                { $push: { subtasks: task._id } },
                { session }
            );
        }

        // Create a system comment for task creation
        await TaskComment.createSystemComment(
            task._id,
            req.organization._id,
            'status',
            null,
            'todo',
            req.user._id
        );

        await session.commitTransaction();

        // Populate the response
        const populatedTask = await Task.findById(task._id)
            .populate('creator', 'name email')
            .populate('assignee', 'name email')
            .populate('parentTask', 'title');

        res.status(201).json({
            msg: 'Task created successfully',
            task: populatedTask
        });

    } catch (err) {
        await session.abortTransaction();
        console.error('Error creating task:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message });
        }
        res.status(500).send('Server Error: Could not create task');
    } finally {
        session.endSession();
    }
};

/**
 * @desc    Get all tasks for the organization with filters
 * @route   GET /api/horizon/tasks
 * @access  Private
 */
exports.getTasks = async (req, res) => {
    try {
        const {
            status, priority, category, assignee, creator,
            search, sortBy, page = 1, limit = 20,
            includeArchived = false, myTasks = false
        } = req.query;

        // Build query
        const query = { organization: req.organization._id };

        // Apply filters
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (category) query.category = category;
        if (assignee) query.assignee = assignee;
        if (creator) query.creator = creator;
        if (!includeArchived || includeArchived === 'false') query.isArchived = false;
        
        // My tasks filter
        if (myTasks === 'true') {
            query.$or = [
                { assignee: req.user._id },
                { creator: req.user._id },
                { watchers: req.user._id }
            ];
        }

        // Search in title and description
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Sorting
        let sortOptions = { createdAt: -1 }; // Default sort
        if (sortBy) {
            switch (sortBy) {
                case 'dueDate':
                    sortOptions = { dueDate: 1 };
                    break;
                case 'priority':
                    sortOptions = { priority: -1, createdAt: -1 };
                    break;
                case 'status':
                    sortOptions = { status: 1, createdAt: -1 };
                    break;
                case 'title':
                    sortOptions = { title: 1 };
                    break;
            }
        }

        // Pagination
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        // Execute query
        const [tasks, totalCount] = await Promise.all([
            Task.find(query)
                .sort(sortOptions)
                .limit(limitNum)
                .skip(skip)
                .populate('assignee', 'name email')
                .populate('creator', 'name email')
                .populate('parentTask', 'title'),
            Task.countDocuments(query)
        ]);

        res.json({
            tasks,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(totalCount / limitNum),
                totalTasks: totalCount,
                hasMore: skip + tasks.length < totalCount
            }
        });

    } catch (err) {
        console.error('Error fetching tasks:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch tasks');
    }
};

/**
 * @desc    Get a single task by ID
 * @route   GET /api/horizon/tasks/:id
 * @access  Private
 */
exports.getTaskById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Task ID format' });
        }

        const task = await Task.findOne({
            _id: req.params.id,
            organization: req.organization._id
        })
        .populate('assignee', 'name email')
        .populate('creator', 'name email')
        .populate('watchers', 'name email')
        .populate('parentTask', 'title status')
        .populate('subtasks', 'title status assignee')
        .populate('blockedBy', 'title status');

        if (!task) {
            return res.status(404).json({ msg: 'Task not found in your organization' });
        }

        // Get comments count
        const commentsCount = await TaskComment.countDocuments({
            task: task._id,
            isDeleted: false
        });

        res.json({
            task,
            commentsCount
        });

    } catch (err) {
        console.error('Error fetching task by ID:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch task');
    }
};

/**
 * @desc    Update a task
 * @route   PUT /api/horizon/tasks/:id
 * @access  Private
 */
exports.updateTask = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            await session.abortTransaction();
            return res.status(400).json({ msg: 'Invalid Task ID format' });
        }

        const task = await Task.findOne({
            _id: req.params.id,
            organization: req.organization._id
        }).session(session);

        if (!task) {
            await session.abortTransaction();
            return res.status(404).json({ msg: 'Task not found in your organization' });
        }

        // Check permissions
        if (!task.canUserModify(req.user._id, req.organizationRole)) {
            await session.abortTransaction();
            return res.status(403).json({ msg: 'You do not have permission to modify this task' });
        }

        const {
            title, description, category, tags, priority,
            status, assignee, dueDate, startDate,
            estimatedHours, actualHours, progress,
            blockedBy, attachments
        } = req.body;

        // Track changes for system comments
        const changes = [];
        
        if (status !== undefined && status !== task.status) {
            changes.push({ field: 'status', old: task.status, new: status });
        }
        if (priority !== undefined && priority !== task.priority) {
            changes.push({ field: 'priority', old: task.priority, new: priority });
        }
        if (assignee !== undefined && String(assignee) !== String(task.assignee)) {
            // Verify new assignee is a member
            if (assignee) {
                const isValidAssignee = await Membership.findOne({
                    user: assignee,
                    organization: req.organization._id,
                    status: 'active'
                }).session(session);

                if (!isValidAssignee) {
                    await session.abortTransaction();
                    return res.status(400).json({ msg: 'Assignee must be an active member of the organization' });
                }
            }
            changes.push({ field: 'assignment', old: task.assignee, new: assignee });
        }

        // Update fields
        if (title !== undefined) task.title = title;
        if (description !== undefined) task.description = description;
        if (category !== undefined) task.category = category;
        if (tags !== undefined) task.tags = tags;
        if (priority !== undefined) task.priority = priority;
        if (status !== undefined) task.status = status;
        if (assignee !== undefined) task.assignee = assignee;
        if (dueDate !== undefined) task.dueDate = dueDate;
        if (startDate !== undefined) task.startDate = startDate;
        if (estimatedHours !== undefined) task.estimatedHours = estimatedHours;
        if (actualHours !== undefined) task.actualHours = actualHours;
        if (progress !== undefined) task.progress = progress;
        if (blockedBy !== undefined) task.blockedBy = blockedBy;
        if (attachments !== undefined) task.attachments = attachments;

        await task.save({ session });

        // Create system comments for changes
        for (const change of changes) {
            await TaskComment.createSystemComment(
                task._id,
                req.organization._id,
                change.field,
                change.old,
                change.new,
                req.user._id
            );
        }

        await session.commitTransaction();

        const updatedTask = await Task.findById(task._id)
            .populate('assignee', 'name email')
            .populate('creator', 'name email');

        res.json({
            msg: 'Task updated successfully',
            task: updatedTask
        });

    } catch (err) {
        await session.abortTransaction();
        console.error('Error updating task:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message });
        }
        res.status(500).send('Server Error: Could not update task');
    } finally {
        session.endSession();
    }
};

/**
 * @desc    Archive/Delete a task
 * @route   DELETE /api/horizon/tasks/:id
 * @access  Private
 */
exports.archiveTask = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Task ID format' });
        }

        const task = await Task.findOne({
            _id: req.params.id,
            organization: req.organization._id
        });

        if (!task) {
            return res.status(404).json({ msg: 'Task not found in your organization' });
        }

        // Check permissions
        if (!task.canUserModify(req.user._id, req.organizationRole)) {
            return res.status(403).json({ msg: 'You do not have permission to archive this task' });
        }

        task.isArchived = true;
        await task.save();

        res.json({ msg: 'Task archived successfully' });

    } catch (err) {
        console.error('Error archiving task:', err.message, err.stack);
        res.status(500).send('Server Error: Could not archive task');
    }
};

// --- Task Comments ---

/**
 * @desc    Get comments for a task
 * @route   GET /api/horizon/tasks/:id/comments
 * @access  Private
 */
exports.getTaskComments = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Task ID format' });
        }

        // Verify task exists in organization
        const task = await Task.findOne({
            _id: req.params.id,
            organization: req.organization._id
        });

        if (!task) {
            return res.status(404).json({ msg: 'Task not found in your organization' });
        }

        const comments = await TaskComment.find({
            task: req.params.id,
            organization: req.organization._id,
            isDeleted: false
        })
        .populate('author', 'name email')
        .populate('mentions', 'name email')
        .sort({ createdAt: -1 });

        res.json({ comments });

    } catch (err) {
        console.error('Error fetching task comments:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch comments');
    }
};

/**
 * @desc    Add a comment to a task
 * @route   POST /api/horizon/tasks/:id/comments
 * @access  Private
 */
exports.addTaskComment = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Task ID format' });
        }

        const { content, mentions, attachments } = req.body;

        if (!content) {
            return res.status(400).json({ msg: 'Comment content is required' });
        }

        // Verify task exists in organization
        const task = await Task.findOne({
            _id: req.params.id,
            organization: req.organization._id
        });

        if (!task) {
            return res.status(404).json({ msg: 'Task not found in your organization' });
        }

        // Create comment
        const comment = new TaskComment({
            organization: req.organization._id,
            task: req.params.id,
            author: req.user._id,
            content,
            mentions,
            attachments
        });

        await comment.save();

        // Update task's lastActivityAt
        task.lastActivityAt = Date.now();
        await task.save();

        const populatedComment = await TaskComment.findById(comment._id)
            .populate('author', 'name email')
            .populate('mentions', 'name email');

        res.status(201).json({
            msg: 'Comment added successfully',
            comment: populatedComment
        });

    } catch (err) {
        console.error('Error adding comment:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message });
        }
        res.status(500).send('Server Error: Could not add comment');
    }
};

/**
 * @desc    Update a comment
 * @route   PUT /api/horizon/tasks/:taskId/comments/:commentId
 * @access  Private
 */
exports.updateTaskComment = async (req, res) => {
    try {
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ msg: 'Comment content is required' });
        }

        const comment = await TaskComment.findOne({
            _id: req.params.commentId,
            task: req.params.taskId,
            organization: req.organization._id,
            isDeleted: false
        });

        if (!comment) {
            return res.status(404).json({ msg: 'Comment not found' });
        }

        // Only author can edit their comment
        if (!comment.author.equals(req.user._id)) {
            return res.status(403).json({ msg: 'You can only edit your own comments' });
        }

        comment.content = content;
        await comment.save();

        const updatedComment = await TaskComment.findById(comment._id)
            .populate('author', 'name email')
            .populate('mentions', 'name email');

        res.json({
            msg: 'Comment updated successfully',
            comment: updatedComment
        });

    } catch (err) {
        console.error('Error updating comment:', err.message, err.stack);
        res.status(500).send('Server Error: Could not update comment');
    }
};

/**
 * @desc    Delete a comment
 * @route   DELETE /api/horizon/tasks/:taskId/comments/:commentId
 * @access  Private
 */
exports.deleteTaskComment = async (req, res) => {
    try {
        const comment = await TaskComment.findOne({
            _id: req.params.commentId,
            task: req.params.taskId,
            organization: req.organization._id,
            isDeleted: false
        });

        if (!comment) {
            return res.status(404).json({ msg: 'Comment not found' });
        }

        // Only author or org owner can delete
        if (!comment.author.equals(req.user._id) && req.organizationRole !== 'owner') {
            return res.status(403).json({ msg: 'You do not have permission to delete this comment' });
        }

        await comment.softDelete();

        res.json({ msg: 'Comment deleted successfully' });

    } catch (err) {
        console.error('Error deleting comment:', err.message, err.stack);
        res.status(500).send('Server Error: Could not delete comment');
    }
};

// --- Task Assignment & Watchers ---

/**
 * @desc    Assign a task to a user
 * @route   POST /api/horizon/tasks/:id/assign
 * @access  Private
 */
exports.assignTask = async (req, res) => {
    try {
        const { assigneeId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Task ID format' });
        }

        const task = await Task.findOne({
            _id: req.params.id,
            organization: req.organization._id
        });

        if (!task) {
            return res.status(404).json({ msg: 'Task not found in your organization' });
        }

        // Verify assignee is a member
        if (assigneeId) {
            const isValidAssignee = await Membership.findOne({
                user: assigneeId,
                organization: req.organization._id,
                status: 'active'
            });

            if (!isValidAssignee) {
                return res.status(400).json({ msg: 'Assignee must be an active member of the organization' });
            }
        }

        const oldAssignee = task.assignee;
        task.assignee = assigneeId || null;
        await task.save();

        // Create system comment
        await TaskComment.createSystemComment(
            task._id,
            req.organization._id,
            'assignment',
            oldAssignee,
            assigneeId,
            req.user._id
        );

        const updatedTask = await Task.findById(task._id)
            .populate('assignee', 'name email');

        res.json({
            msg: 'Task assigned successfully',
            task: updatedTask
        });

    } catch (err) {
        console.error('Error assigning task:', err.message, err.stack);
        res.status(500).send('Server Error: Could not assign task');
    }
};

/**
 * @desc    Add/Remove watchers
 * @route   POST /api/horizon/tasks/:id/watchers
 * @access  Private
 */
exports.updateWatchers = async (req, res) => {
    try {
        const { action, userId } = req.body; // action: 'add' or 'remove'

        if (!['add', 'remove'].includes(action)) {
            return res.status(400).json({ msg: 'Invalid action. Use "add" or "remove"' });
        }

        const task = await Task.findOne({
            _id: req.params.id,
            organization: req.organization._id
        });

        if (!task) {
            return res.status(404).json({ msg: 'Task not found in your organization' });
        }

        const watcherId = userId || req.user._id;

        if (action === 'add') {
            if (!task.watchers.includes(watcherId)) {
                task.watchers.push(watcherId);
            }
        } else {
            task.watchers = task.watchers.filter(id => !id.equals(watcherId));
        }

        await task.save();

        const updatedTask = await Task.findById(task._id)
            .populate('watchers', 'name email');

        res.json({
            msg: `Watcher ${action === 'add' ? 'added' : 'removed'} successfully`,
            task: updatedTask
        });

    } catch (err) {
        console.error('Error updating watchers:', err.message, err.stack);
        res.status(500).send('Server Error: Could not update watchers');
    }
};

// --- Task Analytics ---

/**
 * @desc    Get task statistics for the organization
 * @route   GET /api/horizon/tasks/stats
 * @access  Private
 */
exports.getTaskStats = async (req, res) => {
    try {
        const { startDate, endDate, assignee } = req.query;

        const matchStage = { organization: req.organization._id };
        
        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) matchStage.createdAt.$gte = new Date(startDate);
            if (endDate) matchStage.createdAt.$lte = new Date(endDate);
        }
        
        if (assignee) matchStage.assignee = mongoose.Types.ObjectId(assignee);

        const [
            statusStats,
            priorityStats,
            categoryStats,
            assigneeStats,
            overdueCount
        ] = await Promise.all([
            // Status distribution
            Task.aggregate([
                { $match: matchStage },
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            
            // Priority distribution
            Task.aggregate([
                { $match: matchStage },
                { $group: { _id: '$priority', count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            
            // Category distribution
            Task.aggregate([
                { $match: matchStage },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            
            // Tasks per assignee
            Task.aggregate([
                { $match: { ...matchStage, assignee: { $ne: null } } },
                { $group: { _id: '$assignee', count: { $sum: 1 } } },
                { $lookup: {
                    from: 'horizonusers',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }},
                { $unwind: '$user' },
                { $project: {
                    name: '$user.name',
                    email: '$user.email',
                    count: 1
                }},
                { $sort: { count: -1 } }
            ]),
            
            // Overdue tasks
            Task.countDocuments({
                ...matchStage,
                dueDate: { $lt: new Date() },
                status: { $nin: ['completed', 'cancelled'] }
            })
        ]);

        res.json({
            statusDistribution: statusStats,
            priorityDistribution: priorityStats,
            categoryDistribution: categoryStats,
            tasksByAssignee: assigneeStats,
            overdueCount,
            totalTasks: statusStats.reduce((sum, stat) => sum + stat.count, 0)
        });

    } catch (err) {
        console.error('Error fetching task stats:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch task statistics');
    }
};