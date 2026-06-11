// controllers/taskController.js
const mongoose = require('mongoose');
const Task = require('../models/taskModel');
const TaskComment = require('../models/taskCommentModel');
const TaskLink = require('../models/taskLinkModel');
const Membership = require('../models/membershipModel');
const HorizonUser = require('../models/userModel');
const { notifyUsers } = require('../services/notificationService');

// Escape user input before embedding it in a $regex query
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Verify that a set of task IDs all exist within the given organization.
// Returns { valid: boolean, invalidIds: [...] }
const verifyTasksBelongToOrganization = async (taskIds, organizationId, session = null) => {
    const ids = (Array.isArray(taskIds) ? taskIds : [taskIds]).filter(Boolean);
    if (ids.length === 0) return { valid: true, invalidIds: [] };

    if (ids.some(id => !mongoose.Types.ObjectId.isValid(id))) {
        return { valid: false, invalidIds: ids.filter(id => !mongoose.Types.ObjectId.isValid(id)) };
    }

    let query = Task.find({ _id: { $in: ids }, organization: organizationId }).select('_id');
    if (session) query = query.session(session);
    const found = await query;
    const foundIds = new Set(found.map(t => String(t._id)));
    const invalidIds = ids.map(String).filter(id => !foundIds.has(id));
    return { valid: invalidIds.length === 0, invalidIds };
};

// Resolve a user's display name for system comments (falls back to the raw id)
const resolveUserName = async (userId, session = null) => {
    if (!userId) return 'Unassigned';
    let query = HorizonUser.findById(userId).select('name');
    if (session) query = query.session(session);
    const user = await query;
    return user ? user.name : String(userId);
};

// --- Task CRUD Operations ---

/**
 * @desc    Create a new task
 * @route   POST /api/horizon/tasks
 * @access  Private (Requires active organization)
 */
// Update the createTask function to handle subcategory
exports.createTask = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            title, description, category, subcategory, tags, priority,
            assignee, dueDate, startDate, estimatedHours,
            parentTask, blockedBy, attachments, customFields,
            taskType, watchers
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

        // Handle subcategory from customFields if provided
        let finalSubcategory = subcategory;
        if (!finalSubcategory && customFields?.subcategory) {
            finalSubcategory = customFields.subcategory;
        }

        // Verify related tasks belong to this organization (prevents cross-tenant linking)
        if (parentTask) {
            const parentCheck = await verifyTasksBelongToOrganization(parentTask, req.organization._id, session);
            if (!parentCheck.valid) {
                await session.abortTransaction();
                return res.status(400).json({ msg: 'Parent task not found in your organization' });
            }
        }
        if (blockedBy && blockedBy.length > 0) {
            const blockedCheck = await verifyTasksBelongToOrganization(blockedBy, req.organization._id, session);
            if (!blockedCheck.valid) {
                await session.abortTransaction();
                return res.status(400).json({ msg: 'One or more blocking tasks were not found in your organization' });
            }
        }

        // Creator automatically watches the task; extra watchers may be passed
        const watcherSet = new Set([String(req.user._id)]);
        if (Array.isArray(watchers)) {
            watchers.filter(w => mongoose.Types.ObjectId.isValid(w)).forEach(w => watcherSet.add(String(w)));
        }

        // Create the task
        const newTask = new Task({
            organization: req.organization._id,
            creator: req.user._id,
            taskType: taskType === 'epic' ? 'epic' : 'task',
            title,
            description,
            category,
            subcategory: finalSubcategory,
            tags,
            priority,
            assignee,
            dueDate,
            startDate,
            estimatedHours,
            parentTask,
            blockedBy,
            attachments,
            customFields,
            watchers: [...watcherSet]
        });

        const task = await newTask.save({ session });

        // If this is a subtask, update the parent task (org-scoped)
        if (parentTask) {
            await Task.findOneAndUpdate(
                { _id: parentTask, organization: req.organization._id },
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

        // Notify the assignee (unless they created the task themselves)
        if (assignee) {
            notifyUsers({
                organizationId: req.organization._id,
                recipientIds: [assignee],
                actorId: req.user._id,
                type: 'task_assigned',
                title: `${task.taskKey ? task.taskKey + ': ' : ''}You were assigned "${task.title}"`,
                message: `${req.user.name || 'A teammate'} assigned this task to you.`,
                taskId: task._id
            });
        }

        // Populate the response
        const populatedTask = await Task.findById(task._id)
            .populate('creator', 'name email')
            .populate('assignee', 'name email')
            .populate('parentTask', 'title taskKey taskType');

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
// Update the getTasks function to include subcategory in filters
exports.getTasks = async (req, res) => {
    try {
        const {
            status, priority, category, subcategory, assignee, creator,
            search, sortBy, page = 1, limit = 20,
            includeArchived = false, myTasks = false,
            taskType, parentTask
        } = req.query;

        // Build query
        const query = { organization: req.organization._id };

        // Apply filters
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (category) query.category = category;
        if (subcategory) query.subcategory = subcategory;
        if (taskType && ['epic', 'task'].includes(taskType)) query.taskType = taskType;
        if (parentTask) {
            if (parentTask === 'none') {
                query.parentTask = null;
            } else {
                if (!mongoose.Types.ObjectId.isValid(parentTask)) {
                    return res.status(400).json({ msg: 'Invalid parent task ID format' });
                }
                query.parentTask = new mongoose.Types.ObjectId(String(parentTask));
            }
        }
        // Cast IDs explicitly — the aggregation path below does not auto-cast like find()
        if (assignee) {
            if (!mongoose.Types.ObjectId.isValid(assignee)) {
                return res.status(400).json({ msg: 'Invalid assignee ID format' });
            }
            query.assignee = new mongoose.Types.ObjectId(String(assignee));
        }
        if (creator) {
            if (!mongoose.Types.ObjectId.isValid(creator)) {
                return res.status(400).json({ msg: 'Invalid creator ID format' });
            }
            query.creator = new mongoose.Types.ObjectId(String(creator));
        }
        if (!includeArchived || includeArchived === 'false') query.isArchived = false;

        // Combine "my tasks" and search conditions with $and so they don't overwrite each other
        const andConditions = [];

        // My tasks filter
        if (myTasks === 'true') {
            andConditions.push({
                $or: [
                    { assignee: req.user._id },
                    { creator: req.user._id },
                    { watchers: req.user._id }
                ]
            });
        }

        // Search in title, description, subcategory and task key (escaped to prevent regex injection)
        if (search) {
            const safeSearch = escapeRegex(search);
            andConditions.push({
                $or: [
                    { title: { $regex: safeSearch, $options: 'i' } },
                    { description: { $regex: safeSearch, $options: 'i' } },
                    { subcategory: { $regex: safeSearch, $options: 'i' } },
                    { taskKey: { $regex: safeSearch, $options: 'i' } }
                ]
            });
        }

        if (andConditions.length > 0) {
            query.$and = andConditions;
        }

        // Sorting
        let sortOptions = { createdAt: -1 }; // Default sort
        if (sortBy) {
            switch (sortBy) {
                case 'dueDate':
                    sortOptions = { dueDate: 1 };
                    break;
                case 'priority':
                    // Handled via aggregation below (priority is a string enum,
                    // so a plain index sort would order it alphabetically)
                    sortOptions = null;
                    break;
                case 'status':
                    sortOptions = { status: 1, createdAt: -1 };
                    break;
                case 'title':
                    sortOptions = { title: 1 };
                    break;
                case 'category':
                    sortOptions = { category: 1, subcategory: 1, createdAt: -1 };
                    break;
            }
        }

        // Pagination
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        // Execute query
        let tasks, totalCount;
        if (sortBy === 'priority') {
            // Rank priorities semantically: critical > high > medium > low
            const [aggTasks, count] = await Promise.all([
                Task.aggregate([
                    { $match: query },
                    {
                        $addFields: {
                            _priorityRank: {
                                $switch: {
                                    branches: [
                                        { case: { $eq: ['$priority', 'critical'] }, then: 4 },
                                        { case: { $eq: ['$priority', 'high'] }, then: 3 },
                                        { case: { $eq: ['$priority', 'medium'] }, then: 2 },
                                        { case: { $eq: ['$priority', 'low'] }, then: 1 }
                                    ],
                                    default: 0
                                }
                            }
                        }
                    },
                    { $sort: { _priorityRank: -1, createdAt: -1 } },
                    { $skip: skip },
                    { $limit: limitNum },
                    { $project: { _priorityRank: 0 } }
                ]),
                Task.countDocuments(query)
            ]);
            tasks = await Task.populate(aggTasks, [
                { path: 'assignee', select: 'name email' },
                { path: 'creator', select: 'name email' },
                { path: 'parentTask', select: 'title taskKey taskType' }
            ]);
            totalCount = count;
        } else {
            [tasks, totalCount] = await Promise.all([
                Task.find(query)
                    .sort(sortOptions)
                    .limit(limitNum)
                    .skip(skip)
                    .populate('assignee', 'name email')
                    .populate('creator', 'name email')
                    .populate('parentTask', 'title taskKey taskType'),
                Task.countDocuments(query)
            ]);
        }

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
        // Related tasks are org-matched defensively so no cross-tenant data can leak
        .populate({ path: 'parentTask', select: 'title status', match: { organization: req.organization._id } })
        .populate({ path: 'subtasks', select: 'title status assignee', match: { organization: req.organization._id } })
        .populate({ path: 'blockedBy', select: 'title status', match: { organization: req.organization._id } });

        if (!task) {
            return res.status(404).json({ msg: 'Task not found in your organization' });
        }

        // Comments count, child progress rollup, and JIRA-style links in parallel
        const [commentsCount, children, links] = await Promise.all([
            TaskComment.countDocuments({ task: task._id, isDeleted: false }),
            Task.find({
                parentTask: task._id,
                organization: req.organization._id,
                isArchived: false
            }).select('title status taskKey taskType priority dueDate assignee')
              .populate('assignee', 'name'),
            TaskLink.find({
                organization: req.organization._id,
                $or: [{ sourceTask: task._id }, { targetTask: task._id }]
            }).populate('sourceTask', 'title status taskKey taskType')
              .populate('targetTask', 'title status taskKey taskType')
        ]);

        const childStats = {
            total: children.length,
            completed: children.filter(c => c.status === 'completed').length,
            inProgress: children.filter(c => c.status === 'in_progress').length,
        };
        childStats.percentComplete = childStats.total > 0
            ? Math.round((childStats.completed / childStats.total) * 100)
            : 0;

        // Present each link from this task's perspective
        const presentedLinks = links
            .filter(l => l.sourceTask && l.targetTask) // skip links to deleted tasks
            .map(l => {
                const outgoing = String(l.sourceTask._id) === String(task._id);
                return {
                    _id: l._id,
                    linkType: outgoing ? l.linkType : (TaskLink.INVERSE_LABELS[l.linkType] || l.linkType),
                    task: outgoing ? l.targetTask : l.sourceTask,
                };
            });

        res.json({
            task,
            commentsCount,
            children,
            childStats,
            links: presentedLinks
        });

    } catch (err) {
        console.error('Error fetching task by ID:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch task');
    }
};


// Add a new endpoint to get available subcategories
exports.getSubcategories = async (req, res) => {
    try {
        const { category } = req.query;
        
        if (!category) {
            return res.status(400).json({ msg: 'Category parameter is required' });
        }

        const subcategories = await Task.getSubcategoriesForOrganization(
            req.organization._id, 
            category
        );

        res.json({ 
            category,
            subcategories,
            count: subcategories.length
        });

    } catch (err) {
        console.error('Error fetching subcategories:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch subcategories');
    }
};

/**
 * @desc    Update a task
 * @route   PUT /api/horizon/tasks/:id
 * @access  Private
 */
// Update the updateTask function to handle subcategory
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
            title, description, category, subcategory, tags, priority,
            status, assignee, dueDate, startDate,
            estimatedHours, actualHours, progress,
            blockedBy, attachments, customFields,
            taskType, parentTask
        } = req.body;

        // Handle subcategory from customFields if provided
        let finalSubcategory = subcategory;
        if (finalSubcategory === undefined && customFields?.subcategory !== undefined) {
            finalSubcategory = customFields.subcategory;
        }

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
            // Record names (not raw ObjectIds) so the activity feed reads naturally
            const [oldName, newName] = await Promise.all([
                resolveUserName(task.assignee, session),
                resolveUserName(assignee, session)
            ]);
            changes.push({ field: 'assignment', old: oldName, new: newName });
        }

        // Verify blocking tasks belong to this organization (prevents cross-tenant linking)
        if (blockedBy !== undefined && Array.isArray(blockedBy) && blockedBy.length > 0) {
            const blockedCheck = await verifyTasksBelongToOrganization(blockedBy, req.organization._id, session);
            if (!blockedCheck.valid) {
                await session.abortTransaction();
                return res.status(400).json({ msg: 'One or more blocking tasks were not found in your organization' });
            }
        }

        // Re-parenting: validate the new parent and keep subtasks arrays in sync
        const parentChanged = parentTask !== undefined &&
            String(parentTask || '') !== String(task.parentTask || '');
        if (parentChanged && parentTask) {
            const parentCheck = await verifyTasksBelongToOrganization(parentTask, req.organization._id, session);
            if (!parentCheck.valid) {
                await session.abortTransaction();
                return res.status(400).json({ msg: 'Parent task not found in your organization' });
            }
            // Walk the new parent's ancestor chain to prevent cycles
            let ancestorId = parentTask;
            for (let depth = 0; ancestorId && depth < 50; depth++) {
                if (String(ancestorId) === String(task._id)) {
                    await session.abortTransaction();
                    return res.status(400).json({ msg: 'Cannot set parent: this would create a circular hierarchy' });
                }
                const ancestor = await Task.findOne({
                    _id: ancestorId,
                    organization: req.organization._id
                }).select('parentTask').session(session);
                ancestorId = ancestor ? ancestor.parentTask : null;
            }
        }

        // Update fields
        if (title !== undefined) task.title = title;
        if (description !== undefined) task.description = description;
        if (category !== undefined) task.category = category;
        if (finalSubcategory !== undefined) task.subcategory = finalSubcategory;
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
        if (customFields !== undefined) task.customFields = customFields;
        if (taskType !== undefined && ['epic', 'task'].includes(taskType)) task.taskType = taskType;

        if (parentChanged) {
            // Detach from the old parent's subtasks, attach to the new one
            if (task.parentTask) {
                await Task.updateOne(
                    { _id: task.parentTask, organization: req.organization._id },
                    { $pull: { subtasks: task._id } },
                    { session }
                );
            }
            if (parentTask) {
                await Task.updateOne(
                    { _id: parentTask, organization: req.organization._id },
                    { $addToSet: { subtasks: task._id } },
                    { session }
                );
            }
            task.parentTask = parentTask || null;
        }

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

        // Notify a newly assigned user (after the transaction is committed)
        if (assignee !== undefined && assignee &&
            changes.some(c => c.field === 'assignment')) {
            notifyUsers({
                organizationId: req.organization._id,
                recipientIds: [assignee],
                actorId: req.user._id,
                type: 'task_assigned',
                title: `${task.taskKey ? task.taskKey + ': ' : ''}You were assigned "${task.title}"`,
                message: `${req.user.name || 'A teammate'} assigned this task to you.`,
                taskId: task._id
            });
        }

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

        // Notify: mentioned users get a mention notification; the assignee
        // and watchers get a comment notification (author always excluded)
        const keyPrefix = task.taskKey ? task.taskKey + ': ' : '';
        const mentionIds = (mentions || []).filter(m => mongoose.Types.ObjectId.isValid(m)).map(String);
        if (mentionIds.length > 0) {
            notifyUsers({
                organizationId: req.organization._id,
                recipientIds: mentionIds,
                actorId: req.user._id,
                type: 'comment_mention',
                title: `${keyPrefix}${req.user.name || 'A teammate'} mentioned you on "${task.title}"`,
                message: String(content).slice(0, 300),
                taskId: task._id
            });
        }
        const commentAudience = [task.assignee, ...(task.watchers || [])]
            .filter(Boolean)
            .map(String)
            .filter(id => !mentionIds.includes(id));
        notifyUsers({
            organizationId: req.organization._id,
            recipientIds: commentAudience,
            actorId: req.user._id,
            type: 'task_comment',
            title: `${keyPrefix}New comment on "${task.title}"`,
            message: `${req.user.name || 'A teammate'}: ${String(content).slice(0, 300)}`,
            taskId: task._id
        });

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

        // Preserve the previous content in the edit history before overwriting
        if (comment.content !== content) {
            comment.editHistory = comment.editHistory || [];
            comment.editHistory.push({
                content: comment.content,
                editedAt: new Date()
            });
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

        // Same permission rule as updateTask: creator, current assignee, or org owner
        if (!task.canUserModify(req.user._id, req.organizationRole)) {
            return res.status(403).json({ msg: 'You do not have permission to assign this task' });
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

        // Create system comment with readable names instead of raw ObjectIds
        const [oldName, newName] = await Promise.all([
            resolveUserName(oldAssignee),
            resolveUserName(assigneeId)
        ]);
        await TaskComment.createSystemComment(
            task._id,
            req.organization._id,
            'assignment',
            oldName,
            newName,
            req.user._id
        );

        if (assigneeId) {
            notifyUsers({
                organizationId: req.organization._id,
                recipientIds: [assigneeId],
                actorId: req.user._id,
                type: 'task_assigned',
                title: `${task.taskKey ? task.taskKey + ': ' : ''}You were assigned "${task.title}"`,
                message: `${req.user.name || 'A teammate'} assigned this task to you.`,
                taskId: task._id
            });
        }

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
            // Watchers must be active members of the organization
            const isValidWatcher = await Membership.findOne({
                user: watcherId,
                organization: req.organization._id,
                status: 'active'
            });
            if (!isValidWatcher) {
                return res.status(400).json({ msg: 'Watcher must be an active member of the organization' });
            }
            if (!task.watchers.some(id => String(id) === String(watcherId))) {
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

// --- Bulk Operations ---

/**
 * @desc    Bulk update or archive tasks
 * @route   POST /api/horizon/tasks/bulk
 * @access  Private
 * @body    { taskIds: [...], action: 'update'|'archive', updates: { status?, priority?, assignee?, category?, parentTask?, dueDate? } }
 */
exports.bulkUpdateTasks = async (req, res) => {
    try {
        const { taskIds, action = 'update', updates = {} } = req.body;

        if (!Array.isArray(taskIds) || taskIds.length === 0) {
            return res.status(400).json({ msg: 'taskIds must be a non-empty array' });
        }
        if (taskIds.length > 100) {
            return res.status(400).json({ msg: 'Cannot update more than 100 tasks at once' });
        }
        if (taskIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
            return res.status(400).json({ msg: 'One or more task IDs are invalid' });
        }
        if (!['update', 'archive'].includes(action)) {
            return res.status(400).json({ msg: "action must be 'update' or 'archive'" });
        }

        // Whitelist of bulk-updatable fields
        const allowed = {};
        if (action === 'update') {
            if (updates.status !== undefined) allowed.status = updates.status;
            if (updates.priority !== undefined) allowed.priority = updates.priority;
            if (updates.category !== undefined) allowed.category = updates.category;
            if (updates.assignee !== undefined) allowed.assignee = updates.assignee || null;
            if (updates.parentTask !== undefined) allowed.parentTask = updates.parentTask || null;
            if (updates.dueDate !== undefined) allowed.dueDate = updates.dueDate || null;
            if (Object.keys(allowed).length === 0) {
                return res.status(400).json({ msg: 'No valid update fields provided' });
            }
        }

        // Validate assignee and parent once for the whole batch
        if (allowed.assignee) {
            const isValidAssignee = await Membership.findOne({
                user: allowed.assignee,
                organization: req.organization._id,
                status: 'active'
            });
            if (!isValidAssignee) {
                return res.status(400).json({ msg: 'Assignee must be an active member of the organization' });
            }
        }
        if (allowed.parentTask) {
            const parentCheck = await verifyTasksBelongToOrganization(allowed.parentTask, req.organization._id);
            if (!parentCheck.valid) {
                return res.status(400).json({ msg: 'Parent task not found in your organization' });
            }
        }

        const tasks = await Task.find({
            _id: { $in: taskIds },
            organization: req.organization._id
        });

        let updated = 0;
        const skipped = [];
        const newlyAssigned = [];

        for (const task of tasks) {
            if (!task.canUserModify(req.user._id, req.organizationRole)) {
                skipped.push({ id: task._id, taskKey: task.taskKey, reason: 'no permission' });
                continue;
            }
            if (allowed.parentTask && String(allowed.parentTask) === String(task._id)) {
                skipped.push({ id: task._id, taskKey: task.taskKey, reason: 'cannot be its own parent' });
                continue;
            }

            if (action === 'archive') {
                task.isArchived = true;
            } else {
                if (allowed.status !== undefined && allowed.status !== task.status) {
                    await TaskComment.createSystemComment(
                        task._id, req.organization._id, 'status', task.status, allowed.status, req.user._id
                    );
                    task.status = allowed.status;
                }
                if (allowed.priority !== undefined) task.priority = allowed.priority;
                if (allowed.category !== undefined) task.category = allowed.category;
                if (allowed.dueDate !== undefined) task.dueDate = allowed.dueDate;
                if (allowed.assignee !== undefined && String(allowed.assignee) !== String(task.assignee)) {
                    task.assignee = allowed.assignee;
                    if (allowed.assignee) newlyAssigned.push(task);
                }
                if (allowed.parentTask !== undefined && String(allowed.parentTask || '') !== String(task.parentTask || '')) {
                    if (task.parentTask) {
                        await Task.updateOne(
                            { _id: task.parentTask, organization: req.organization._id },
                            { $pull: { subtasks: task._id } }
                        );
                    }
                    if (allowed.parentTask) {
                        await Task.updateOne(
                            { _id: allowed.parentTask, organization: req.organization._id },
                            { $addToSet: { subtasks: task._id } }
                        );
                    }
                    task.parentTask = allowed.parentTask;
                }
            }
            await task.save();
            updated += 1;
        }

        // Found vs requested mismatch = tasks outside the org or deleted
        const foundIds = new Set(tasks.map(t => String(t._id)));
        taskIds.filter(id => !foundIds.has(String(id)))
            .forEach(id => skipped.push({ id, reason: 'not found in your organization' }));

        // One assignment notification covering the batch
        if (newlyAssigned.length > 0) {
            notifyUsers({
                organizationId: req.organization._id,
                recipientIds: [allowed.assignee],
                actorId: req.user._id,
                type: 'task_assigned',
                title: `You were assigned ${newlyAssigned.length} task${newlyAssigned.length === 1 ? '' : 's'}`,
                message: newlyAssigned.slice(0, 10).map(t => `• ${t.taskKey ? t.taskKey + ' ' : ''}${t.title}`).join('\n'),
                taskId: newlyAssigned.length === 1 ? newlyAssigned[0]._id : null
            });
        }

        res.json({
            msg: `${updated} task${updated === 1 ? '' : 's'} ${action === 'archive' ? 'archived' : 'updated'}`,
            updated,
            skipped
        });

    } catch (err) {
        console.error('Error in bulk task update:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message });
        }
        res.status(500).send('Server Error: Could not bulk update tasks');
    }
};

// --- CSV Import ---

const CSV_STATUS_MAP = {
    'todo': 'todo', 'to do': 'todo', 'yet to start': 'todo', 'not started': 'todo', 'open': 'todo',
    'in progress': 'in_progress', 'in_progress': 'in_progress', 'inprogress': 'in_progress', 'wip': 'in_progress', 'doing': 'in_progress',
    'in review': 'in_review', 'in_review': 'in_review', 'review': 'in_review',
    'blocked': 'blocked', 'on hold': 'blocked',
    'done': 'completed', 'completed': 'completed', 'complete': 'completed', 'closed': 'completed',
    'cancelled': 'cancelled', 'canceled': 'cancelled', 'dropped': 'cancelled',
};
const CSV_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const CSV_CATEGORIES = ['development', 'marketing', 'sales', 'operations', 'finance', 'hr', 'design', 'other'];

/**
 * @desc    Import tasks from CSV (dry-run by default).
 *          Columns (case/space-insensitive): title*, description, category,
 *          subcategory, priority, status, assignee (email), due date,
 *          start date, tags, parent (epic task key e.g. SLT-50), type (epic|task)
 * @route   POST /api/horizon/tasks/import
 * @access  Private
 * @body    { csv: "<raw csv>", dryRun: true|false, defaultParentKey?: "SLT-50" }
 */
exports.importTasksCsv = async (req, res) => {
    try {
        const Papa = require('papaparse');
        const { csv, dryRun = true, defaultParentKey } = req.body;

        if (!csv || typeof csv !== 'string') {
            return res.status(400).json({ msg: 'csv (string) is required' });
        }
        if (csv.length > 2 * 1024 * 1024) {
            return res.status(400).json({ msg: 'CSV too large (max 2MB)' });
        }

        const parsed = Papa.parse(csv.trim(), { header: true, skipEmptyLines: true });
        let rows = parsed.data || [];
        if (rows.length === 0) {
            return res.status(400).json({ msg: 'No data rows found in CSV (a header row is required)' });
        }
        if (rows.length > 500) {
            return res.status(400).json({ msg: `Too many rows (${rows.length}); max 500 per import` });
        }

        // Normalize header names: "Due Date" -> "duedate"
        const norm = (s) => String(s || '').toLowerCase().replace(/[\s_-]/g, '');
        const get = (row, ...names) => {
            for (const k of Object.keys(row)) {
                if (names.includes(norm(k))) {
                    const v = row[k];
                    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
                }
            }
            return null;
        };

        // Resolve assignee emails -> active members, parent keys -> tasks (cached)
        const memberCache = new Map();
        const parentCache = new Map();
        const resolveMember = async (email) => {
            const key = email.toLowerCase();
            if (memberCache.has(key)) return memberCache.get(key);
            const user = await HorizonUser.findOne({ email: key }).select('_id');
            let result = null;
            if (user) {
                const member = await Membership.findOne({
                    user: user._id, organization: req.organization._id, status: 'active'
                });
                if (member) result = user._id;
            }
            memberCache.set(key, result);
            return result;
        };
        const resolveParent = async (taskKey) => {
            const key = taskKey.toUpperCase();
            if (parentCache.has(key)) return parentCache.get(key);
            const parent = await Task.findOne({
                organization: req.organization._id, taskKey: key
            }).select('_id title');
            parentCache.set(key, parent || null);
            return parent || null;
        };

        const preview = [];
        const validRows = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const errors = [];
            const warnings = [];

            const title = get(row, 'title', 'task', 'action', 'name');
            if (!title) errors.push('Missing title');
            if (title && title.length > 200) errors.push('Title exceeds 200 characters');

            let category = (get(row, 'category') || 'other').toLowerCase();
            if (!CSV_CATEGORIES.includes(category)) {
                warnings.push(`Unknown category "${category}" — defaulting to "other"`);
                category = 'other';
            }

            let priority = (get(row, 'priority') || 'medium').toLowerCase();
            if (!CSV_PRIORITIES.includes(priority)) {
                warnings.push(`Unknown priority "${priority}" — defaulting to "medium"`);
                priority = 'medium';
            }

            const rawStatus = get(row, 'status');
            let status = 'todo';
            if (rawStatus) {
                status = CSV_STATUS_MAP[rawStatus.toLowerCase()];
                if (!status) {
                    warnings.push(`Unknown status "${rawStatus}" — defaulting to "todo"`);
                    status = 'todo';
                }
            }

            const parseDate = (value, label) => {
                if (!value) return null;
                const d = new Date(value);
                if (isNaN(d.getTime())) {
                    errors.push(`Invalid ${label}: "${value}"`);
                    return null;
                }
                return d;
            };
            const dueDate = parseDate(get(row, 'duedate', 'due', 'targetdate', 'deadline'), 'due date');
            const startDate = parseDate(get(row, 'startdate', 'start'), 'start date');

            let assignee = null;
            const assigneeEmail = get(row, 'assignee', 'assigneeemail', 'owner', 'email');
            if (assigneeEmail) {
                if (assigneeEmail.includes('@')) {
                    assignee = await resolveMember(assigneeEmail);
                    if (!assignee) errors.push(`Assignee "${assigneeEmail}" is not an active member`);
                } else {
                    warnings.push(`Assignee "${assigneeEmail}" is not an email — leaving unassigned`);
                }
            }

            let parentId = null;
            let parentTitle = null;
            const parentKey = get(row, 'parent', 'parentkey', 'epic', 'parenttask') || defaultParentKey || null;
            if (parentKey) {
                const parent = await resolveParent(parentKey);
                if (!parent) errors.push(`Parent task "${parentKey}" not found`);
                else { parentId = parent._id; parentTitle = parent.title; }
            }

            const tagsRaw = get(row, 'tags', 'labels');
            const tags = tagsRaw ? tagsRaw.split(/[,;|]/).map(t => t.trim().toLowerCase()).filter(Boolean) : [];

            const taskType = (get(row, 'type', 'tasktype') || 'task').toLowerCase() === 'epic' ? 'epic' : 'task';

            const candidate = {
                title, description: get(row, 'description', 'details', 'notes', 'whyitmatters') || '',
                category, subcategory: get(row, 'subcategory') || null,
                priority, status, taskType, tags,
                assignee, dueDate, startDate, parentTask: parentId,
            };

            preview.push({
                row: i + 1,
                title: title || '(missing)',
                parent: parentKey ? `${parentKey}${parentTitle ? ' — ' + parentTitle : ''}` : null,
                status, priority, category,
                dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
                assigned: !!assignee,
                ok: errors.length === 0,
                errors, warnings,
            });
            if (errors.length === 0) validRows.push(candidate);
        }

        const summary = {
            totalRows: rows.length,
            validRows: validRows.length,
            errorRows: rows.length - validRows.length,
        };

        if (dryRun !== false && dryRun !== 'false') {
            return res.json({ dryRun: true, summary, preview });
        }

        if (validRows.length === 0) {
            return res.status(400).json({ msg: 'No valid rows to import', summary, preview });
        }

        // Create tasks sequentially so keys stay ordered like the file
        const createdKeys = [];
        for (const candidate of validRows) {
            const task = new Task({
                organization: req.organization._id,
                creator: req.user._id,
                watchers: [req.user._id],
                ...candidate,
            });
            await task.save();
            createdKeys.push(task.taskKey);
            if (candidate.parentTask) {
                await Task.updateOne(
                    { _id: candidate.parentTask, organization: req.organization._id },
                    { $addToSet: { subtasks: task._id } }
                );
            }
            await TaskComment.createSystemComment(
                task._id, req.organization._id, 'status', null, task.status, req.user._id
            );
        }

        res.status(201).json({
            msg: `${createdKeys.length} task${createdKeys.length === 1 ? '' : 's'} imported`,
            summary,
            createdKeys,
            preview,
        });

    } catch (err) {
        console.error('Error importing tasks from CSV:', err.message, err.stack);
        res.status(500).send('Server Error: Could not import tasks');
    }
};

// --- Task Links (JIRA-style relations) ---

/**
 * @desc    Link this task to another (blocks / relates_to / duplicates)
 * @route   POST /api/horizon/tasks/:id/links
 * @access  Private
 */
exports.addTaskLink = async (req, res) => {
    try {
        const { targetTaskId, linkType } = req.body;

        if (!mongoose.Types.ObjectId.isValid(req.params.id) ||
            !mongoose.Types.ObjectId.isValid(targetTaskId || '')) {
            return res.status(400).json({ msg: 'Invalid task ID format' });
        }
        if (!TaskLink.LINK_TYPES.includes(linkType)) {
            return res.status(400).json({ msg: `Invalid link type. Use one of: ${TaskLink.LINK_TYPES.join(', ')}` });
        }
        if (String(req.params.id) === String(targetTaskId)) {
            return res.status(400).json({ msg: 'A task cannot be linked to itself' });
        }

        // Both tasks must exist within this organization
        const orgCheck = await verifyTasksBelongToOrganization(
            [req.params.id, targetTaskId], req.organization._id
        );
        if (!orgCheck.valid) {
            return res.status(404).json({ msg: 'Task not found in your organization' });
        }

        // Reject duplicates in either direction for the same link type
        const existing = await TaskLink.findOne({
            organization: req.organization._id,
            linkType,
            $or: [
                { sourceTask: req.params.id, targetTask: targetTaskId },
                { sourceTask: targetTaskId, targetTask: req.params.id }
            ]
        });
        if (existing) {
            return res.status(400).json({ msg: 'These tasks are already linked with this link type' });
        }

        const link = await TaskLink.create({
            organization: req.organization._id,
            sourceTask: req.params.id,
            targetTask: targetTaskId,
            linkType,
            createdBy: req.user._id
        });

        const populated = await TaskLink.findById(link._id)
            .populate('sourceTask', 'title status taskKey taskType')
            .populate('targetTask', 'title status taskKey taskType');

        res.status(201).json({ msg: 'Tasks linked successfully', link: populated });

    } catch (err) {
        console.error('Error adding task link:', err.message, err.stack);
        res.status(500).send('Server Error: Could not link tasks');
    }
};

/**
 * @desc    Remove a link between tasks
 * @route   DELETE /api/horizon/tasks/:id/links/:linkId
 * @access  Private
 */
exports.deleteTaskLink = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.linkId)) {
            return res.status(400).json({ msg: 'Invalid link ID format' });
        }

        const link = await TaskLink.findOneAndDelete({
            _id: req.params.linkId,
            organization: req.organization._id,
            $or: [{ sourceTask: req.params.id }, { targetTask: req.params.id }]
        });

        if (!link) {
            return res.status(404).json({ msg: 'Link not found' });
        }

        res.json({ msg: 'Link removed successfully' });

    } catch (err) {
        console.error('Error deleting task link:', err.message, err.stack);
        res.status(500).send('Server Error: Could not remove link');
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

        // Exclude archived tasks so stats match what the task list/board shows
        const matchStage = { organization: req.organization._id, isArchived: false };

        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) matchStage.createdAt.$gte = new Date(startDate);
            if (endDate) matchStage.createdAt.$lte = new Date(endDate);
        }

        if (assignee) {
            if (!mongoose.Types.ObjectId.isValid(assignee)) {
                return res.status(400).json({ msg: 'Invalid assignee ID format' });
            }
            matchStage.assignee = new mongoose.Types.ObjectId(String(assignee));
        }

        const [
            statusStats,
            priorityStats,
            categoryStats,
            subcategoryStats,
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
            
            // Subcategory distribution
            Task.aggregate([
                { $match: { ...matchStage, subcategory: { $nin: [null, ''] } } },
                { $group: { 
                    _id: { 
                        category: '$category', 
                        subcategory: '$subcategory' 
                    }, 
                    count: { $sum: 1 } 
                } },
                { $sort: { count: -1 } },
                { $limit: 10 }
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
            subcategoryDistribution: subcategoryStats,
            tasksByAssignee: assigneeStats,
            overdueCount,
            totalTasks: statusStats.reduce((sum, stat) => sum + stat.count, 0)
        });

    } catch (err) {
        console.error('Error fetching task stats:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch task statistics');
    }
};