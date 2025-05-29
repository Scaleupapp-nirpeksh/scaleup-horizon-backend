// controllers/productMilestoneController.js
const ProductMilestone = require('../models/productMilestoneModel');
const Headcount = require('../models/headcountModel');
const mongoose = require('mongoose');

/**
 * Product Milestone Controller
 * Handles all operations related to product milestones, roadmap, and feature tracking
 * Implements organization-level multi-tenancy for team collaboration
 */
const productMilestoneController = {
    /**
     * Create a new product milestone
     * @desc    Create a product milestone for the active organization
     * @route   POST /api/horizon/product-milestones
     * @access  Private (Requires authenticated user with organization context)
     */
    createMilestone: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            const {
                name, description, milestoneType, status, completionPercentage,
                plannedStartDate, plannedEndDate, actualStartDate, actualEndDate,
                productOwner, teamMembers, tasks, businessImpact, quarter, priority,
                visibleToInvestors, investorSummary
            } = req.body;

            // Validate required fields
            if (!name || !plannedStartDate || !plannedEndDate) {
                return res.status(400).json({
                    success: false,
                    msg: 'Name, planned start date, and planned end date are required'
                });
            }

            // Create new milestone
            const newMilestone = new ProductMilestone({
                organization: organizationId,  // Scope to organization
                user: userId,                  // Track creator
                name,
                description,
                milestoneType: milestoneType || 'Feature',
                status: status || 'Planning',
                completionPercentage: completionPercentage || 0,
                plannedStartDate,
                plannedEndDate,
                actualStartDate,
                actualEndDate,
                productOwner,
                teamMembers: teamMembers || [],
                tasks: tasks || [],
                businessImpact,
                quarter,
                priority: priority || 'Medium',
                visibleToInvestors: visibleToInvestors !== undefined ? visibleToInvestors : true,
                investorSummary,
                createdBy: userId              // Maintain for backward compatibility
            });

            // Save to database
            const milestone = await newMilestone.save();

            res.status(201).json({
                success: true,
                data: milestone
            });
        } catch (err) {
            console.error('Error creating product milestone:', err.message);
            
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({
                    success: false,
                    msg: messages.join(', ')
                });
            }

            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not create product milestone'
            });
        }
    },

    /**
     * Get all product milestones with optional filtering
     * @desc    Get product milestones for the active organization
     * @route   GET /api/horizon/product-milestones
     * @access  Private
     */
    getMilestones: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            const {
                status, milestoneType, quarter, search,
                sortBy = 'plannedEndDate', sortDir = 'asc', 
                page = 1, limit = 50, showInvestorOnly = false
            } = req.query;

            // --- MULTI-TENANCY: Base filter includes organizationId ---
            const filter = { organization: organizationId };
            
            if (status) {
                if (status.includes(',')) {
                    filter.status = { $in: status.split(',') };
                } else {
                    filter.status = status;
                }
            }
            
            if (milestoneType) filter.milestoneType = milestoneType;
            if (quarter) filter.quarter = quarter;
            if (showInvestorOnly === 'true') filter.visibleToInvestors = true;
            
            // Text search (if provided)
            if (search) {
                filter.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }

            // Calculate pagination
            const skip = (page - 1) * limit;
            
            // Set sort order
            const sort = {};
            sort[sortBy] = sortDir === 'desc' ? -1 : 1;

            // Execute query with pagination
            const milestones = await ProductMilestone.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('productOwner', 'name')
                .populate('teamMembers', 'name title')
                .populate('tasks.assignee', 'name')
                .populate('createdBy', 'name email');  // Show who created it

            // Get total count for pagination
            const total = await ProductMilestone.countDocuments(filter);

            res.json({
                success: true,
                count: milestones.length,
                total,
                totalPages: Math.ceil(total / limit),
                currentPage: parseInt(page),
                data: milestones
            });
        } catch (err) {
            console.error('Error fetching product milestones:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not fetch product milestones'
            });
        }
    },

    /**
     * Get product roadmap summary for investor view
     * @desc    Get investor-visible roadmap for the active organization
     * @route   GET /api/horizon/product-milestones/investor-roadmap
     * @access  Private
     */
    getInvestorRoadmap: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            // --- MULTI-TENANCY: Filter all queries by organizationId ---
            // Get upcoming milestones (only those visible to investors)
            const upcomingMilestones = await ProductMilestone.find({
                organization: organizationId,
                visibleToInvestors: true,
                status: { $nin: ['Completed', 'Cancelled'] }
            })
            .sort({ plannedEndDate: 1 })
            .select('name description status completionPercentage plannedEndDate quarter priority businessImpact investorSummary')
            .limit(10);

            // Get recently completed milestones
            const completedMilestones = await ProductMilestone.find({
                organization: organizationId,
                visibleToInvestors: true,
                status: 'Completed'
            })
            .sort({ actualEndDate: -1 })
            .select('name description actualEndDate businessImpact investorSummary')
            .limit(5);

            // Get milestones by quarter for the organization
            const quarterlyMilestones = await ProductMilestone.getMilestonesByQuarter(organizationId);

            // Get status summary for the organization
            const statusSummary = await ProductMilestone.getStatusSummary(organizationId);

            res.json({
                success: true,
                data: {
                    upcomingMilestones,
                    completedMilestones,
                    quarterlyMilestones,
                    statusSummary
                }
            });
        } catch (err) {
            console.error('Error fetching investor roadmap:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not fetch investor roadmap'
            });
        }
    },

    /**
     * Get a single product milestone by ID
     * @desc    Get specific product milestone for the active organization
     * @route   GET /api/horizon/product-milestones/:id
     * @access  Private
     */
    getMilestoneById: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const milestone = await ProductMilestone.findOne({ 
                _id: req.params.id,
                organization: organizationId 
            })
            .populate('productOwner', 'name title department')
            .populate('teamMembers', 'name title')
            .populate('tasks.assignee', 'name title')
            .populate('relatedDocuments')
            .populate('dependencies.milestoneId', 'name status completionPercentage')
            .populate('user', 'name email');  // Show who created it

            if (!milestone) {
                return res.status(404).json({
                    success: false,
                    msg: 'Product milestone not found within your organization'
                });
            }

            res.json({
                success: true,
                data: milestone
            });
        } catch (err) {
            console.error('Error fetching product milestone by ID:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not fetch product milestone'
            });
        }
    },

    /**
     * Update a product milestone
     * @desc    Update product milestone for the active organization
     * @route   PUT /api/horizon/product-milestones/:id
     * @access  Private
     */
    updateMilestone: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const milestone = await ProductMilestone.findOne({ 
                _id: req.params.id,
                organization: organizationId 
            });

            if (!milestone) {
                return res.status(404).json({
                    success: false,
                    msg: 'Product milestone not found within your organization'
                });
            }

            // Update status-related fields automatically
            if (req.body.status === 'In Development' && milestone.status !== 'In Development') {
                // If changing to In Development, set actualStartDate if not already set
                if (!req.body.actualStartDate && !milestone.actualStartDate) {
                    req.body.actualStartDate = new Date();
                }
            }

            if (req.body.status === 'Completed' && milestone.status !== 'Completed') {
                // If changing to Completed, set actualEndDate if not already set
                if (!req.body.actualEndDate && !milestone.actualEndDate) {
                    req.body.actualEndDate = new Date();
                }
                
                // Also set completionPercentage to 100
                req.body.completionPercentage = 100;
            }

            // Add updatedBy field
            req.body.updatedBy = userId;

            // --- MULTI-TENANCY: Ensure organization match in update ---
            const updatedMilestone = await ProductMilestone.findOneAndUpdate(
                { _id: req.params.id, organization: organizationId },
                { $set: req.body },
                { new: true, runValidators: true }
            );

            res.json({
                success: true,
                data: updatedMilestone
            });
        } catch (err) {
            console.error('Error updating product milestone:', err.message);
            
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({
                    success: false,
                    msg: messages.join(', ')
                });
            }

            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not update product milestone'
            });
        }
    },

    /**
     * Delete a product milestone
     * @desc    Delete product milestone for the active organization
     * @route   DELETE /api/horizon/product-milestones/:id
     * @access  Private
     */
    deleteMilestone: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const milestone = await ProductMilestone.findOne({ 
                _id: req.params.id,
                organization: organizationId 
            });

            if (!milestone) {
                return res.status(404).json({
                    success: false,
                    msg: 'Product milestone not found within your organization'
                });
            }

            // Instead of hard delete, consider soft delete for important data
            // For now, we'll do a hard delete
            await ProductMilestone.findOneAndDelete({ 
                _id: req.params.id,
                organization: organizationId 
            });

            res.json({
                success: true,
                data: {},
                msg: 'Product milestone removed'
            });
        } catch (err) {
            console.error('Error deleting product milestone:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not delete product milestone'
            });
        }
    },

    /**
     * Add a task to a milestone
     * @desc    Add task to milestone for the active organization
     * @route   POST /api/horizon/product-milestones/:id/tasks
     * @access  Private
     */
    addTask: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const { 
                taskName, description, assignee, status, 
                priority, dueDate, dependencies
            } = req.body;

            if (!taskName) {
                return res.status(400).json({
                    success: false,
                    msg: 'Task name is required'
                });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const milestone = await ProductMilestone.findOne({ 
                _id: req.params.id,
                organization: organizationId 
            });

            if (!milestone) {
                return res.status(404).json({
                    success: false,
                    msg: 'Product milestone not found within your organization'
                });
            }

            // Create new task
            const newTask = {
                taskName,
                description,
                assignee,
                status: status || 'Not Started',
                priority: priority || 'Medium',
                startDate: new Date(),
                dueDate,
                dependencies: dependencies || [],
                completionPercentage: 0,
                createdBy: userId  // Track who created the task
            };

            // Add task to milestone
            milestone.tasks.push(newTask);
            milestone.updatedBy = userId;

            await milestone.save();

            res.status(201).json({
                success: true,
                data: milestone.tasks[milestone.tasks.length - 1],
                msg: 'Task added successfully'
            });
        } catch (err) {
            console.error('Error adding task:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not add task'
            });
        }
    },

    /**
     * Update a task within a milestone
     * @desc    Update task in milestone for the active organization
     * @route   PUT /api/horizon/product-milestones/:id/tasks/:taskId
     * @access  Private
     */
    updateTask: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id) || 
                !mongoose.Types.ObjectId.isValid(req.params.taskId)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const milestone = await ProductMilestone.findOne({ 
                _id: req.params.id,
                organization: organizationId 
            });

            if (!milestone) {
                return res.status(404).json({
                    success: false,
                    msg: 'Product milestone not found within your organization'
                });
            }

            // Find task index
            const taskIndex = milestone.tasks.findIndex(
                task => task._id.toString() === req.params.taskId
            );

            if (taskIndex === -1) {
                return res.status(404).json({
                    success: false,
                    msg: 'Task not found'
                });
            }

            // Update task with provided fields
            const task = milestone.tasks[taskIndex];
            const updatedTask = { ...task.toObject(), ...req.body };

            // If status is changed to Completed, set completionPercentage to 100 and completedDate
            if (req.body.status === 'Completed' && task.status !== 'Completed') {
                updatedTask.completionPercentage = 100;
                updatedTask.completedDate = new Date();
            }

            updatedTask.updatedBy = userId;  // Track who updated the task

            milestone.tasks[taskIndex] = updatedTask;
            milestone.updatedBy = userId;

            await milestone.save();

            res.json({
                success: true,
                data: milestone.tasks[taskIndex],
                msg: 'Task updated successfully'
            });
        } catch (err) {
            console.error('Error updating task:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not update task'
            });
        }
    },

    /**
     * Delete a task from a milestone
     * @desc    Delete task from milestone for the active organization
     * @route   DELETE /api/horizon/product-milestones/:id/tasks/:taskId
     * @access  Private
     */
    deleteTask: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id) || 
                !mongoose.Types.ObjectId.isValid(req.params.taskId)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const milestone = await ProductMilestone.findOne({ 
                _id: req.params.id,
                organization: organizationId 
            });

            if (!milestone) {
                return res.status(404).json({
                    success: false,
                    msg: 'Product milestone not found within your organization'
                });
            }

            // Find task index
            const taskIndex = milestone.tasks.findIndex(
                task => task._id.toString() === req.params.taskId
            );

            if (taskIndex === -1) {
                return res.status(404).json({
                    success: false,
                    msg: 'Task not found'
                });
            }

            // Remove task
            milestone.tasks.splice(taskIndex, 1);
            milestone.updatedBy = userId;

            await milestone.save();

            res.json({
                success: true,
                msg: 'Task removed successfully'
            });
        } catch (err) {
            console.error('Error deleting task:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not delete task'
            });
        }
    },

    /**
     * Get product milestone statistics
     * @desc    Get milestone statistics for the active organization
     * @route   GET /api/horizon/product-milestones/statistics
     * @access  Private
     */
    getMilestoneStatistics: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            // --- MULTI-TENANCY: Filter all aggregations by organizationId ---
            // Get status counts
            const statusCounts = await ProductMilestone.aggregate([
                { $match: { organization: organizationId } },
                { $group: { 
                    _id: '$status', 
                    count: { $sum: 1 } 
                }},
                { $sort: { _id: 1 } }
            ]);

            // Get type counts
            const typeCounts = await ProductMilestone.aggregate([
                { $match: { organization: organizationId } },
                { $group: { 
                    _id: '$milestoneType', 
                    count: { $sum: 1 } 
                }},
                { $sort: { _id: 1 } }
            ]);

            // Get completion percentage average
            const completionStats = await ProductMilestone.aggregate([
                { $match: { 
                    organization: organizationId,
                    status: { $nin: ['Completed', 'Cancelled'] } 
                }},
                { $group: { 
                    _id: null, 
                    avgCompletion: { $avg: '$completionPercentage' },
                    count: { $sum: 1 }
                }}
            ]);

            // Get on-time vs delayed stats
            const today = new Date();
            const delayedCount = await ProductMilestone.countDocuments({
                organization: organizationId,
                status: { $nin: ['Completed', 'Cancelled'] },
                plannedEndDate: { $lt: today }
            });

            const onTimeCount = await ProductMilestone.countDocuments({
                organization: organizationId,
                status: { $nin: ['Completed', 'Cancelled'] },
                plannedEndDate: { $gte: today }
            });

            // Get quarterly breakdown
            const quarterlyBreakdown = await ProductMilestone.aggregate([
                { $match: { 
                    organization: organizationId,
                    quarter: { $exists: true, $ne: null } 
                }},
                { $group: { 
                    _id: '$quarter', 
                    count: { $sum: 1 },
                    completed: { 
                        $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } 
                    }
                }},
                { $sort: { _id: 1 } }
            ]);

            res.json({
                success: true,
                data: {
                    statusCounts,
                    typeCounts,
                    completionStats: completionStats.length > 0 ? {
                        avgCompletion: completionStats[0].avgCompletion,
                        count: completionStats[0].count
                    } : { avgCompletion: 0, count: 0 },
                    timelineStats: {
                        delayed: delayedCount,
                        onTime: onTimeCount,
                        delayedPercentage: delayedCount + onTimeCount > 0 
                            ? (delayedCount / (delayedCount + onTimeCount)) * 100
                            : 0
                    },
                    quarterlyBreakdown
                }
            });
        } catch (err) {
            console.error('Error fetching milestone statistics:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not fetch milestone statistics'
            });
        }
    }
};

module.exports = productMilestoneController;