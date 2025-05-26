// controllers/headcountController.js
const Headcount = require('../models/headcountModel');
const Expense = require('../models/expenseModel');
const Budget = require('../models/budgetModel');
const mongoose = require('mongoose');

/**
 * Headcount Controller
 * Handles all operations related to employee and team management
 */
const headcountController = {
    /**
     * Create a new headcount entry (employee or open position)
     * @route POST /api/horizon/headcount
     * @access Private
     */
    createHeadcount: async (req, res) => {
        try {
            const {
                name, email, title, department, employmentType, status,
                compensation, startDate, reportingTo, level, location,
                remoteStatus, budgetTracking, hiringDetails
            } = req.body;

            // Validate required fields
            if (!name || !title || !department) {
                return res.status(400).json({ 
                    success: false, 
                    msg: 'Name, title, and department are required' 
                });
            }

            // Create new headcount entry
            const newHeadcount = new Headcount({
                name,
                email,
                title,
                department,
                employmentType: employmentType || 'Full-time',
                status: status || (name ? 'Active' : 'Open Requisition'),
                compensation,
                startDate,
                reportingTo,
                level,
                location,
                remoteStatus,
                budgetTracking,
                hiringDetails,
                createdBy: req.horizonUser.id
            });

            // Save to database
            const headcount = await newHeadcount.save();

            // If this is linked to a budget category, update budget tracking
            if (budgetTracking && budgetTracking.budgetCategory) {
                try {
                    const budget = await Budget.findById(budgetTracking.budgetCategory);
                    if (budget) {
                        // Logic to update budget tracking would go here
                        console.log(`Linked headcount ${headcount._id} to budget ${budget._id}`);
                    }
                } catch (budgetError) {
                    console.error('Error linking to budget:', budgetError);
                }
            }

            res.status(201).json({
                success: true,
                data: headcount
            });
        } catch (err) {
            console.error('Error creating headcount:', err.message);
            
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({
                    success: false,
                    msg: messages.join(', ')
                });
            }

            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not create headcount entry'
            });
        }
    },

    /**
     * Get all headcount entries with optional filtering
     * @route GET /api/horizon/headcount
     * @access Private
     */
    getHeadcounts: async (req, res) => {
        try {
            const { 
                department, status, employmentType, search,
                sortBy = 'name', sortDir = 'asc', page = 1, limit = 50
            } = req.query;

            // Build filter object
            const filter = {};
            if (department) filter.department = department;
            if (status) filter.status = status;
            if (employmentType) filter.employmentType = employmentType;
            
            // Text search (if provided)
            if (search) {
                filter.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { title: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ];
            }

            // Calculate pagination
            const skip = (page - 1) * limit;
            
            // Set sort order
            const sort = {};
            sort[sortBy] = sortDir === 'desc' ? -1 : 1;

            // Execute query with pagination
            const headcounts = await Headcount.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('reportingTo', 'name title')
                .populate('budgetTracking.budgetCategory', 'name periodType');

            // Get total count for pagination
            const total = await Headcount.countDocuments(filter);

            res.json({
                success: true,
                count: headcounts.length,
                total,
                totalPages: Math.ceil(total / limit),
                currentPage: parseInt(page),
                data: headcounts
            });
        } catch (err) {
            console.error('Error fetching headcount entries:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not fetch headcount entries'
            });
        }
    },

    /**
     * Get headcount summary statistics
     * @route GET /api/horizon/headcount/summary
     * @access Private
     */
    getHeadcountSummary: async (req, res) => {
        try {
            // Get current active headcount
            const activeCount = await Headcount.countDocuments({ status: 'Active' });
            
            // Get headcount by department
            const departmentBreakdown = await Headcount.getHeadcountByDepartment('Active');
            
            // Get headcount by employment type
            const employmentTypeBreakdown = await Headcount.aggregate([
                { $match: { status: 'Active' } },
                { $group: { 
                    _id: '$employmentType', 
                    count: { $sum: 1 } 
                }},
                { $sort: { _id: 1 } }
            ]);
            
            // Get open positions count
            const openPositionsCount = await Headcount.countDocuments({ 
                status: 'Open Requisition' 
            });
            
            // Get total headcount cost
            const totalCost = await Headcount.getTotalAnnualCost('Active');
            
            // Get hiring pipeline stats
            const hiringPipeline = await Headcount.aggregate([
                { $match: { status: { $in: ['Open Requisition', 'Interviewing', 'Offer Extended'] } } },
                { $group: { 
                    _id: '$status', 
                    count: { $sum: 1 } 
                }},
                { $sort: { _id: 1 } }
            ]);
            
            // Calculate monthly burn from active employees
            const monthlyBurn = totalCost / 12;

            res.json({
                success: true,
                data: {
                    totalHeadcount: activeCount,
                    openPositions: openPositionsCount,
                    departmentBreakdown,
                    employmentTypeBreakdown,
                    annualCost: totalCost,
                    monthlyBurn,
                    hiringPipeline
                }
            });
        } catch (err) {
            console.error('Error fetching headcount summary:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not fetch headcount summary'
            });
        }
    },

    /**
     * Get a single headcount entry by ID
     * @route GET /api/horizon/headcount/:id
     * @access Private
     */
    getHeadcountById: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const headcount = await Headcount.findById(req.params.id)
                .populate('reportingTo', 'name title department')
                .populate('budgetTracking.budgetCategory', 'name periodType')
                .populate('relatedExpenses');

            if (!headcount) {
                return res.status(404).json({
                    success: false,
                    msg: 'Headcount entry not found'
                });
            }

            res.json({
                success: true,
                data: headcount
            });
        } catch (err) {
            console.error('Error fetching headcount by ID:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not fetch headcount entry'
            });
        }
    },

    /**
     * Update a headcount entry
     * @route PUT /api/horizon/headcount/:id
     * @access Private
     */
    updateHeadcount: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const headcount = await Headcount.findById(req.params.id);

            if (!headcount) {
                return res.status(404).json({
                    success: false,
                    msg: 'Headcount entry not found'
                });
            }

            // Update status-related fields automatically
            if (req.body.status === 'Active' && headcount.status !== 'Active') {
                // If changing to Active, set startDate if not already set
                if (!req.body.startDate && !headcount.startDate) {
                    req.body.startDate = new Date();
                }
            }

            if (req.body.status === 'Former' && headcount.status !== 'Former') {
                // If changing to Former, set endDate if not already set
                if (!req.body.endDate && !headcount.endDate) {
                    req.body.endDate = new Date();
                }
            }

            // Add updatedBy field
            req.body.updatedBy = req.horizonUser.id;

            const updatedHeadcount = await Headcount.findByIdAndUpdate(
                req.params.id,
                { $set: req.body },
                { new: true, runValidators: true }
            );

            res.json({
                success: true,
                data: updatedHeadcount
            });
        } catch (err) {
            console.error('Error updating headcount:', err.message);
            
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({
                    success: false,
                    msg: messages.join(', ')
                });
            }

            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not update headcount entry'
            });
        }
    },

    /**
     * Delete a headcount entry
     * @route DELETE /api/horizon/headcount/:id
     * @access Private
     */
    deleteHeadcount: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const headcount = await Headcount.findById(req.params.id);

            if (!headcount) {
                return res.status(404).json({
                    success: false,
                    msg: 'Headcount entry not found'
                });
            }

            // Instead of hard delete, consider soft delete for important data
            // For now, we'll do a hard delete
            await Headcount.findByIdAndDelete(req.params.id);

            res.json({
                success: true,
                data: {},
                msg: 'Headcount entry removed'
            });
        } catch (err) {
            console.error('Error deleting headcount:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not delete headcount entry'
            });
        }
    },

    /**
     * Update hiring status for a position
     * @route PATCH /api/horizon/headcount/:id/hiring-status
     * @access Private
     */
    updateHiringStatus: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const { hiringStage, numberOfCandidates, interviewsCompleted, notes } = req.body;

            const headcount = await Headcount.findById(req.params.id);

            if (!headcount) {
                return res.status(404).json({
                    success: false,
                    msg: 'Headcount entry not found'
                });
            }

            // Update hiring details
            headcount.hiringDetails = {
                ...headcount.hiringDetails,
                hiringStage: hiringStage || headcount.hiringDetails?.hiringStage,
                numberOfCandidates: numberOfCandidates ?? headcount.hiringDetails?.numberOfCandidates,
                interviewsCompleted: interviewsCompleted ?? headcount.hiringDetails?.interviewsCompleted
            };

            // Add note if provided
            if (notes) {
                headcount.notes = headcount.notes 
                    ? `${headcount.notes}\n\n${new Date().toISOString().split('T')[0]}: ${notes}`
                    : `${new Date().toISOString().split('T')[0]}: ${notes}`;
            }

            // Update updatedBy field
            headcount.updatedBy = req.horizonUser.id;

            await headcount.save();

            res.json({
                success: true,
                data: headcount
            });
        } catch (err) {
            console.error('Error updating hiring status:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not update hiring status'
            });
        }
    },

    /**
     * Convert an open requisition to an active employee
     * @route POST /api/horizon/headcount/:id/convert-to-employee
     * @access Private
     */
    convertToEmployee: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const { name, email, startDate, compensation } = req.body;

            if (!name || !startDate || !compensation) {
                return res.status(400).json({
                    success: false,
                    msg: 'Name, start date, and compensation are required'
                });
            }

            const headcount = await Headcount.findById(req.params.id);

            if (!headcount) {
                return res.status(404).json({
                    success: false,
                    msg: 'Headcount entry not found'
                });
            }

            if (!['Open Requisition', 'Offer Extended'].includes(headcount.status)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Only open requisitions or extended offers can be converted to employees'
                });
            }

            // Update entry to active employee
            headcount.name = name;
            headcount.email = email;
            headcount.status = 'Active';
            headcount.startDate = startDate;
            headcount.compensation = compensation;
            headcount.hiringDetails.hiringStage = 'Closed';
            headcount.updatedBy = req.horizonUser.id;

            await headcount.save();

            res.json({
                success: true,
                data: headcount,
                msg: 'Successfully converted to active employee'
            });
        } catch (err) {
            console.error('Error converting to employee:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not convert to employee'
            });
        }
    },

    /**
     * Link expenses to a headcount entry
     * @route POST /api/horizon/headcount/:id/link-expenses
     * @access Private
     */
    linkExpenses: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const { expenseIds } = req.body;

            if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    msg: 'Expense IDs array is required'
                });
            }

            const headcount = await Headcount.findById(req.params.id);

            if (!headcount) {
                return res.status(404).json({
                    success: false,
                    msg: 'Headcount entry not found'
                });
            }

            // Validate expense IDs
            for (const id of expenseIds) {
                if (!mongoose.Types.ObjectId.isValid(id)) {
                    return res.status(400).json({
                        success: false,
                        msg: `Invalid expense ID format: ${id}`
                    });
                }
            }

            // Add expense IDs to relatedExpenses array (avoiding duplicates)
            const currentExpenseIds = headcount.relatedExpenses.map(id => id.toString());
            const newExpenseIds = expenseIds.filter(id => !currentExpenseIds.includes(id));
            
            headcount.relatedExpenses = [...headcount.relatedExpenses, ...newExpenseIds];
            headcount.updatedBy = req.horizonUser.id;

            await headcount.save();

            res.json({
                success: true,
                data: headcount,
                msg: `Successfully linked ${newExpenseIds.length} expenses`
            });
        } catch (err) {
            console.error('Error linking expenses:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not link expenses'
            });
        }
    },

    /**
     * Get org chart data
     * @route GET /api/horizon/headcount/org-chart
     * @access Private
     */
    getOrgChart: async (req, res) => {
        try {
            // Get all active employees
            const employees = await Headcount.find({ status: 'Active' })
                .select('_id name title department reportingTo')
                .populate('reportingTo', '_id name title');

            // Build org chart structure
            const orgChart = buildOrgChartTree(employees);

            res.json({
                success: true,
                data: orgChart
            });
        } catch (err) {
            console.error('Error generating org chart:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not generate org chart'
            });
        }
    }
};

/**
 * Helper function to build org chart tree structure
 * @param {Array} employees - List of employee objects
 * @returns {Array} - Tree structure for org chart
 */
function buildOrgChartTree(employees) {
    // Create map of employees by ID for quick lookup
    const employeeMap = {};
    employees.forEach(emp => {
        employeeMap[emp._id.toString()] = {
            id: emp._id,
            name: emp.name,
            title: emp.title,
            department: emp.department,
            children: []
        };
    });

    // Build tree structure
    const rootNodes = [];

    employees.forEach(emp => {
        const empId = emp._id.toString();
        const node = employeeMap[empId];
        
        if (!emp.reportingTo) {
            // Root node (no manager)
            rootNodes.push(node);
        } else {
            // Add as child to manager
            const managerId = emp.reportingTo._id.toString();
            if (employeeMap[managerId]) {
                employeeMap[managerId].children.push(node);
            } else {
                // Manager not found, add as root
                rootNodes.push(node);
            }
        }
    });

    return rootNodes;
}

module.exports = headcountController;