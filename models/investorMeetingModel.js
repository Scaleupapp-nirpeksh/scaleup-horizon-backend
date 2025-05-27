// models/investorMeetingModel.js
const mongoose = require('mongoose');

/**
 * Metric Snapshot Schema - captures point-in-time metrics for meeting
 */
const metricSnapshotSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        enum: [
            'Financial',
            'User',
            'Product',
            'Team',
            'Sales',
            'Marketing',
            'Other'
        ]
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        // Not strictly required, as some metrics might be pending
    },
    previousValue: {
        type: mongoose.Schema.Types.Mixed
    },
    changePercentage: {
        type: Number
    },
    trend: {
        type: String,
        enum: ['up', 'down', 'flat', 'unknown'],
        default: 'unknown'
    },
    format: {
        type: String,
        enum: ['number', 'currency', 'percentage', 'date', 'text'],
        default: 'number'
    },
    contextNote: {
        type: String,
        trim: true
    },
    highlight: {
        type: Boolean,
        default: false
    },
    order: {
        type: Number,
        default: 0
    }
}, { _id: false });

/**
 * Talking Point Schema - for key discussion items
 */
const talkingPointSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        enum: [
            'Win',
            'Challenge',
            'Request',
            'Update',
            'Question',
            'Strategic',
            'Other'
        ],
        default: 'Update'
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    priority: {
        type: Number,
        min: 1,
        max: 5,
        default: 3
    },
    relatedMetrics: [{
        type: String,
        trim: true
    }],
    notes: {
        type: String,
        trim: true
    },
    wasDiscussed: {
        type: Boolean,
        default: false
    }
}, { _id: true });

/**
 * Feedback Item Schema - for investor feedback
 */
const feedbackItemSchema = new mongoose.Schema({
    topic: {
        type: String,
        required: true,
        trim: true
    },
    feedback: {
        type: String,
        required: true,
        trim: true
    },
    feedbackType: {
        type: String,
        enum: [
            'Positive',
            'Negative',
            'Suggestion',
            'Question',
            'Concern',
            'Other'
        ],
        default: 'Suggestion'
    },
    priority: {
        type: String,
        enum: ['Critical', 'High', 'Medium', 'Low'],
        default: 'Medium'
    },
    requiringAction: {
        type: Boolean,
        default: false
    }
}, { _id: true });

/**
 * Action Item Schema - for post-meeting tasks
 */
const actionItemSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        trim: true
    },
    assignee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser'
    },
    dueDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['Not Started', 'In Progress', 'Completed', 'Cancelled'],
        default: 'Not Started'
    },
    completedDate: {
        type: Date
    },
    notes: {
        type: String,
        trim: true
    }
}, { _id: true });

/**
 * Sections to include in the meeting preparation and display
 */
const meetingSectionsSchema = new mongoose.Schema({
    financialSnapshot: { type: Boolean, default: true },
    teamUpdates: { type: Boolean, default: true },
    productMilestones: { type: Boolean, default: true },
    kpis: { type: Boolean, default: true },
    userMetrics: { type: Boolean, default: true }, // Ensures this flag exists and defaults to true
    runwayScenario: { type: Boolean, default: true },
    fundraisingPrediction: { type: Boolean, default: true },
    budgetSummary: { type: Boolean, default: true },
    talkingPoints: { type: Boolean, default: true },
    suggestedDocuments: { type: Boolean, default: true }
}, { _id: false });

/**
 * Budget Summary Schema
 */
const budgetSummarySchema = new mongoose.Schema({
    budgetName: { type: String },
    period: { type: String },
    totalBudgeted: { type: Number },
    totalActualSpent: { type: Number },
    totalVariance: { type: Number },
    topCategoryVariances: [{
        category: String,
        budgeted: Number,
        actual: Number,
        variance: Number
    }]
}, { _id: false });

/**
 * User Metrics Snapshot Schema - NEW
 * To store a snapshot of key user metrics for the meeting.
 */
const userMetricsSnapshotSchema = new mongoose.Schema({
    snapshotDate: { type: Date },
    dau: { type: Number },
    mau: { type: Number },
    totalRegisteredUsers: { type: Number },
    newUsersToday: { type: Number },
    dauMauRatio: { type: String } // Storing as string because controller formats it with '%'
}, { _id: false });


/**
 * Main Investor Meeting Schema
 */
const investorMeetingSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    meetingDate: { type: Date, required: true, index: true },
    duration: { type: Number, comment: 'Duration in minutes' },
    meetingType: {
        type: String,
        enum: ['Regular Update', 'Board Meeting', 'Fundraising', 'Due Diligence', 'Strategic Discussion', 'Other'],
        default: 'Regular Update'
    },
    investors: [{
        investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor' },
        name: { type: String, trim: true },
        company: { type: String, trim: true },
        role: { type: String, trim: true },
        email: { type: String, trim: true },
        attended: { type: Boolean, default: true }
    }],
    internalParticipants: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },
        name: { type: String, trim: true },
        role: { type: String, trim: true }
    }],
    location: { type: String, trim: true },
    meetingFormat: { type: String, enum: ['In-person', 'Video', 'Phone', 'Hybrid'], default: 'Video' },
    meetingLink: { type: String, trim: true },
    agenda: { type: String, trim: true },
    talkingPoints: [talkingPointSchema],
    metricSnapshots: [metricSnapshotSchema],
    highlightedKpis: [{
        kpiId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomKPI' },
        kpiName: { type: String, trim: true },
        value: mongoose.Schema.Types.Mixed,
        formattedValue: String,
        trend: Number,
        target: mongoose.Schema.Types.Mixed,
    }],
    highlightedMilestones: [{
        milestoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductMilestone' },
        milestoneName: { type: String, trim: true },
        status: { type: String },
        completionPercentage: { type: Number },
        investorSummary: String,
        plannedEndDate: Date
    }],
    teamUpdates: {
        currentHeadcount: { type: Number },
        newHires: [{
            headcountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Headcount' },
            name: { type: String, trim: true },
            role: { type: String, trim: true },
            department: { type: String, trim: true }
        }],
        openPositions: { type: Number },
        keyDepartures: [{
            name: { type: String, trim: true },
            role: { type: String, trim: true },
            impactOnBusiness: { type: String, trim: true }
        }]
    },
    financialSnapshot: {
        cashBalance: { type: Number },
        monthlyBurn: { type: Number },
        runway: { type: Number, comment: 'Runway in months' },
        mrr: { type: Number, comment: 'Monthly Recurring Revenue' },
        arr: { type: Number, comment: 'Annual Recurring Revenue' },
        totalFundsRaised: { type: Number }
    },
    // NEW: Field to store the snapshot of user metrics
    userMetricsSnapshot: userMetricsSnapshotSchema,

    linkedRunwayScenario: {
        scenarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'RunwayScenario' },
        name: String,
        totalRunwayMonths: Number,
        cashOutDate: Date,
        p10Runway: Number,
        p90Runway: Number,
    },
    linkedFundraisingPrediction: {
        predictionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FundraisingPrediction' },
        name: String,
        targetRoundSize: Number,
        predictedCloseDate: Date,
        overallProbability: Number,
    },
    budgetSummary: budgetSummarySchema,
    status: {
        type: String,
        enum: ['Scheduled', 'Preparation', 'Completed', 'Cancelled', 'Rescheduled'],
        default: 'Scheduled',
        index: true
    },
    preparation: {
        status: {
            type: String,
            enum: ['Not Started', 'In Progress', 'Ready', 'Needs Review'],
            default: 'Not Started'
        },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },
        dataCollectionComplete: { type: Boolean, default: false },
        presentationReady: { type: Boolean, default: false },
        preparationNotes: { type: String, trim: true }
    },
    notes: { type: String, trim: true },
    summary: { type: String, trim: true },
    recordingUrl: { type: String, trim: true },
    feedbackItems: [feedbackItemSchema],
    actionItems: [actionItemSchema],
    meetingEffectiveness: {
        type: Number, min: 1, max: 5,
        comment: 'Scale of 1-5, with 5 being most effective'
    },
    sentimentScore: {
        type: Number, min: -1, max: 1,
        comment: 'Investor sentiment, -1 to 1 (negative to positive)'
    },
    nextSteps: { type: String, trim: true },
    relatedDocuments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    suggestedDocuments: [{
        documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
        fileName: String,
        category: String,
        reason: String
    }],
    previousMeetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestorMeeting' },
    nextMeetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestorMeeting' },
    relatedRoundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round' },
    meetingSections: {
        type: meetingSectionsSchema,
        default: () => ({ // Ensures all new flags also default to true
            financialSnapshot: true, teamUpdates: true, productMilestones: true, kpis: true,
            userMetrics: true, runwayScenario: true, fundraisingPrediction: true,
            budgetSummary: true, talkingPoints: true, suggestedDocuments: true
        })
    },
    tags: [{ type: String, trim: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

investorMeetingSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    const now = new Date();
    if (this.meetingDate && this.meetingDate < now && this.status === 'Scheduled') {
        this.status = 'Completed';
    }
    if (this.talkingPoints && this.talkingPoints.length > 0) {
        const discussedCount = this.talkingPoints.filter(point => point.wasDiscussed).length;
        this.discussedPercentage = Math.round((discussedCount / this.talkingPoints.length) * 100);
    }
    if (this.actionItems && this.actionItems.length > 0) {
        const completedCount = this.actionItems.filter(item => item.status === 'Completed').length;
        this.actionItemsCompletionPercentage = Math.round((completedCount / this.actionItems.length) * 100);
    }
    next();
});

investorMeetingSchema.statics.getUpcomingMeetings = async function(limit = 5, userFilter = {}) {
    const now = new Date();
    return this.find({
        ...userFilter, // Apply user filter if provided
        meetingDate: { $gte: now },
        status: { $in: ['Scheduled', 'Preparation'] }
    })
    .sort({ meetingDate: 1 })
    .limit(limit)
    .populate('investors.investorId', 'name entityName')
    .select('title meetingDate meetingType investors preparation status');
};

investorMeetingSchema.statics.getMeetingStatistics = async function(startDate, endDate, userFilter = {}) {
    const query = {...userFilter};
    if (startDate || endDate) {
        query.meetingDate = {};
        if (startDate) query.meetingDate.$gte = new Date(startDate);
        if (endDate) query.meetingDate.$lte = new Date(endDate);
    }

    const totalMeetings = await this.countDocuments(query);
    const completedMeetings = await this.countDocuments({ ...query, status: 'Completed' });

    const aggregateResult = await this.aggregate([
        { $match: { ...query, status: 'Completed' } },
        { $group: {
            _id: null,
            avgEffectiveness: { $avg: '$meetingEffectiveness' },
            avgSentiment: { $avg: '$sentimentScore' }
        }}
    ]);

    return {
        totalMeetings,
        completedMeetings,
        avgEffectiveness: aggregateResult.length > 0 ? aggregateResult[0].avgEffectiveness : null,
        avgSentiment: aggregateResult.length > 0 ? aggregateResult[0].avgSentiment : null
    };
};

investorMeetingSchema.index({ meetingDate: 1, status: 1 });
investorMeetingSchema.index({ 'investors.investorId': 1 });
investorMeetingSchema.index({ relatedRoundId: 1 });
investorMeetingSchema.index({ createdAt: -1 });
investorMeetingSchema.index({ createdBy: 1 });

const InvestorMeeting = mongoose.model('InvestorMeeting', investorMeetingSchema);
module.exports = InvestorMeeting;
