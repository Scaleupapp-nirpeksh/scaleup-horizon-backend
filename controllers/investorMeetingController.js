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
const Document = require('../models/documentModel');
const RunwayScenario = require('../models/runwayScenarioModel');
const FundraisingPrediction = require('../models/fundraisingPredictionModel');
const Budget = require('../models/budgetModel');
const ManualKpiSnapshot = require('../models/manualKpiSnapshotModel');

const mongoose = require('mongoose');

/**
 * Helper function to format currency values
 */
function formatCurrency(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'N/A';
    if (Math.abs(value) >= 10000000) { // Crores
        return `₹${(value / 10000000).toFixed(2)}Cr`;
    } else if (Math.abs(value) >= 100000) { // Lakhs
        return `₹${(value / 100000).toFixed(2)}L`;
    }
    return `₹${value.toFixed(2)}`;
}

const investorMeetingController = {
    /**
     * Create a new investor meeting
     * @desc    Create investor meeting for the active organization
     * @route   POST /api/horizon/investor-meetings
     * @access  Private (Requires authenticated user with organization context)
     */
    createMeeting: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            const {
                title, meetingDate, duration, meetingType,
                investors, internalParticipants, location,
                meetingFormat, meetingLink, agenda,
                meetingSections
            } = req.body;

            if (!title || !meetingDate) {
                return res.status(400).json({
                    success: false,
                    msg: 'Title and meeting date are required'
                });
            }

            // --- MULTI-TENANCY: Process investors ensuring they belong to the organization ---
            const processedInvestors = [];
            if (investors && Array.isArray(investors)) {
                for (const inv of investors) {
                    if (inv.investorId && mongoose.Types.ObjectId.isValid(inv.investorId)) {
                        try {
                            // Verify investor belongs to this organization
                            const investorRecord = await Investor.findOne({ 
                                _id: inv.investorId,
                                organization: organizationId 
                            });
                            if (investorRecord) {
                                processedInvestors.push({
                                    investorId: inv.investorId,
                                    name: investorRecord.name,
                                    company: investorRecord.entityName,
                                    email: investorRecord.email,
                                    attended: inv.attended !== undefined ? inv.attended : true
                                });
                                continue;
                            }
                        } catch (err) {
                            console.error('Error fetching investor:', err);
                        }
                    }
                    processedInvestors.push(inv);
                }
            }

            const newMeeting = new InvestorMeeting({
                organization: organizationId,  // Scope to organization
                //user: userId,                  // Track creator
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
                    assignedTo: userId
                },
                meetingSections: meetingSections || { // Default all sections to true
                    financialSnapshot: true,
                    teamUpdates: true,
                    productMilestones: true,
                    kpis: true,
                    userMetrics: true,
                    runwayScenario: true,
                    fundraisingPrediction: true,
                    budgetSummary: true,
                    talkingPoints: true,
                    suggestedDocuments: true
                },
                createdBy: userId              // Maintain for backward compatibility
            });

            const meeting = await newMeeting.save();
            res.status(201).json({ success: true, data: meeting });
        } catch (err) {
            console.error('Error creating investor meeting:', err.message);
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({ success: false, msg: messages.join(', ') });
            }
            res.status(500).json({ success: false, msg: 'Server Error: Could not create investor meeting' });
        }
    },

    /**
     * Get all investor meetings with optional filtering
     * @desc    Get investor meetings for the active organization
     * @route   GET /api/horizon/investor-meetings
     * @access  Private
     */
    getMeetings: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            const {
                status, meetingType, investorId, fromDate, toDate, search,
                sortBy = 'meetingDate', sortDir = 'desc', page = 1, limit = 20
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
            if (meetingType) filter.meetingType = meetingType;
            
            if (investorId) {
                if (!mongoose.Types.ObjectId.isValid(investorId)) {
                    return res.status(400).json({ success: false, msg: 'Invalid investorId format' });
                }
                filter['investors.investorId'] = new mongoose.Types.ObjectId(investorId);
            }
            
            if (fromDate || toDate) {
                filter.meetingDate = {};
                if (fromDate) filter.meetingDate.$gte = new Date(fromDate);
                if (toDate) filter.meetingDate.$lte = new Date(toDate);
            }
            
            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { agenda: { $regex: search, $options: 'i' } },
                    { 'investors.name': { $regex: search, $options: 'i' } }
                ];
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const sort = {};
            sort[sortBy] = sortDir === 'desc' ? -1 : 1;

            const meetings = await InvestorMeeting.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('preparation.assignedTo', 'name')
                .populate('investors.investorId', 'name entityName')
                .populate('createdBy', 'name email')  // Show who created it
                .select('-metricSnapshots -talkingPoints -feedbackItems -actionItems -financialSnapshot -teamUpdates -highlightedMilestones -highlightedKpis -linkedRunwayScenario -linkedFundraisingPrediction -budgetSummary -suggestedDocuments -userMetricsSnapshot');

            const total = await InvestorMeeting.countDocuments(filter);

            res.json({
                success: true,
                count: meetings.length,
                total,
                totalPages: Math.ceil(total / parseInt(limit)),
                currentPage: parseInt(page),
                data: meetings
            });
        } catch (err) {
            console.error('Error fetching investor meetings:', err.message);
            res.status(500).json({ success: false, msg: 'Server Error: Could not fetch investor meetings' });
        }
    },

    /**
     * Get a single investor meeting by ID
     * @desc    Get specific investor meeting for the active organization
     * @route   GET /api/horizon/investor-meetings/:id
     * @access  Private
     */
    getMeetingById: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ success: false, msg: 'Invalid ID format' });
            }
            
            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const meeting = await InvestorMeeting.findOne({ 
                _id: req.params.id, 
                organization: organizationId 
            })
            .populate('investors.investorId', 'name entityName contactPerson email')
            .populate('internalParticipants.userId', 'name email')
            .populate('preparation.assignedTo', 'name email')
            .populate('highlightedKpis.kpiId', 'name displayName cache.currentValue cache.trend displayFormat')
            .populate('highlightedMilestones.milestoneId', 'name status completionPercentage investorSummary plannedEndDate')
            .populate('relatedDocuments', 'fileName category storageUrl')
            .populate('suggestedDocuments.documentId', 'fileName category storageUrl')
            .populate('previousMeetingId', 'title meetingDate')
            .populate('nextMeetingId', 'title meetingDate')
            .populate('relatedRoundId', 'name targetAmount')
            .populate('linkedRunwayScenario.scenarioId', 'name totalRunwayMonths dateOfCashOut')
            .populate('linkedFundraisingPrediction.predictionId', 'predictionName targetRoundSize predictedCloseDate overallProbability')
            .populate('createdBy', 'name email');  // Show who created it

            if (!meeting) {
                return res.status(404).json({ success: false, msg: 'Investor meeting not found within your organization' });
            }
            res.json({ success: true, data: meeting });
        } catch (err) {
            console.error('Error fetching investor meeting by ID:', err.message);
            res.status(500).json({ success: false, msg: 'Server Error: Could not fetch investor meeting' });
        }
    },

    /**
     * Update a investor meeting
     * @desc    Update investor meeting for the active organization
     * @route   PUT /api/horizon/investor-meetings/:id
     * @access  Private
     */
    updateMeeting: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ success: false, msg: 'Invalid ID format' });
            }
            
            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const meeting = await InvestorMeeting.findOne({ 
                _id: req.params.id, 
                organization: organizationId 
            });

            if (!meeting) {
                return res.status(404).json({ success: false, msg: 'Investor meeting not found within your organization' });
            }

            req.body.updatedBy = userId;
            req.body.updatedAt = Date.now();

            if (req.body.meetingSections) {
                req.body.meetingSections = { ...meeting.meetingSections.toObject(), ...req.body.meetingSections };
            }

            // --- MULTI-TENANCY: Ensure organization match in update ---
            const updatedMeeting = await InvestorMeeting.findOneAndUpdate(
                { _id: req.params.id, organization: organizationId },
                { $set: req.body },
                { new: true, runValidators: true }
            );
            res.json({ success: true, data: updatedMeeting });
        } catch (err) {
            console.error('Error updating investor meeting:', err.message);
            if (err.name === 'ValidationError') {
                const messages = Object.values(err.errors).map(val => val.message);
                return res.status(400).json({ success: false, msg: messages.join(', ') });
            }
            res.status(500).json({ success: false, msg: 'Server Error: Could not update investor meeting' });
        }
    },

    /**
     * Delete an investor meeting
     * @desc    Delete investor meeting for the active organization
     * @route   DELETE /api/horizon/investor-meetings/:id
     * @access  Private
     */
    deleteMeeting: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ success: false, msg: 'Invalid ID format' });
            }
            
            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const meeting = await InvestorMeeting.findOne({ 
                _id: req.params.id, 
                organization: organizationId 
            });
            
            if (!meeting) {
                return res.status(404).json({ success: false, msg: 'Investor meeting not found within your organization' });
            }
            
            await InvestorMeeting.findOneAndDelete({ 
                _id: req.params.id, 
                organization: organizationId 
            });
            
            res.json({ success: true, data: {}, msg: 'Investor meeting removed' });
        } catch (err) {
            console.error('Error deleting investor meeting:', err.message);
            res.status(500).json({ success: false, msg: 'Server Error: Could not delete investor meeting' });
        }
    },

    /**
     * Prepare meeting data (populate metrics, milestones, etc.)
     * @desc    Prepare investor meeting with organization data
     * @route   POST /api/horizon/investor-meetings/:id/prepare
     * @access  Private
     */
    prepareMeeting: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ success: false, msg: 'Invalid ID format' });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const meeting = await InvestorMeeting.findOne({ 
                _id: req.params.id, 
                organization: organizationId 
            });

            if (!meeting) {
                return res.status(404).json({ success: false, msg: 'Investor meeting not found within your organization' });
            }

            // User can specify which sections to include in the prep
            const sectionsToInclude = {
                ...(meeting.meetingSections ? meeting.meetingSections.toObject() : { // Default all to true if not set
                    financialSnapshot: true, teamUpdates: true, productMilestones: true, kpis: true,
                    userMetrics: true, runwayScenario: true, fundraisingPrediction: true,
                    budgetSummary: true, talkingPoints: true, suggestedDocuments: true
                }),
                ...(req.body.sectionsToInclude || {}) // Override with request body
            };
            meeting.meetingSections = sectionsToInclude; // Store the final selection

            let previousMeeting = null;
            if (meeting.previousMeetingId) {
                previousMeeting = await InvestorMeeting.findOne({
                    _id: meeting.previousMeetingId,
                    organization: organizationId
                });
            } else {
                previousMeeting = await InvestorMeeting.findOne({
                    organization: organizationId,
                    meetingDate: { $lt: meeting.meetingDate },
                    status: 'Completed'
                }).sort({ meetingDate: -1 });
                if (previousMeeting) meeting.previousMeetingId = previousMeeting._id;
            }

            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            // --- MULTI-TENANCY: All data queries filtered by organizationId ---
            
            // --- Financial Snapshot ---
            if (sectionsToInclude.financialSnapshot) {
                const bankAccounts = await BankAccount.find({ organization: organizationId });
                const totalCash = bankAccounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);

                const recentExpenses = await Expense.aggregate([
                    { $match: { organization: organizationId, date: { $gte: threeMonthsAgo } } },
                    { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } }, total: { $sum: "$amount" } } }
                ]);
                const monthlyBurn = recentExpenses.length > 0 ? recentExpenses.reduce((sum, e) => sum + e.total, 0) / recentExpenses.length : 0;
                const runway = monthlyBurn > 0 ? totalCash / monthlyBurn : Infinity;

                const recentRevenue = await Revenue.aggregate([
                    { $match: { organization: organizationId, date: { $gte: threeMonthsAgo } } },
                    { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } }, total: { $sum: "$amount" } } }
                ]);
                const monthlyRevenue = recentRevenue.length > 0 ? recentRevenue.reduce((sum, r) => sum + r.total, 0) / recentRevenue.length : 0;

                const rounds = await Round.find({ organization: organizationId });
                const totalFundsRaised = rounds.reduce((sum, r) => sum + (r.totalFundsReceived || 0), 0);

                meeting.financialSnapshot = {
                    cashBalance: totalCash,
                    monthlyBurn: monthlyBurn,
                    runway: isFinite(runway) ? Math.round(runway * 10) / 10 : null,
                    mrr: monthlyRevenue,
                    arr: monthlyRevenue * 12,
                    totalFundsRaised
                };
            }

            // --- Team Updates ---
            if (sectionsToInclude.teamUpdates) {
                const activeEmployees = await Headcount.find({ 
                    organization: organizationId, 
                    status: 'Active' 
                });
                const openPositions = await Headcount.countDocuments({ 
                    organization: organizationId,
                    status: { $in: ['Open Requisition', 'Interviewing', 'Offer Extended'] } 
                });
                const newHires = await Headcount.find({
                    organization: organizationId,
                    status: 'Active',
                    startDate: { $gte: previousMeeting ? previousMeeting.meetingDate : threeMonthsAgo }
                }).select('name title department startDate');
                const departures = await Headcount.find({
                    organization: organizationId,
                    status: 'Former',
                    endDate: { $gte: previousMeeting ? previousMeeting.meetingDate : threeMonthsAgo }
                }).select('name title department endDate');

                meeting.teamUpdates = {
                    currentHeadcount: activeEmployees.length,
                    newHires: newHires.map(h => ({ headcountId: h._id, name: h.name, role: h.title, department: h.department })),
                    openPositions,
                    keyDepartures: departures.map(d => ({ name: d.name, role: d.title, impactOnBusiness: `${d.title} left on ${d.endDate?.toISOString().split('T')[0] || 'N/A'}` }))
                };
            }

            // --- Product Milestones ---
            if (sectionsToInclude.productMilestones) {
                const recentlyCompletedMilestones = await ProductMilestone.find({
                    organization: organizationId,
                    status: 'Completed',
                    actualEndDate: { $gte: previousMeeting ? previousMeeting.meetingDate : threeMonthsAgo },
                    visibleToInvestors: true
                }).select('name status completionPercentage actualEndDate investorSummary plannedEndDate');
                
                const upcomingMilestones = await ProductMilestone.find({
                    organization: organizationId,
                    status: { $nin: ['Completed', 'Cancelled'] },
                    plannedEndDate: { $gte: new Date() },
                    visibleToInvestors: true
                }).sort({ plannedEndDate: 1 }).limit(5)
                .select('name status completionPercentage plannedEndDate investorSummary');

                meeting.highlightedMilestones = [
                    ...recentlyCompletedMilestones.map(m => ({ milestoneId: m._id, milestoneName: m.name, status: m.status, completionPercentage: m.completionPercentage, investorSummary: m.investorSummary, plannedEndDate: m.plannedEndDate })),
                    ...upcomingMilestones.map(m => ({ milestoneId: m._id, milestoneName: m.name, status: m.status, completionPercentage: m.completionPercentage, investorSummary: m.investorSummary, plannedEndDate: m.plannedEndDate }))
                ];
            }

            // --- KPIs (Custom Pinned KPIs) ---
            if (sectionsToInclude.kpis) {
                const keyKpis = await CustomKPI.find({
                    organization: organizationId,
                    isActive: true,
                    isPinned: true
                }).limit(10).select('name displayName cache displayFormat');

                meeting.highlightedKpis = keyKpis.map(kpi => ({
                    kpiId: kpi._id,
                    kpiName: kpi.displayName || kpi.name,
                    value: kpi.cache?.currentValue,
                    formattedValue: kpi.cache?.currentValue !== undefined && kpi.displayFormat ? formatCurrency(kpi.cache.currentValue) : 'N/A',
                    trend: kpi.cache?.trend,
                    target: kpi.cache?.historicalValues?.slice(-1)[0]?.target
                }));
            }

            // --- User Metrics (from ManualKpiSnapshot) ---
            if (sectionsToInclude.userMetrics) {
                const latestSnapshot = await ManualKpiSnapshot.findOne({ 
                    organization: organizationId 
                }).sort({ snapshotDate: -1 });
                
                if (latestSnapshot) {
                    meeting.userMetricsSnapshot = {
                        snapshotDate: latestSnapshot.snapshotDate,
                        dau: latestSnapshot.dau,
                        mau: latestSnapshot.mau,
                        totalRegisteredUsers: latestSnapshot.totalRegisteredUsers,
                        newUsersToday: latestSnapshot.newUsersToday,
                        dauMauRatio: latestSnapshot.mau && latestSnapshot.dau ? ((latestSnapshot.dau / latestSnapshot.mau) * 100).toFixed(2) + '%' : 'N/A',
                    };
                } else {
                    meeting.userMetricsSnapshot = null;
                }
            }

            // --- Runway Scenario ---
            if (sectionsToInclude.runwayScenario) {
                const latestScenario = await RunwayScenario.findOne({ 
                    organization: organizationId, 
                    isActive: true 
                }).sort({ createdAt: -1 });
                
                if (latestScenario) {
                    meeting.linkedRunwayScenario = {
                        scenarioId: latestScenario._id,
                        name: latestScenario.name,
                        totalRunwayMonths: latestScenario.totalRunwayMonths,
                        cashOutDate: latestScenario.dateOfCashOut,
                    };
                } else {
                    meeting.linkedRunwayScenario = null;
                }
            }

            // --- Fundraising Prediction ---
            if (sectionsToInclude.fundraisingPrediction) {
                const latestPrediction = await FundraisingPrediction.findOne({ 
                    organization: organizationId 
                }).sort({ createdAt: -1 });
                
                if (latestPrediction) {
                    meeting.linkedFundraisingPrediction = {
                        predictionId: latestPrediction._id,
                        name: latestPrediction.predictionName,
                        targetRoundSize: latestPrediction.targetRoundSize,
                        predictedCloseDate: latestPrediction.predictedCloseDate,
                        overallProbability: latestPrediction.overallProbability,
                    };
                } else {
                    meeting.linkedFundraisingPrediction = null;
                }
            }

            // --- Budget Summary ---
            if (sectionsToInclude.budgetSummary) {
                const relevantBudget = await Budget.findOne({
                    organization: organizationId,
                    status: 'Active',
                    periodStartDate: { $lte: meeting.meetingDate },
                    periodEndDate: { $gte: meeting.meetingDate }
                }).sort({ periodStartDate: -1 });

                if (relevantBudget) {
                    const actualExpenses = await Expense.aggregate([
                        { $match: { 
                            organization: organizationId,
                            date: { $gte: relevantBudget.periodStartDate, $lte: relevantBudget.periodEndDate } 
                        }},
                        { $group: { _id: "$category", actualSpent: { $sum: "$amount" } } }
                    ]);
                    const totalActualSpent = actualExpenses.reduce((sum, exp) => sum + exp.actualSpent, 0);
                    
                    meeting.budgetSummary = {
                        budgetName: relevantBudget.name,
                        period: `${relevantBudget.periodStartDate.toLocaleDateString()} - ${relevantBudget.periodEndDate.toLocaleDateString()}`,
                        totalBudgeted: relevantBudget.totalBudgetedAmount,
                        totalActualSpent: totalActualSpent,
                        totalVariance: relevantBudget.totalBudgetedAmount - totalActualSpent,
                        topCategoryVariances: relevantBudget.items.slice(0,3).map(item => {
                            const actual = actualExpenses.find(exp => exp._id === item.category);
                            const actualSpentVal = actual ? actual.actualSpent : 0;
                            return { category: item.category, budgeted: item.budgetedAmount, actual: actualSpentVal, variance: item.budgetedAmount - actualSpentVal};
                        })
                    };
                } else {
                    meeting.budgetSummary = null;
                }
            }

            // --- Suggested Documents ---
            if (sectionsToInclude.suggestedDocuments) {
                const pitchDeck = await Document.findOne({ 
                    organization: organizationId, 
                    category: 'Pitch Deck' 
                }).sort({ createdAt: -1 });
                
                const financialModel = await Document.findOne({ 
                    organization: organizationId, 
                    tags: { $in: ['Financial Model', 'Forecast'] } 
                }).sort({ createdAt: -1 });
                
                meeting.suggestedDocuments = [];
                if (pitchDeck) meeting.suggestedDocuments.push({ documentId: pitchDeck._id, fileName: pitchDeck.fileName, category: pitchDeck.category, reason: "Latest Pitch Deck" });
                if (financialModel) meeting.suggestedDocuments.push({ documentId: financialModel._id, fileName: financialModel.fileName, category: financialModel.category, reason: "Latest Financial Model" });
            }

            // Auto-generate talking points if the section is included
            if (sectionsToInclude.talkingPoints) {
                const talkingPoints = [];
                if (meeting.financialSnapshot && meeting.financialSnapshot.runway < 6) {
                    talkingPoints.push({
                        title: 'Runway Status', category: 'Challenge',
                        content: `Current runway is ${meeting.financialSnapshot.runway.toFixed(1)} months. Discussing strategies to extend.`,
                        priority: 1
                    });
                }
                if (meeting.highlightedMilestones?.some(m => m.status !== 'Completed' && new Date(m.plannedEndDate) < new Date())) {
                    talkingPoints.push({
                        title: 'Delayed Milestones', category: 'Challenge',
                        content: `Some key milestones are currently delayed. Addressing roadblocks.`,
                        priority: 2
                    });
                }
                // Add talking point for user metrics if significant change or notable value
                if(meeting.userMetricsSnapshot && meeting.userMetricsSnapshot.mau > 0) {
                    talkingPoints.push({
                        title: 'User Engagement', category: 'Update',
                        content: `MAU at ${meeting.userMetricsSnapshot.mau}, DAU at ${meeting.userMetricsSnapshot.dau}. Ratio: ${meeting.userMetricsSnapshot.dauMauRatio}.`,
                        priority: 3
                    });
                }
                meeting.talkingPoints = talkingPoints;
            }

            meeting.preparation = {
                ...meeting.preparation,
                status: 'Ready',
                dataCollectionComplete: true,
                preparationNotes: 'Auto-prepared with selected data sections.',
                assignedTo: userId
            };
            if (meeting.status === 'Scheduled') meeting.status = 'Preparation';
            meeting.updatedBy = userId;

            await meeting.save();
            res.json({ success: true, data: meeting, msg: 'Meeting preparation completed successfully' });

        } catch (err) {
            console.error('Error preparing meeting:', err.message, err.stack);
            res.status(500).json({ success: false, msg: 'Server Error: Could not prepare meeting' });
        }
    },

    /**
     * Add a talking point to a meeting
     * @desc    Add talking point to meeting for the active organization
     * @route   POST /api/horizon/investor-meetings/:id/talking-points
     * @access  Private
     */
    addTalkingPoint: async (req, res) => {
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

            const { title, category, content, priority, relatedMetrics } = req.body;

            if (!title || !content) {
                return res.status(400).json({
                    success: false,
                    msg: 'Title and content are required'
                });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const meeting = await InvestorMeeting.findOne({ 
                _id: req.params.id, 
                organization: organizationId 
            });

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found within your organization'
                });
            }

            const newTalkingPoint = {
                title,
                category: category || 'Update',
                content,
                priority: priority || 3,
                relatedMetrics: relatedMetrics || [],
                wasDiscussed: false
            };

            meeting.talkingPoints.push(newTalkingPoint);
            meeting.updatedBy = userId;

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
     * Update meeting notes
     * @desc    Update meeting notes for the active organization
     * @route   PUT /api/horizon/investor-meetings/:id/notes
     * @access  Private
     */
    updateMeetingNotes: async (req, res) => {
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

            const { notes, summary } = req.body;

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const meeting = await InvestorMeeting.findOne({ 
                _id: req.params.id, 
                organization: organizationId 
            });

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found within your organization'
                });
            }

            if (notes !== undefined) meeting.notes = notes;
            if (summary !== undefined) meeting.summary = summary;

            meeting.updatedBy = userId;

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
     * Add feedback to a meeting
     * @desc    Add feedback to meeting for the active organization
     * @route   POST /api/horizon/investor-meetings/:id/feedback
     * @access  Private
     */
    addFeedback: async (req, res) => {
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

            const { topic, feedback, feedbackType, priority, requiringAction } = req.body;

            if (!topic || !feedback) {
                return res.status(400).json({
                    success: false,
                    msg: 'Topic and feedback are required'
                });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const meeting = await InvestorMeeting.findOne({ 
                _id: req.params.id, 
                organization: organizationId 
            });

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found within your organization'
                });
            }

            const newFeedback = {
                topic,
                feedback,
                feedbackType: feedbackType || 'Suggestion',
                priority: priority || 'Medium',
                requiringAction: requiringAction || false
            };

            meeting.feedbackItems.push(newFeedback);
            meeting.updatedBy = userId;

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
     * Add action item to a meeting
     * @desc    Add action item to meeting for the active organization
     * @route   POST /api/horizon/investor-meetings/:id/actions
     * @access  Private
     */
    addActionItem: async (req, res) => {
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

            const { action, assignee, dueDate, notes } = req.body;

            if (!action) {
                return res.status(400).json({
                    success: false,
                    msg: 'Action description is required'
                });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const meeting = await InvestorMeeting.findOne({ 
                _id: req.params.id, 
                organization: organizationId 
            });

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found within your organization'
                });
            }

            const newActionItem = {
                action,
                assignee: assignee || userId,
                dueDate,
                status: 'Not Started',
                notes
            };

            meeting.actionItems.push(newActionItem);
            meeting.updatedBy = userId;

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
     * Update action item in a meeting
     * @desc    Update action item in meeting for the active organization
     * @route   PUT /api/horizon/investor-meetings/:id/actions/:actionId
     * @access  Private
     */
    updateActionItem: async (req, res) => {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id) ||
                !mongoose.Types.ObjectId.isValid(req.params.actionId)) {
                return res.status(400).json({
                    success: false,
                    msg: 'Invalid ID format'
                });
            }

            const { status, notes } = req.body;

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const meeting = await InvestorMeeting.findOne({ 
                _id: req.params.id, 
                organization: organizationId 
            });

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found within your organization'
                });
            }
            
            const actionItem = meeting.actionItems.id(req.params.actionId);

            if (!actionItem) {
                return res.status(404).json({
                    success: false,
                    msg: 'Action item not found'
                });
            }

            if (status !== undefined) {
                actionItem.status = status;
                if (status === 'Completed') {
                    actionItem.completedDate = new Date();
                } else {
                    actionItem.completedDate = undefined;
                }
            }

            if (notes !== undefined) {
                actionItem.notes = notes;
            }

            meeting.updatedBy = userId;

            await meeting.save();

            res.json({
                success: true,
                data: actionItem,
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
     * Complete a meeting
     * @desc    Complete meeting for the active organization
     * @route   POST /api/horizon/investor-meetings/:id/complete
     * @access  Private
     */
    completeMeeting: async (req, res) => {
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

            const { meetingEffectiveness, sentimentScore, nextSteps } = req.body;

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const meeting = await InvestorMeeting.findOne({ 
                _id: req.params.id, 
                organization: organizationId 
            });

            if (!meeting) {
                return res.status(404).json({
                    success: false,
                    msg: 'Investor meeting not found within your organization'
                });
            }

            meeting.status = 'Completed';
            meeting.meetingEffectiveness = meetingEffectiveness;
            meeting.sentimentScore = sentimentScore;
            meeting.nextSteps = nextSteps;
            meeting.updatedBy = userId;

            await meeting.save();

            if (req.body.scheduleNextMeeting) {
                try {
                    const nextMeetingDate = new Date(meeting.meetingDate);
                    nextMeetingDate.setDate(nextMeetingDate.getDate() + 30);

                    const nextMeeting = new InvestorMeeting({
                        organization: organizationId,  // Scope to organization
                        user: userId,                  // Track creator
                        title: `Follow-up: ${meeting.title}`,
                        meetingDate: nextMeetingDate,
                        duration: meeting.duration,
                        meetingType: meeting.meetingType,
                        investors: meeting.investors.map(inv => ({
                            investorId: inv.investorId,
                            name: inv.name,
                            company: inv.company,
                            email: inv.email,
                            attended: true
                        })),
                        internalParticipants: meeting.internalParticipants,
                        meetingFormat: meeting.meetingFormat,
                        status: 'Scheduled',
                        previousMeetingId: meeting._id,
                        relatedRoundId: meeting.relatedRoundId,
                        createdBy: userId
                    });

                    await nextMeeting.save();
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
     * @desc    Get meeting statistics for the active organization
     * @route   GET /api/horizon/investor-meetings/statistics
     * @access  Private
     */
    getMeetingStatistics: async (req, res) => {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            const { fromDate, toDate } = req.query;
            
            // --- MULTI-TENANCY: Pass organizationId to static methods ---
            const orgFilter = { organization: organizationId };

            const stats = await InvestorMeeting.getMeetingStatistics(
                organizationId, // Pass organizationId first
                fromDate ? new Date(fromDate) : null,
                toDate ? new Date(toDate) : null
            );

            const upcomingMeetings = await InvestorMeeting.getUpcomingMeetings(
                organizationId, // Pass organizationId first
                5 // Pass the limit (or rely on default)
            );

            // --- MULTI-TENANCY: Filter aggregations by organizationId ---
            const pendingActionItems = await InvestorMeeting.aggregate([
                { $match: { organization: organizationId, 'actionItems.status': { $ne: 'Completed' } } },
                { $unwind: '$actionItems' },
                { $match: { 'actionItems.status': { $ne: 'Completed' } } },
                { $group: {
                    _id: '$actionItems.status',
                    count: { $sum: 1 }
                }},
                { $sort: { _id: 1 } }
            ]);

            const feedbackByType = await InvestorMeeting.aggregate([
                { $match: { organization: organizationId } },
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

module.exports = investorMeetingController;