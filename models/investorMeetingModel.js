// models/investorMeetingModel.js
const mongoose = require('mongoose');

/**
 * User's original Metric Snapshot Schema - Preserved
 */
const metricSnapshotSchema = new mongoose.Schema({
    _id: false, // ADDED: To prevent sub-document IDs if not needed
    category: {
        type: String,
        required: true,
        enum: [
            'Financial', 'User', 'Product', 'Team', 'Sales', 'Marketing', 'Other'
        ]
    },
    name: { type: String, required: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed },
    previousValue: { type: mongoose.Schema.Types.Mixed },
    changePercentage: { type: Number },
    trend: { type: String, enum: ['up', 'down', 'flat', 'unknown'], default: 'unknown' },
    format: { type: String, enum: ['number', 'currency', 'percentage', 'date', 'text'], default: 'number' },
    contextNote: { type: String, trim: true },
    highlight: { type: Boolean, default: false },
    order: { type: Number, default: 0 }
});

/**
 * User's original Talking Point Schema - Preserved
 */
const talkingPointSchema = new mongoose.Schema({
    // _id: true is default for subdocuments unless specified as false. User had it as true.
    title: { type: String, required: true, trim: true },
    category: {
        type: String,
        enum: ['Win', 'Challenge', 'Request', 'Update', 'Question', 'Strategic', 'Other'],
        default: 'Update'
    },
    content: { type: String, required: true, trim: true },
    priority: { type: Number, min: 1, max: 5, default: 3 },
    relatedMetrics: [{ type: String, trim: true }],
    notes: { type: String, trim: true },
    wasDiscussed: { type: Boolean, default: false }
}); // User had _id: true, which is default, so kept as is.

/**
 * User's original Feedback Item Schema - Preserved
 */
const feedbackItemSchema = new mongoose.Schema({
    // _id: true is default.
    topic: { type: String, required: true, trim: true },
    feedback: { type: String, required: true, trim: true },
    feedbackType: {
        type: String,
        enum: ['Positive', 'Negative', 'Suggestion', 'Question', 'Concern', 'Other'],
        default: 'Suggestion'
    },
    priority: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], default: 'Medium' },
    requiringAction: { type: Boolean, default: false }
}); // User had _id: true, which is default.

/**
 * User's original Action Item Schema - Preserved
 */
const actionItemSchema = new mongoose.Schema({
    // _id: true is default.
    action: { type: String, required: true, trim: true },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' }, // Should also be organization-scoped
    dueDate: { type: Date },
    status: { type: String, enum: ['Not Started', 'In Progress', 'Completed', 'Cancelled'], default: 'Not Started' },
    completedDate: { type: Date },
    notes: { type: String, trim: true }
}); // User had _id: true, which is default.

/**
 * User's original Sections to include in the meeting preparation and display - Preserved
 */
const meetingSectionsSchema = new mongoose.Schema({
    _id: false, // ADDED
    financialSnapshot: { type: Boolean, default: true },
    teamUpdates: { type: Boolean, default: true },
    productMilestones: { type: Boolean, default: true },
    kpis: { type: Boolean, default: true },
    userMetrics: { type: Boolean, default: true },
    runwayScenario: { type: Boolean, default: true },
    fundraisingPrediction: { type: Boolean, default: true },
    budgetSummary: { type: Boolean, default: true },
    talkingPoints: { type: Boolean, default: true },
    suggestedDocuments: { type: Boolean, default: true }
});

/**
 * User's original Budget Summary Schema - Preserved
 */
const budgetSummarySchema = new mongoose.Schema({
    _id: false, // ADDED
    budgetName: { type: String },
    period: { type: String },
    totalBudgeted: { type: Number },
    totalActualSpent: { type: Number },
    totalVariance: { type: Number },
    topCategoryVariances: [{
        _id: false, // ADDED
        category: String,
        budgeted: Number,
        actual: Number,
        variance: Number
    }]
});

/**
 * User's original User Metrics Snapshot Schema - Preserved
 */
const userMetricsSnapshotSchema = new mongoose.Schema({
    _id: false, // ADDED
    snapshotDate: { type: Date },
    dau: { type: Number },
    mau: { type: Number },
    totalRegisteredUsers: { type: Number },
    newUsersToday: { type: Number },
    dauMauRatio: { type: String }
});


/**
 * Main Investor Meeting Schema - With multi-tenancy fields added
 */
const investorMeetingSchema = new mongoose.Schema({
    // --- Fields for Multi-Tenancy (ADDED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for an investor meeting.'], // Added required message
        index: true,
    },
    // `createdBy` and `updatedBy` fields already exist and reference HorizonUser.

    // --- User's Existing Fields (Preserved) ---
    title: { type: String, required: true, trim: true },
    meetingDate: { type: Date, required: true, index: true },
    duration: { type: Number, comment: 'Duration in minutes' },
    meetingType: {
        type: String,
        enum: ['Regular Update', 'Board Meeting', 'Fundraising', 'Due Diligence', 'Strategic Discussion', 'Other'],
        default: 'Regular Update'
    },
    investors: [{ // Investor references should ideally also be organization-scoped or global but linked via meeting
        _id: false, // ADDED
        investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor' }, // Investor model should also be org-scoped or handled carefully
        name: { type: String, trim: true },
        company: { type: String, trim: true },
        role: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true }, // Added lowercase
        attended: { type: Boolean, default: true }
    }],
    internalParticipants: [{ // HorizonUser references are fine
        _id: false, // ADDED
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
    highlightedKpis: [{ // CustomKPI should be org-scoped
        _id: false, // ADDED
        kpiId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomKPI' },
        kpiName: { type: String, trim: true },
        value: mongoose.Schema.Types.Mixed,
        formattedValue: String,
        trend: Number,
        target: mongoose.Schema.Types.Mixed,
    }],
    highlightedMilestones: [{ // ProductMilestone should be org-scoped
        _id: false, // ADDED
        milestoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductMilestone' },
        milestoneName: { type: String, trim: true },
        status: { type: String },
        completionPercentage: { type: Number },
        investorSummary: String,
        plannedEndDate: Date
    }],
    teamUpdates: { // Headcount references should be org-scoped
        _id: false, // ADDED
        currentHeadcount: { type: Number },
        newHires: [{
            _id: false, // ADDED
            headcountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Headcount' },
            name: { type: String, trim: true },
            role: { type: String, trim: true },
            department: { type: String, trim: true }
        }],
        openPositions: { type: Number },
        keyDepartures: [{
            _id: false, // ADDED
            name: { type: String, trim: true },
            role: { type: String, trim: true },
            impactOnBusiness: { type: String, trim: true }
        }]
    },
    financialSnapshot: { // Data here should be from org-scoped financials
        _id: false, // ADDED
        cashBalance: { type: Number },
        monthlyBurn: { type: Number },
        runway: { type: Number, comment: 'Runway in months' },
        mrr: { type: Number, comment: 'Monthly Recurring Revenue' },
        arr: { type: Number, comment: 'Annual Recurring Revenue' },
        totalFundsRaised: { type: Number }
    },
    userMetricsSnapshot: userMetricsSnapshotSchema, // Preserved
    linkedRunwayScenario: { // RunwayScenario should be org-scoped
        _id: false, // ADDED
        scenarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'RunwayScenario' },
        name: String,
        totalRunwayMonths: Number,
        cashOutDate: Date,
        p10Runway: Number,
        p90Runway: Number,
    },
    linkedFundraisingPrediction: { // FundraisingPrediction should be org-scoped
        _id: false, // ADDED
        predictionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FundraisingPrediction' },
        name: String,
        targetRoundSize: Number,
        predictedCloseDate: Date,
        overallProbability: Number,
    },
    budgetSummary: budgetSummarySchema, // Budget should be org-scoped
    status: {
        type: String,
        enum: ['Scheduled', 'Preparation', 'Completed', 'Cancelled', 'Rescheduled'],
        default: 'Scheduled',
        index: true
    },
    preparation: {
        _id: false, // ADDED
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
    relatedDocuments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }], // Document should be org-scoped
    suggestedDocuments: [{ // Document should be org-scoped
        _id: false, // ADDED
        documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
        fileName: String,
        category: String,
        reason: String
    }],
    previousMeetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestorMeeting', index: true }, // Added index
    nextMeetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestorMeeting', index: true }, // Added index
    relatedRoundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', index: true }, // Round should be org-scoped
    meetingSections: { // Preserved user's default logic
        type: meetingSectionsSchema,
        default: () => ({
            financialSnapshot: true, teamUpdates: true, productMilestones: true, kpis: true,
            userMetrics: true, runwayScenario: true, fundraisingPrediction: true,
            budgetSummary: true, talkingPoints: true, suggestedDocuments: true
        })
    },
    tags: [{ type: String, trim: true, lowercase: true }], // Added lowercase
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },
    // createdAt: { type: Date, default: Date.now }, // Will be handled by timestamps: true
    // updatedAt: { type: Date, default: Date.now }  // Will be handled by timestamps: true
}, {
    timestamps: true, // ADDED: Automatically adds createdAt and updatedAt
    collection: 'investormeetings', // ADDED: Explicit collection name
});

// User's original pre('save') hook - Only manual updatedAt removed
investorMeetingSchema.pre('save', function(next) {
    // this.updatedAt = Date.now(); // REMOVED: Handled by timestamps: true
    const now = new Date(); // Preserved user's logic
    if (this.meetingDate && this.meetingDate < now && this.status === 'Scheduled') {
        this.status = 'Completed';
    }
    if (this.talkingPoints && this.talkingPoints.length > 0) {
        const discussedCount = this.talkingPoints.filter(point => point.wasDiscussed).length;
        // this.discussedPercentage = Math.round((discussedCount / this.talkingPoints.length) * 100); // Property 'discussedPercentage' does not exist on type 'InvestorMeeting'
    }
    if (this.actionItems && this.actionItems.length > 0) {
        const completedCount = this.actionItems.filter(item => item.status === 'Completed').length;
        // this.actionItemsCompletionPercentage = Math.round((completedCount / this.actionItems.length) * 100); // Property 'actionItemsCompletionPercentage' does not exist
    }
    next();
});

// User's original Static methods - Modified to include organizationId
investorMeetingSchema.statics.getUpcomingMeetings = async function(organizationId, limit = 5) { // ADDED organizationId
    const now = new Date();
    const userFilter = { organization: organizationId }; // ADDED organization filter
    return this.find({
        ...userFilter,
        meetingDate: { $gte: now },
        status: { $in: ['Scheduled', 'Preparation'] }
    })
    .sort({ meetingDate: 1 })
    .limit(limit)
    .populate('investors.investorId', 'name entityName') // Assuming Investor model has these fields
    .select('title meetingDate meetingType investors preparation status organization'); // Added organization to select
};

investorMeetingSchema.statics.getMeetingStatistics = async function(organizationId, startDate, endDate) { // ADDED organizationId
    const query = { organization: organizationId }; // ADDED organization filter
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

// User's original Indexes - Preserved and new ones added/updated
investorMeetingSchema.index({ organization: 1, meetingDate: 1, status: 1 }); // ADDED organization
investorMeetingSchema.index({ organization: 1, 'investors.investorId': 1 }); // ADDED organization
investorMeetingSchema.index({ organization: 1, relatedRoundId: 1 }); // ADDED organization
investorMeetingSchema.index({ organization: 1, createdBy: 1 }); // ADDED organization
investorMeetingSchema.index({ createdAt: -1 }); // Kept, though less useful without org context for multi-tenant queries
// Original indexes preserved but now less specific without organization:
// investorMeetingSchema.index({ meetingDate: 1, status: 1 });
// investorMeetingSchema.index({ 'investors.investorId': 1 });
// investorMeetingSchema.index({ relatedRoundId: 1 });
// investorMeetingSchema.index({ createdBy: 1 });


const InvestorMeeting = mongoose.models.InvestorMeeting || mongoose.model('InvestorMeeting', investorMeetingSchema);
module.exports = InvestorMeeting;
