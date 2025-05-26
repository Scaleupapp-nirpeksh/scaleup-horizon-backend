// controllers/investorMeetingController.js
const InvestorMeeting = require('../models/investorMeetingModel');
const Investor = require('../models/investorModel');
const ProductMilestone = require('../models/productMilestoneModel');
const Headcount = require('../models/headcountModel');
const BankAccount = require('../models/bankAccountModel');
const Expense = require('../models/expenseModel');
const Revenue = require('../models/revenueModel');
const Round = require('../models/roundModel');
const CustomKPI = require('../models/customKpiModel');
const mongoose = require('mongoose');

/**
 * Investor Meeting Controller
 * Handles all operations related to investor meetings, preparation, and follow-ups
 */
const investorMeetingController = {
    /**
     * Create a new investor meeting
     * @route POST /api/horizon/investor-meetings
     * @access Private
     */
    createMeeting: async (req, res) => {
        try {
            const {
                title, meetingDate, duration, meetingType,
                investors, internalParticipants, location,
                meetingFormat, meetingLink, agenda
            } = req.body;

            // Validate required fields
            if (!title || !meetingDate) {
                return res.status(400).json({
                    success: false,
                    msg: 'Title and meeting date are required'
                });
            }

            // Process investors array
            const processedInvestors = [];
            if (investors && Array.isArray(investors)) {
                for (const inv of investors) {
                    // If only investorId is provided, fetch investor details
                    if (inv.investorId && mongoose.Types.ObjectId.isValid(inv.investorId)) {
                        try {
                            const investorRecord = await Investor.findById(inv.investorId);
                            if (investorRecord) {
                                processedInvestors.push({
                                    investorId: inv.investorId,
                                    name: investorRecord.name,
                                    company: investorRecord.entityName,
                                    email: investorRecord.email,
                                    attended: true
                                });
                                continue;
                            }
                        } catch (err) {
                            console.error('Error fetching investor:', err);
                        }
                    }
                    
                    // Add as provided if can't fetch or no ID provided
                    processedInvestors.push(inv);
                }
            }

            // Create new meeting
            const newMeeting = new InvestorMeeting({
                title,
                meetingDate,
                duration: duration || 60,
                meetingType: meetingType || 'Regular Update',
                investors: processedInvestors,
                internalParticipants: internalParticipants || [],
                location,
                meetingFormat: meetingFormat || 'Video',
                meetingLink,
                agenda,
                status: 'Scheduled',
                preparation: {
                    status: 'Not Started',
                    assignedTo: req.horizonUser.id
                },
                createdBy: req.horizonUser.id
            });

            // Save to database
            const meeting = await newMeeting.save();

            res.status(201).json({
                success: true,
                data: meeting
            });
        } catch (err) {
            console.error('Error creating investor meeting:', err.message);
            
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({
                    success: false,
                    msg: messages.join(', ')
                });
            }

            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not create investor meeting'
            });
        }
    },

    /**
     * Get all investor meetings with optional filtering
     * @route GET /api/horizon/investor-meetings
     * @access Private
     */
    getMeetings: async (req, res) => {
        try {
            const {
                status, meetingType, investorId, fromDate, toDate, search,
                sortBy = 'meetingDate', sortDir = 'desc', page = 1, limit = 20
            } = req.query;

            // Build filter object
            const filter = {};
            if (status) {
                if (status.includes(',')) {
                    filter.status = { $in: status.split(',') };
                } else {
                    filter.status = status;
                }
            }
            
            if (meetingType) filter.meetingType = meetingType;
            
            // Filter by investor ID
            if (investorId) {
                filter['investors.investorId'] = mongoose.Types.ObjectId(investorId);
            }
            
            // Filter by date range
            if (fromDate || toDate) {
                filter.meetingDate = {};
                if (fromDate) filter.meetingDate.$gte = new Date(fromDate);
                if (toDate) filter.meetingDate.$lte = new Date(toDate);
            }
            
            // Text search (if provided)
            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { agenda: { $regex: search, $options: 'i' } },
                    { 'investors.name': { $regex: search, $options: 'i' } }
                ];
            }

            // Calculate pagination
            const skip = (page - 1) * limit;
            
            // Set sort order
            const sort = {};
            sort[sortBy] = sortDir === 'desc' ? -1 : 1;

            // Execute query with pagination
            const meetings = await InvestorMeeting.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('preparation.assignedTo', 'name')
                .populate('investors.investorId', 'name entityName')
                .select('-metricSnapshots -talkingPoints -feedbackItems -actionItems');

            // Get total count for pagination
            const total = await InvestorMeeting.countDocuments(filter);

            res.json({
                success: true,
                count: meetings.length,
                total,
                totalPages: Math.ceil(total / limit),
                currentPage: parseInt(page),
                data: meetings
            });
        } catch (err) {
            console.error('Error fetching investor meetings:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not fetch investor meetings'
            });
        }
    },

    /**
     * Get a single investor meeting by ID
     * @route GET /api/horizon/investor-meetings/:id
     * @access Private
     */
    getMeetingById: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const meeting = await InvestorMeeting.findById(req.params.id)
                .populate('investors.investorId', 'name entityName contactPerson email')
                .populate('internalParticipants.userId', 'name email')
                .populate('preparation.assignedTo', 'name email')
                .populate('highlightedKpis.kpiId', 'name displayName value')
                .populate('highlightedMilestones.milestoneId', 'name status completionPercentage')
                .populate('relatedDocuments')
                .populate('previousMeetingId', 'title meetingDate')
                .populate('nextMeetingId', 'title meetingDate')
                .populate('relatedRoundId', 'name targetAmount');

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found'
                });
            }

            res.json({
                success: true,
                data: meeting
            });
        } catch (err) {
            console.error('Error fetching investor meeting by ID:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not fetch investor meeting'
            });
        }
    },

    /**
     * Update an investor meeting
     * @route PUT /api/horizon/investor-meetings/:id
     * @access Private
     */
    updateMeeting: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const meeting = await InvestorMeeting.findById(req.params.id);

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found'
                });
            }

            // Add updatedBy field
            req.body.updatedBy = req.horizonUser.id;

            const updatedMeeting = await InvestorMeeting.findByIdAndUpdate(
                req.params.id,
                { $set: req.body },
                { new: true, runValidators: true }
            );

            res.json({
                success: true,
                data: updatedMeeting
            });
        } catch (err) {
            console.error('Error updating investor meeting:', err.message);
            
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({
                    success: false,
                    msg: messages.join(', ')
                });
            }

            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not update investor meeting'
            });
        }
    },

    /**
     * Delete an investor meeting
     * @route DELETE /api/horizon/investor-meetings/:id
     * @access Private
     */
    deleteMeeting: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const meeting = await InvestorMeeting.findById(req.params.id);

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found'
                });
            }

            // Instead of hard delete, consider soft delete for important data
            // For now, we'll do a hard delete
            await InvestorMeeting.findByIdAndDelete(req.params.id);

            res.json({
                success: true,
                data: {},
                msg: 'Investor meeting removed'
            });
        } catch (err) {
            console.error('Error deleting investor meeting:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not delete investor meeting'
            });
        }
    },

    /**
     * Prepare meeting data (populate metrics, milestones, etc.)
     * @route POST /api/horizon/investor-meetings/:id/prepare
     * @access Private
     */
    prepareMeeting: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const meeting = await InvestorMeeting.findById(req.params.id);

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found'
                });
            }

            // Get previous meeting for comparison (if exists)
            let previousMeeting = null;
            if (meeting.previousMeetingId) {
                previousMeeting = await InvestorMeeting.findById(meeting.previousMeetingId);
            } else {
                // Find the most recent completed meeting before this one
                previousMeeting = await InvestorMeeting.findOne({
                    meetingDate: { $lt: meeting.meetingDate },
                    status: 'Completed'
                }).sort({ meetingDate: -1 });
                
                if (previousMeeting) {
                    meeting.previousMeetingId = previousMeeting._id;
                }
            }

            // --- Gather Financial Data ---
            // Get current financial data
            const bankAccounts = await BankAccount.find();
            const totalCash = bankAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);
            
            // Calculate burn rate (last 3 months average)
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            
            const recentExpenses = await Expense.aggregate([
                { $match: { date: { $gte: threeMonthsAgo } } },
                { $group: { 
                    _id: { 
                        year: { $year: "$date" }, 
                        month: { $month: "$date" } 
                    },
                    total: { $sum: "$amount" }
                }}
            ]);
            
            const monthlyBurn = recentExpenses.length > 0 
                ? recentExpenses.reduce((sum, e) => sum + e.total, 0) / recentExpenses.length 
                : 0;
            
            // Calculate runway
            const runway = monthlyBurn > 0 ? totalCash / monthlyBurn : 0;
            
            // Get revenue data
            const recentRevenue = await Revenue.aggregate([
                { $match: { date: { $gte: threeMonthsAgo } } },
                { $group: { 
                    _id: { 
                        year: { $year: "$date" }, 
                        month: { $month: "$date" } 
                    },
                    total: { $sum: "$amount" }
                }}
            ]);
            
            const monthlyRevenue = recentRevenue.length > 0 
                ? recentRevenue.reduce((sum, r) => sum + r.total, 0) / recentRevenue.length 
                : 0;
            
            // Get total funds raised
            const rounds = await Round.find();
            const totalFundsRaised = rounds.reduce((sum, r) => sum + r.totalFundsReceived, 0);
            
            // Update financial snapshot
            meeting.financialSnapshot = {
                cashBalance: totalCash,
                monthlyBurn: monthlyBurn,
                runway: Math.round(runway * 10) / 10, // Round to 1 decimal place
                mrr: monthlyRevenue,
                arr: monthlyRevenue * 12,
                totalFundsRaised
            };

            // --- Gather Team Data ---
            // Get current headcount data
            const activeEmployees = await Headcount.find({ status: 'Active' });
            const openPositions = await Headcount.countDocuments({ 
                status: { $in: ['Open Requisition', 'Interviewing', 'Offer Extended'] } 
            });
            
            // Get new hires since last meeting
            const newHires = await Headcount.find({
                status: 'Active',
                startDate: { $gte: previousMeeting ? previousMeeting.meetingDate : threeMonthsAgo }
            }).select('name title department startDate');
            
            // Get departures since last meeting
            const departures = await Headcount.find({
                status: 'Former',
                endDate: { $gte: previousMeeting ? previousMeeting.meetingDate : threeMonthsAgo }
            }).select('name title department endDate');
            
            // Update team updates
            meeting.teamUpdates = {
                currentHeadcount: activeEmployees.length,
                newHires: newHires.map(hire => ({
                    headcountId: hire._id,
                    name: hire.name,
                    role: hire.title,
                    department: hire.department
                })),
                openPositions,
                keyDepartures: departures.map(departure => ({
                    name: departure.name,
                    role: departure.title,
                    impactOnBusiness: `${departure.title} left on ${departure.endDate.toISOString().split('T')[0]}`
                }))
            };

            // --- Gather Product Milestones ---
            // Get highlighted milestones (completed recently and upcoming)
            const recentlyCompletedMilestones = await ProductMilestone.find({
                status: 'Completed',
                actualEndDate: { $gte: previousMeeting ? previousMeeting.meetingDate : threeMonthsAgo },
                visibleToInvestors: true
            }).select('name status completionPercentage actualEndDate');
            
            const upcomingMilestones = await ProductMilestone.find({
                status: { $nin: ['Completed', 'Cancelled'] },
                plannedEndDate: { $gte: new Date() },
                visibleToInvestors: true
            }).sort({ plannedEndDate: 1 }).limit(5)
            .select('name status completionPercentage plannedEndDate');
            
            // Update highlighted milestones
            meeting.highlightedMilestones = [
                ...recentlyCompletedMilestones.map(m => ({
                    milestoneId: m._id,
                    milestoneName: m.name,
                    status: m.status,
                    completionPercentage: m.completionPercentage
                })),
                ...upcomingMilestones.map(m => ({
                    milestoneId: m._id,
                    milestoneName: m.name,
                    status: m.status,
                    completionPercentage: m.completionPercentage
                }))
            ];

            // --- Gather KPIs ---
            // Get KPIs to highlight
            const keyKpis = await CustomKPI.find({ 
                isActive: true, 
                isPinned: true 
            }).limit(10);
            
            // Update highlighted KPIs
            meeting.highlightedKpis = keyKpis.map(kpi => ({
                kpiId: kpi._id,
                kpiName: kpi.displayName || kpi.name
            }));

            // --- Create Metric Snapshots ---
            // Financial metrics
            const financialMetrics = [
                {
                    category: 'Financial',
                    name: 'Cash Balance',
                    value: totalCash,
                    previousValue: previousMeeting?.financialSnapshot?.cashBalance,
                    format: 'currency',
                    highlight: true,
                    order: 1
                },
                {
                    category: 'Financial',
                    name: 'Monthly Burn',
                    value: monthlyBurn,
                    previousValue: previousMeeting?.financialSnapshot?.monthlyBurn,
                    format: 'currency',
                    highlight: true,
                    order: 2
                },
                {
                    category: 'Financial',
                    name: 'Runway',
                    value: runway,
                    previousValue: previousMeeting?.financialSnapshot?.runway,
                    format: 'number',
                    contextNote: 'Months remaining at current burn rate',
                    highlight: true,
                    order: 3
                },
                {
                    category: 'Financial',
                    name: 'Monthly Recurring Revenue',
                    value: monthlyRevenue,
                    previousValue: previousMeeting?.financialSnapshot?.mrr,
                    format: 'currency',
                    highlight: monthlyRevenue > 0,
                    order: 4
                }
            ];
            
            // Team metrics
            const teamMetrics = [
                {
                    category: 'Team',
                    name: 'Headcount',
                    value: activeEmployees.length,
                    previousValue: previousMeeting?.teamUpdates?.currentHeadcount,
                    format: 'number',
                    highlight: true,
                    order: 1
                },
                {
                    category: 'Team',
                    name: 'Open Positions',
                    value: openPositions,
                    previousValue: null,
                    format: 'number',
                    highlight: openPositions > 0,
                    order: 2
                },
                {
                    category: 'Team',
                    name: 'New Hires',
                    value: newHires.length,
                    previousValue: null,
                    format: 'number',
                    contextNote: 'Since last meeting',
                    highlight: newHires.length > 0,
                    order: 3
                }
            ];
            
            // Product metrics
            const productMetrics = [
                {
                    category: 'Product',
                    name: 'Completed Milestones',
                    value: recentlyCompletedMilestones.length,
                    previousValue: null,
                    format: 'number',
                    contextNote: 'Since last meeting',
                    highlight: recentlyCompletedMilestones.length > 0,
                    order: 1
                },
                {
                    category: 'Product',
                    name: 'Upcoming Milestones',
                    value: upcomingMilestones.length,
                    previousValue: null,
                    format: 'number',
                    highlight: true,
                    order: 2
                }
            ];
            
            // Calculate trend for each metric
            const calculateTrend = (current, previous) => {
                if (previous === null || previous === undefined || current === previous) {
                    return 'flat';
                }
                return current > previous ? 'up' : 'down';
            };
            
            const calculateChangePercentage = (current, previous) => {
                if (previous === null || previous === undefined || previous === 0) {
                    return null;
                }
                return ((current - previous) / previous) * 100;
            };
            
            // Process all metrics
            const allMetrics = [...financialMetrics, ...teamMetrics, ...productMetrics];
            allMetrics.forEach(metric => {
                metric.trend = calculateTrend(metric.value, metric.previousValue);
                metric.changePercentage = calculateChangePercentage(metric.value, metric.previousValue);
            });
            
            // Update meeting metrics
            meeting.metricSnapshots = allMetrics;

            // --- Create Talking Points ---
            // Generate automatic talking points based on data
            const talkingPoints = [];
            
            // Financial talking points
            if (runway < 6) {
                talkingPoints.push({
                    title: 'Runway Update',
                    category: 'Challenge',
                    content: `Current runway is ${runway.toFixed(1)} months. We are implementing cost-saving measures and accelerating revenue growth to extend runway.`,
                    priority: 1,
                    relatedMetrics: ['Cash Balance', 'Monthly Burn', 'Runway']
                });
            } else if (runway > 12) {
                talkingPoints.push({
                    title: 'Strong Cash Position',
                    category: 'Win',
                    content: `We have a healthy runway of ${runway.toFixed(1)} months, allowing us to focus on long-term growth initiatives.`,
                    priority: 3,
                    relatedMetrics: ['Cash Balance', 'Runway']
                });
            }
            
            if (monthlyRevenue > 0 && (previousMeeting?.financialSnapshot?.mrr || 0) < monthlyRevenue) {
                talkingPoints.push({
                    title: 'Revenue Growth',
                    category: 'Win',
                    content: `We've seen strong revenue growth, with MRR now at ${formatCurrency(monthlyRevenue)}.`,
                    priority: 2,
                    relatedMetrics: ['Monthly Recurring Revenue']
                });
            }
            
            // Team talking points
            if (newHires.length > 0) {
                talkingPoints.push({
                    title: 'Team Growth',
                    category: 'Update',
                    content: `We've added ${newHires.length} new team members since our last meeting, strengthening our ${newHires.map(h => h.department).filter((v, i, a) => a.indexOf(v) === i).join(', ')} departments.`,
                    priority: 3,
                    relatedMetrics: ['Headcount', 'New Hires']
                });
            }
            
            // Product talking points
            if (recentlyCompletedMilestones.length > 0) {
                talkingPoints.push({
                    title: 'Product Milestones Achieved',
                    category: 'Win',
                    content: `We've completed ${recentlyCompletedMilestones.length} key milestones: ${recentlyCompletedMilestones.map(m => m.name).join(', ')}.`,
                    priority: 2,
                    relatedMetrics: ['Completed Milestones']
                });
            }
            
            if (upcomingMilestones.length > 0) {
                talkingPoints.push({
                    title: 'Upcoming Product Milestones',
                    category: 'Update',
                    content: `Our focus for the coming period is on: ${upcomingMilestones.map(m => m.name).join(', ')}.`,
                    priority: 2,
                    relatedMetrics: ['Upcoming Milestones']
                });
            }
            
            // Add talking points to meeting
            meeting.talkingPoints = talkingPoints;

            // Update preparation status
            meeting.preparation = {
                ...meeting.preparation,
                status: 'Ready',
                dataCollectionComplete: true,
                preparationNotes: 'Auto-prepared with current metrics and key talking points.',
                assignedTo: req.horizonUser.id
            };
            
            // Update meeting status if needed
            if (meeting.status === 'Scheduled') {
                meeting.status = 'Preparation';
            }
            
            meeting.updatedBy = req.horizonUser.id;

            // Save the meeting with all prepared data
            await meeting.save();

            res.json({
                success: true,
                data: meeting,
                msg: 'Meeting preparation completed successfully'
            });
        } catch (err) {
            console.error('Error preparing meeting:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not prepare meeting'
            });
        }
    },

    /**
     * Add a talking point to a meeting
     * @route POST /api/horizon/investor-meetings/:id/talking-points
     * @access Private
     */
    addTalkingPoint: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const { title, category, content, priority, relatedMetrics } = req.body;

            if (!title || !content) {
                return res.status(400).json({
                    success: false,
                    msg: 'Title and content are required'
                });
            }

            const meeting = await InvestorMeeting.findById(req.params.id);

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found'
                });
            }

            // Create new talking point
            const newTalkingPoint = {
                title,
                category: category || 'Update',
                content,
                priority: priority || 3,
                relatedMetrics: relatedMetrics || [],
                wasDiscussed: false
            };

            // Add talking point to meeting
            meeting.talkingPoints.push(newTalkingPoint);
            meeting.updatedBy = req.horizonUser.id;

            await meeting.save();

            res.status(201).json({
                success: true,
                data: meeting.talkingPoints[meeting.talkingPoints.length - 1],
                msg: 'Talking point added successfully'
            });
        } catch (err) {
            console.error('Error adding talking point:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not add talking point'
            });
        }
    },

    /**
     * Update meeting notes and summary
     * @route PATCH /api/horizon/investor-meetings/:id/notes
     * @access Private
     */
    updateMeetingNotes: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const { notes, summary } = req.body;

            const meeting = await InvestorMeeting.findById(req.params.id);

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found'
                });
            }

            // Update notes and summary
            if (notes !== undefined) meeting.notes = notes;
            if (summary !== undefined) meeting.summary = summary;
            
            meeting.updatedBy = req.horizonUser.id;

            await meeting.save();

            res.json({
                success: true,
                data: {
                    notes: meeting.notes,
                    summary: meeting.summary
                },
                msg: 'Meeting notes updated successfully'
            });
        } catch (err) {
            console.error('Error updating meeting notes:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not update meeting notes'
            });
        }
    },

    /**
     * Add investor feedback
     * @route POST /api/horizon/investor-meetings/:id/feedback
     * @access Private
     */
    addFeedback: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const { topic, feedback, feedbackType, priority, requiringAction } = req.body;

            if (!topic || !feedback) {
                return res.status(400).json({
                    success: false,
                    msg: 'Topic and feedback are required'
                });
            }

            const meeting = await InvestorMeeting.findById(req.params.id);

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found'
                });
            }

            // Create new feedback item
            const newFeedback = {
                topic,
                feedback,
                feedbackType: feedbackType || 'Suggestion',
                priority: priority || 'Medium',
                requiringAction: requiringAction || false
            };

            // Add feedback to meeting
            meeting.feedbackItems.push(newFeedback);
            meeting.updatedBy = req.horizonUser.id;

            // Update status to Completed if not already
            if (meeting.status === 'Scheduled' || meeting.status === 'Preparation') {
                meeting.status = 'Completed';
            }

            await meeting.save();

            res.status(201).json({
                success: true,
                data: meeting.feedbackItems[meeting.feedbackItems.length - 1],
                msg: 'Feedback added successfully'
            });
        } catch (err) {
            console.error('Error adding feedback:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not add feedback'
            });
        }
    },

    /**
     * Add action item
     * @route POST /api/horizon/investor-meetings/:id/action-items
     * @access Private
     */
    addActionItem: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const { action, assignee, dueDate, notes } = req.body;

            if (!action) {
                return res.status(400).json({
                    success: false,
                    msg: 'Action description is required'
                });
            }

            const meeting = await InvestorMeeting.findById(req.params.id);

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found'
                });
            }

            // Create new action item
            const newActionItem = {
                action,
                assignee: assignee || req.horizonUser.id,
                dueDate,
                status: 'Not Started',
                notes
            };

            // Add action item to meeting
            meeting.actionItems.push(newActionItem);
            meeting.updatedBy = req.horizonUser.id;

            await meeting.save();

            res.status(201).json({
                success: true,
                data: meeting.actionItems[meeting.actionItems.length - 1],
                msg: 'Action item added successfully'
            });
        } catch (err) {
            console.error('Error adding action item:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not add action item'
            });
        }
    },

    /**
     * Update action item status
     * @route PATCH /api/horizon/investor-meetings/:id/action-items/:actionId
     * @access Private
     */
    updateActionItem: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id) || 
                !mongoose.Types.ObjectId.isValid(req.params.actionId)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const { status, notes } = req.body;

            const meeting = await InvestorMeeting.findById(req.params.id);

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found'
                });
            }

            // Find action item
            const actionIndex = meeting.actionItems.findIndex(
                item => item._id.toString() === req.params.actionId
            );

            if (actionIndex === -1) {
                return res.status(404).json({
                    success: false,
                    msg: 'Action item not found'
                });
            }

            // Update action item
            if (status !== undefined) {
                meeting.actionItems[actionIndex].status = status;
                
                // Set completedDate if status is Completed
                if (status === 'Completed') {
                    meeting.actionItems[actionIndex].completedDate = new Date();
                } else {
                    meeting.actionItems[actionIndex].completedDate = undefined;
                }
            }
            
            if (notes !== undefined) {
                meeting.actionItems[actionIndex].notes = notes;
            }
            
            meeting.updatedBy = req.horizonUser.id;

            await meeting.save();

            res.json({
                success: true,
                data: meeting.actionItems[actionIndex],
                msg: 'Action item updated successfully'
            });
        } catch (err) {
            console.error('Error updating action item:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not update action item'
            });
        }
    },

    /**
     * Complete a meeting and add effectiveness rating
     * @route POST /api/horizon/investor-meetings/:id/complete
     * @access Private
     */
    completeMeeting: async (req, res) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const { meetingEffectiveness, sentimentScore, nextSteps } = req.body;

            const meeting = await InvestorMeeting.findById(req.params.id);

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found'
                });
            }

            // Update meeting completion data
            meeting.status = 'Completed';
            meeting.meetingEffectiveness = meetingEffectiveness;
            meeting.sentimentScore = sentimentScore;
            meeting.nextSteps = nextSteps;
            meeting.updatedBy = req.horizonUser.id;

            await meeting.save();

            // Schedule next meeting if requested
            if (req.body.scheduleNextMeeting) {
                try {
                    // Calculate next meeting date (default: 30 days from this meeting)
                    const nextMeetingDate = new Date(meeting.meetingDate);
                    nextMeetingDate.setDate(nextMeetingDate.getDate() + 30);
                    
                    // Create next meeting
                    const nextMeeting = new InvestorMeeting({
                        title: `Follow-up: ${meeting.title}`,
                        meetingDate: nextMeetingDate,
                        duration: meeting.duration,
                        meetingType: meeting.meetingType,
                        investors: meeting.investors,
                        internalParticipants: meeting.internalParticipants,
                        meetingFormat: meeting.meetingFormat,
                        status: 'Scheduled',
                        previousMeetingId: meeting._id,
                        relatedRoundId: meeting.relatedRoundId,
                        createdBy: req.horizonUser.id
                    });
                    
                    await nextMeeting.save();
                    
                    // Update current meeting with link to next
                    meeting.nextMeetingId = nextMeeting._id;
                    await meeting.save();
                    
                    return res.json({
                        success: true,
                        data: {
                            completedMeeting: meeting,
                            nextMeeting
                        },
                        msg: 'Meeting completed successfully and next meeting scheduled'
                    });
                } catch (nextErr) {
                    console.error('Error scheduling next meeting:', nextErr);
                    // Continue with completion even if next meeting fails
                }
            }

            res.json({
                success: true,
                data: meeting,
                msg: 'Meeting completed successfully'
            });
        } catch (err) {
            console.error('Error completing meeting:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not complete meeting'
            });
        }
    },

    /**
     * Get meeting statistics
     * @route GET /api/horizon/investor-meetings/statistics
     * @access Private
     */
    getMeetingStatistics: async (req, res) => {
        try {
            const { fromDate, toDate } = req.query;
            
            // Get statistics with optional date range
            const stats = await InvestorMeeting.getMeetingStatistics(fromDate, toDate);
            
            // Get upcoming meetings
            const upcomingMeetings = await InvestorMeeting.getUpcomingMeetings(5);
            
            // Get action items statistics
            const pendingActionItems = await InvestorMeeting.aggregate([
                { $match: { 'actionItems.status': { $ne: 'Completed' } } },
                { $unwind: '$actionItems' },
                { $match: { 'actionItems.status': { $ne: 'Completed' } } },
                { $group: { 
                    _id: '$actionItems.status', 
                    count: { $sum: 1 } 
                }},
                { $sort: { _id: 1 } }
            ]);
            
            // Get investor feedback statistics
            const feedbackByType = await InvestorMeeting.aggregate([
                { $unwind: '$feedbackItems' },
                { $group: { 
                    _id: '$feedbackItems.feedbackType', 
                    count: { $sum: 1 } 
                }},
                { $sort: { _id: 1 } }
            ]);
            
            res.json({
                success: true,
                data: {
                    meetingStats: stats,
                    upcomingMeetings,
                    pendingActionItems,
                    feedbackByType
                }
            });
        } catch (err) {
            console.error('Error fetching meeting statistics:', err.message);
            res.status(500).json({
                success: false,
                msg: 'Server Error: Could not fetch meeting statistics'
            });
        }
    }
};

/**
 * Helper function to format currency values
 * @param {Number} value - The value to format
 * @returns {String} - Formatted currency string
 */
function formatCurrency(value) {
    if (value >= 100000) {
        return `₹${(value / 100000).toFixed(2)}L`;
    } else if (value >= 1000) {
        return `₹${(value / 1000).toFixed(2)}K`;
    } else {
        return `₹${value.toFixed(2)}`;
    }
}

module.exports = investorMeetingController;