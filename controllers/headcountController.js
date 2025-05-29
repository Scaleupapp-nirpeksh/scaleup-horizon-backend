// controllers/headcountController.js
const Headcount = require('../models/headcountModel'); // Phase 4 updated model
const Expense = require('../models/expenseModel');     // Phase 4 updated model
const Budget = require('../models/budgetModel');       // Phase 4 updated model
const mongoose = require('mongoose');

/**
 * Headcount Controller
 * Handles all operations related to employee and team management
 */
const headcountController = {
    /**
     * Create a new headcount entry (employee or open position) for the active organization
     * @route POST /api/horizon/headcount
     * @access Private
     */
    createHeadcount: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id; // Standardized from req.horizonUser.id

        try {
            const {
                name, email, title, department, employmentType, status,
                compensation, startDate, reportingTo, level, location,
                remoteStatus, budgetTracking, hiringDetails
            } = req.body;

            if (!name || !title || !department) {
                return res.status(400).json({
                    success: false,
                    msg: 'Name, title, and department are required'
                });
            }

            // --- MULTI-TENANCY: Add organizationId and createdBy ---
            const newHeadcount = new Headcount({
                organization: organizationId,
                name,
                email,
                title,
                department,
                employmentType: employmentType || 'Full-time',
                status: status || (name ? 'Active' : 'Open Requisition'), // Original logic preserved
                compensation,
                startDate,
                reportingTo, // This Headcount ID should also belong to the same organization
                level,
                location,
                remoteStatus,
                budgetTracking, // budgetTracking.budgetCategory (Budget ID) should also be org-scoped
                hiringDetails,
                createdBy: userId
            });

            const headcount = await newHeadcount.save();

            // If this is linked to a budget category, update budget tracking
            // This logic is preserved; ensure Budget.findById is also org-scoped if used for validation
            if (budgetTracking && budgetTracking.budgetCategory) {
                try {
                    // When fetching/validating the budget, ensure it belongs to the same organizationId
                    const budget = await Budget.findOne({ _id: budgetTracking.budgetCategory, organization: organizationId });
                    if (budget) {
                        console.log(`Headcount ${headcount._id} created, potentially linked to budget ${budget._id} for organization ${organizationId}`);
                        // Further logic to update budget actuals might occur elsewhere or via a service
                    } else {
                        console.warn(`Budget category ${budgetTracking.budgetCategory} not found for organization ${organizationId} when creating headcount ${headcount._id}`);
                    }
                } catch (budgetError) {
                    console.error(`Error linking headcount to budget for organization ${organizationId}:`, budgetError);
                }
            }

            res.status(201).json({
                success: true,
                data: headcount
            });
        } catch (err) {
            console.error(`Error creating headcount for organization ${organizationId}:`, err.message, err.stack);
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({ success: false, msg: messages.join(', ') });
            }
            if (err.code === 11000) { // Handle unique index violation (e.g., org + email)
                return res.status(400).json({ success: false, msg: 'A headcount entry with this email might already exist for your organization.' });
            }
            res.status(500).json({ success: false, msg: 'Server Error: Could not create headcount entry' });
        }
    },

    /**
     * Get all headcount entries for the active organization with optional filtering
     * @route GET /api/horizon/headcount
     * @access Private
     */
    getHeadcounts: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;
        try {
            const {
                department, status, employmentType, search,
                sortBy = 'name', sortDir = 'asc', page = 1, limit = 50
            } = req.query;

            // --- MULTI-TENANCY: Base filter includes organizationId ---
            const filter = { organization: organizationId };
            if (department) filter.department = department;
            if (status) filter.status = status;
            if (employmentType) filter.employmentType = employmentType;

            if (search) {
                filter.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { title: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ];
            }

            const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
            const sort = {};
            sort[sortBy] = sortDir === 'desc' ? -1 : 1;

            const headcounts = await Headcount.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('reportingTo', 'name title') // reportingTo is also a Headcount, so org-scoped by main filter
                .populate({ // budgetCategory is a Budget, ensure it's also org-scoped if populated directly
                    path: 'budgetTracking.budgetCategory',
                    match: { organization: organizationId }, // Only populate if budget matches org
                    select: 'name periodType'
                })
                .populate('createdBy', 'name email') // Populate creator
                .populate('updatedBy', 'name email'); // Populate updater

            const total = await Headcount.countDocuments(filter);

            res.json({
                success: true,
                count: headcounts.length,
                total,
                totalPages: Math.ceil(total / parseInt(limit, 10)),
                currentPage: parseInt(page, 10),
                data: headcounts
            });
        } catch (err) {
            console.error(`Error fetching headcount entries for organization ${organizationId}:`, err.message, err.stack);
            res.status(500).json({ success: false, msg: 'Server Error: Could not fetch headcount entries' });
        }
    },

    /**
     * Get headcount summary statistics for the active organization
     * @route GET /api/horizon/headcount/summary
     * @access Private
     */
    getHeadcountSummary: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;
        try {
            // --- MULTI-TENANCY: Pass organizationId to static methods ---
            const activeCount = await Headcount.getTotalHeadcount(organizationId, 'Active');
            const departmentBreakdown = await Headcount.getHeadcountByDepartment(organizationId, 'Active');

            const employmentTypeBreakdown = await Headcount.aggregate([
                { $match: { organization: organizationId, status: 'Active' } }, // Filter by organization
                { $group: { _id: '$employmentType', count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]);

            const openPositionsCount = await Headcount.countDocuments({
                organization: organizationId, // Filter by organization
                status: 'Open Requisition'
            });

            const totalCost = await Headcount.getTotalAnnualCost(organizationId, 'Active');

            const hiringPipeline = await Headcount.aggregate([
                { $match: { organization: organizationId, status: { $in: ['Open Requisition', 'Interviewing', 'Offer Extended'] } } }, // Filter by organization
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]);

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
            console.error(`Error fetching headcount summary for organization ${organizationId}:`, err.message, err.stack);
            res.status(500).json({ success: false, msg: 'Server Error: Could not fetch headcount summary' });
        }
    },

    /**
     * Get a single headcount entry by ID for the active organization
     * @route GET /api/horizon/headcount/:id
     * @access Private
     */
    getHeadcountById: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ success: false, msg: 'Invalid ID format' });
            }
            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const headcount = await Headcount.findOne({ _id: req.params.id, organization: organizationId })
                .populate('reportingTo', 'name title department') // reportingTo is org-scoped
                .populate({ // budgetCategory is a Budget, ensure it's also org-scoped
                    path: 'budgetTracking.budgetCategory',
                    match: { organization: organizationId },
                    select: 'name periodType'
                })
                .populate({ // relatedExpenses are Expenses, ensure they are also org-scoped
                    path: 'relatedExpenses',
                    match: { organization: organizationId }
                })
                .populate('createdBy', 'name email')
                .populate('updatedBy', 'name email');


            if (!headcount) {
                return res.status(404).json({ success: false, msg: 'Headcount entry not found within your organization.' });
            }
            res.json({ success: true, data: headcount });
        } catch (err) {
            console.error(`Error fetching headcount by ID for organization ${organizationId}:`, err.message, err.stack);
            res.status(500).json({ success: false, msg: 'Server Error: Could not fetch headcount entry' });
        }
    },

    /**
     * Update a headcount entry for the active organization
     * @route PUT /api/horizon/headcount/:id
     * @access Private
     */
    updateHeadcount: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id; // Standardized

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ success: false, msg: 'Invalid ID format' });
            }
            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const headcount = await Headcount.findOne({ _id: req.params.id, organization: organizationId });

            if (!headcount) {
                return res.status(404).json({ success: false, msg: 'Headcount entry not found within your organization.' });
            }

            // User's original logic for status-related fields preserved
            if (req.body.status === 'Active' && headcount.status !== 'Active') {
                if (!req.body.startDate && !headcount.startDate) {
                    req.body.startDate = new Date();
                }
            }
            if (req.body.status === 'Former' && headcount.status !== 'Former') {
                if (!req.body.endDate && !headcount.endDate) {
                    req.body.endDate = new Date();
                }
            }

            // --- MULTI-TENANCY: Add updatedBy ---
            req.body.updatedBy = userId; // Standardized

            // Use findOneAndUpdate to ensure atomicity and organization scoping in the update itself
            const updatedHeadcount = await Headcount.findOneAndUpdate(
                { _id: req.params.id, organization: organizationId }, // Query includes organizationId
                { $set: req.body },
                { new: true, runValidators: true }
            )
            .populate('reportingTo', 'name title')
            .populate({
                path: 'budgetTracking.budgetCategory',
                match: { organization: organizationId },
                select: 'name periodType'
            })
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email');


            res.json({ success: true, data: updatedHeadcount });
        } catch (err) {
            console.error(`Error updating headcount for organization ${organizationId}:`, err.message, err.stack);
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({ success: false, msg: messages.join(', ') });
            }
             if (err.code === 11000) {
                return res.status(400).json({ success: false, msg: 'A headcount entry with this email might already exist for your organization.' });
            }
            res.status(500).json({ success: false, msg: 'Server Error: Could not update headcount entry' });
        }
    },

    /**
     * Delete a headcount entry for the active organization
     * @route DELETE /api/horizon/headcount/:id
     * @access Private
     */
    deleteHeadcount: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ success: false, msg: 'Invalid ID format' });
            }
            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const headcount = await Headcount.findOneAndDelete({ _id: req.params.id, organization: organizationId });

            if (!headcount) {
                return res.status(404).json({ success: false, msg: 'Headcount entry not found within your organization or already deleted.' });
            }
            res.json({ success: true, data: {}, msg: 'Headcount entry removed' });
        } catch (err) {
            console.error(`Error deleting headcount for organization ${organizationId}:`, err.message, err.stack);
            res.status(500).json({ success: false, msg: 'Server Error: Could not delete headcount entry' });
        }
    },

    /**
     * Update hiring status for a position in the active organization
     * @route PATCH /api/horizon/headcount/:id/hiring-status
     * @access Private
     */
    updateHiringStatus: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id; // Standardized

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ success: false, msg: 'Invalid ID format' });
            }
            const { hiringStage, numberOfCandidates, interviewsCompleted, notes } = req.body;
            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const headcount = await Headcount.findOne({ _id: req.params.id, organization: organizationId });

            if (!headcount) {
                return res.status(404).json({ success: false, msg: 'Headcount entry not found within your organization.' });
            }

            // User's original logic for updating hiring details - Preserved
            headcount.hiringDetails = {
                ...headcount.hiringDetails, // Ensure existing details are spread if hiringDetails can be null/undefined initially
                hiringStage: hiringStage || headcount.hiringDetails?.hiringStage,
                numberOfCandidates: numberOfCandidates ?? headcount.hiringDetails?.numberOfCandidates,
                interviewsCompleted: interviewsCompleted ?? headcount.hiringDetails?.interviewsCompleted
            };
            if (notes) {
                headcount.notes = headcount.notes
                    ? `${headcount.notes}\n\n${new Date().toISOString().split('T')[0]}: ${notes}`
                    : `${new Date().toISOString().split('T')[0]}: ${notes}`;
            }
            // --- MULTI-TENANCY: Add updatedBy ---
            headcount.updatedBy = userId; // Standardized

            await headcount.save();
            res.json({ success: true, data: headcount });
        } catch (err) {
            console.error(`Error updating hiring status for organization ${organizationId}:`, err.message, err.stack);
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({ success: false, msg: messages.join(', ') });
            }
            res.status(500).json({ success: false, msg: 'Server Error: Could not update hiring status' });
        }
    },

    /**
     * Convert an open requisition to an active employee for the active organization
     * @route POST /api/horizon/headcount/:id/convert-to-employee
     * @access Private
     */
    convertToEmployee: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id; // Standardized

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ success: false, msg: 'Invalid ID format' });
            }
            const { name, email, startDate, compensation } = req.body;
            if (!name || !startDate || !compensation) {
                return res.status(400).json({ success: false, msg: 'Name, start date, and compensation are required' });
            }
            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const headcount = await Headcount.findOne({ _id: req.params.id, organization: organizationId });

            if (!headcount) {
                return res.status(404).json({ success: false, msg: 'Headcount entry not found within your organization.' });
            }
            if (!['Open Requisition', 'Offer Extended'].includes(headcount.status)) {
                return res.status(400).json({ success: false, msg: 'Only open requisitions or extended offers can be converted to employees' });
            }

            // User's original logic for updating fields - Preserved
            headcount.name = name;
            headcount.email = email; // Consider checking if this email is already in use for another active employee in the org
            headcount.status = 'Active';
            headcount.startDate = startDate;
            headcount.compensation = compensation;
            if (headcount.hiringDetails) { // Ensure hiringDetails exists
                headcount.hiringDetails.hiringStage = 'Closed';
            } else {
                headcount.hiringDetails = { hiringStage: 'Closed' };
            }
            // --- MULTI-TENANCY: Add updatedBy ---
            headcount.updatedBy = userId; // Standardized

            await headcount.save();
            res.json({ success: true, data: headcount, msg: 'Successfully converted to active employee' });
        } catch (err) {
            console.error(`Error converting to employee for organization ${organizationId}:`, err.message, err.stack);
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({ success: false, msg: messages.join(', ') });
            }
             if (err.code === 11000) {
                return res.status(400).json({ success: false, msg: 'This email might already be in use by another active employee in your organization.' });
            }
            res.status(500).json({ success: false, msg: 'Server Error: Could not convert to employee' });
        }
    },

    /**
     * Link expenses to a headcount entry for the active organization
     * @route POST /api/horizon/headcount/:id/link-expenses
     * @access Private
     */
    linkExpenses: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id; // Standardized

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ success: false, msg: 'Invalid Headcount ID format' });
            }
            const { expenseIds } = req.body;
            if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
                return res.status(400).json({ success: false, msg: 'Expense IDs array is required' });
            }

            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const headcount = await Headcount.findOne({ _id: req.params.id, organization: organizationId });
            if (!headcount) {
                return res.status(404).json({ success: false, msg: 'Headcount entry not found within your organization.' });
            }

            const validExpenseIds = [];
            for (const id of expenseIds) {
                if (!mongoose.Types.ObjectId.isValid(id)) {
                    return res.status(400).json({ success: false, msg: `Invalid expense ID format: ${id}` });
                }
                // --- MULTI-TENANCY: Validate that expenses also belong to the same organization ---
                const expense = await Expense.findOne({ _id: id, organization: organizationId });
                if (!expense) {
                    return res.status(400).json({ success: false, msg: `Expense with ID ${id} not found or does not belong to your organization.` });
                }
                validExpenseIds.push(expense._id);
            }

            // User's original logic for adding expense IDs - Preserved
            const currentExpenseIdsStrings = headcount.relatedExpenses.map(id => id.toString());
            const newUniqueExpenseIds = validExpenseIds.filter(id => !currentExpenseIdsStrings.includes(id.toString()));

            if (newUniqueExpenseIds.length > 0) {
                headcount.relatedExpenses.push(...newUniqueExpenseIds);
                // --- MULTI-TENANCY: Add updatedBy ---
                headcount.updatedBy = userId; // Standardized
                await headcount.save();
            }

            res.json({
                success: true,
                data: headcount,
                msg: `Successfully linked ${newUniqueExpenseIds.length} new expenses. Total linked: ${headcount.relatedExpenses.length}.`
            });
        } catch (err) {
            console.error(`Error linking expenses for organization ${organizationId}:`, err.message, err.stack);
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({ success: false, msg: messages.join(', ') });
            }
            res.status(500).json({ success: false, msg: 'Server Error: Could not link expenses' });
        }
    },

    /**
     * Get org chart data for the active organization
     * @route GET /api/horizon/headcount/org-chart
     * @access Private
     */
    getOrgChart: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;
        try {
            // --- MULTI-TENANCY: Filter by organizationId ---
            const employees = await Headcount.find({ organization: organizationId, status: 'Active' })
                .select('_id name title department reportingTo')
                .populate('reportingTo', '_id name title'); // reportingTo is also org-scoped

            // User's original buildOrgChartTree helper function - Preserved
            const orgChart = buildOrgChartTree(employees);

            res.json({ success: true, data: orgChart });
        } catch (err) {
            console.error(`Error generating org chart for organization ${organizationId}:`, err.message, err.stack);
            res.status(500).json({ success: false, msg: 'Server Error: Could not generate org chart' });
        }
    }
};

/**
 * User's original Helper function to build org chart tree structure - Preserved
 * @param {Array} employees - List of employee objects
 * @returns {Array} - Tree structure for org chart
 */
function buildOrgChartTree(employees) {
    const employeeMap = {};
    employees.forEach(emp => {
        employeeMap[emp._id.toString()] = {
            id: emp._id,
            name: emp.name,
            title: emp.title,
            department: emp.department,
            reportingTo: emp.reportingTo ? emp.reportingTo._id.toString() : null, // Store manager's ID
            children: []
        };
    });

    const rootNodes = [];
    Object.values(employeeMap).forEach(node => {
        if (!node.reportingTo || !employeeMap[node.reportingTo]) {
            rootNodes.push(node);
        } else {
            employeeMap[node.reportingTo].children.push(node);
        }
    });
    return rootNodes;
}

module.exports = headcountController;
