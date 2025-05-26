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
        required: true 
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
 * Main Investor Meeting Schema
 * Comprehensive tracking of investor meetings, preparation, and follow-ups
 */
const investorMeetingSchema = new mongoose.Schema({
    // Basic meeting information
    title: { 
        type: String, 
        required: true, 
        trim: true 
    },
    meetingDate: { 
        type: Date, 
        required: true,
        index: true 
    },
    duration: { 
        type: Number,
        comment: 'Duration in minutes' 
    },
    meetingType: { 
        type: String,
        enum: [
            'Regular Update', 
            'Board Meeting', 
            'Fundraising', 
            'Due Diligence', 
            'Strategic Discussion', 
            'Other'
        ],
        default: 'Regular Update' 
    },
    
    // Participants
    investors: [{
        investorId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Investor' 
        },
        name: { 
            type: String, 
            trim: true 
        },
        company: { 
            type: String, 
            trim: true 
        },
        role: { 
            type: String, 
            trim: true 
        },
        email: { 
            type: String, 
            trim: true 
        },
        attended: { 
            type: Boolean,
            default: true 
        }
    }],
    internalParticipants: [{
        userId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'HorizonUser' 
        },
        name: { 
            type: String, 
            trim: true 
        },
        role: { 
            type: String, 
            trim: true 
        }
    }],
    
    // Meeting logistics
    location: { 
        type: String,
        trim: true 
    },
    meetingFormat: { 
        type: String,
        enum: ['In-person', 'Video', 'Phone', 'Hybrid'],
        default: 'Video' 
    },
    meetingLink: { 
        type: String,
        trim: true 
    },
    
    // Meeting content
    agenda: { 
        type: String,
        trim: true 
    },
    talkingPoints: [talkingPointSchema],
    
    // Metrics snapshots
    metricSnapshots: [metricSnapshotSchema],
    
    // Highlighted KPIs
    highlightedKpis: [{
        kpiId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'CustomKPI' 
        },
        kpiName: { 
            type: String, 
            trim: true 
        }
    }],
    
    // Highlighted milestones
    highlightedMilestones: [{
        milestoneId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'ProductMilestone' 
        },
        milestoneName: { 
            type: String, 
            trim: true 
        },
        status: { 
            type: String 
        },
        completionPercentage: { 
            type: Number 
        }
    }],
    
    // Team updates
    teamUpdates: {
        currentHeadcount: { 
            type: Number 
        },
        newHires: [{
            headcountId: { 
                type: mongoose.Schema.Types.ObjectId, 
                ref: 'Headcount' 
            },
            name: { 
                type: String, 
                trim: true 
            },
            role: { 
                type: String, 
                trim: true 
            },
            department: { 
                type: String, 
                trim: true 
            }
        }],
        openPositions: { 
            type: Number 
        },
        keyDepartures: [{
            name: { 
                type: String, 
                trim: true 
            },
            role: { 
                type: String, 
                trim: true 
            },
            impactOnBusiness: { 
                type: String, 
                trim: true 
            }
        }]
    },
    
    // Financial snapshots
    financialSnapshot: {
        cashBalance: { 
            type: Number 
        },
        monthlyBurn: { 
            type: Number 
        },
        runway: { 
            type: Number,
            comment: 'Runway in months' 
        },
        mrr: { 
            type: Number,
            comment: 'Monthly Recurring Revenue' 
        },
        arr: { 
            type: Number,
            comment: 'Annual Recurring Revenue' 
        },
        totalFundsRaised: { 
            type: Number 
        }
    },
    
    // Meeting outcome tracking
    status: { 
        type: String,
        enum: [
            'Scheduled', 
            'Preparation', 
            'Completed', 
            'Cancelled', 
            'Rescheduled'
        ],
        default: 'Scheduled',
        index: true 
    },
    preparation: {
        status: { 
            type: String,
            enum: [
                'Not Started', 
                'In Progress', 
                'Ready', 
                'Needs Review'
            ],
            default: 'Not Started' 
        },
        assignedTo: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'HorizonUser' 
        },
        dataCollectionComplete: { 
            type: Boolean,
            default: false 
        },
        presentationReady: { 
            type: Boolean,
            default: false 
        },
        preparationNotes: { 
            type: String,
            trim: true 
        }
    },
    
    // Meeting records
    notes: { 
        type: String,
        trim: true 
    },
    summary: { 
        type: String,
        trim: true 
    },
    recordingUrl: { 
        type: String,
        trim: true 
    },
    
    // Feedback and outcomes
    feedbackItems: [feedbackItemSchema],
    actionItems: [actionItemSchema],
    
    // Post-meeting assessment
    meetingEffectiveness: { 
        type: Number,
        min: 1,
        max: 5,
        comment: 'Scale of 1-5, with 5 being most effective' 
    },
    sentimentScore: { 
        type: Number,
        min: -1,
        max: 1,
        comment: 'Investor sentiment, -1 to 1 (negative to positive)' 
    },
    nextSteps: { 
        type: String,
        trim: true 
    },
    
    // Related information
    relatedDocuments: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Document' 
    }],
    previousMeetingId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'InvestorMeeting' 
    },
    nextMeetingId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'InvestorMeeting' 
    },
    relatedRoundId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Round' 
    },
    
    // Additional info
    tags: [{ 
        type: String, 
        trim: true 
    }],
    
    // Metadata
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'HorizonUser', 
        required: true 
    },
    updatedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'HorizonUser' 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

/**
 * Pre-save middleware for investor meeting
 * Updates status and completion information
 */
investorMeetingSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Set status to Completed if meeting date has passed
    const now = new Date();
    if (this.meetingDate && this.meetingDate < now && this.status === 'Scheduled') {
        this.status = 'Completed';
    }
    
    // Calculate talkingPoints discussed percentage
    if (this.talkingPoints && this.talkingPoints.length > 0) {
        const discussedCount = this.talkingPoints.filter(point => 
            point.wasDiscussed
        ).length;
        
        this.discussedPercentage = Math.round((discussedCount / this.talkingPoints.length) * 100);
    }
    
    // Calculate action items completion percentage
    if (this.actionItems && this.actionItems.length > 0) {
        const completedCount = this.actionItems.filter(item => 
            item.status === 'Completed'
        ).length;
        
        this.actionItemsCompletionPercentage = Math.round((completedCount / this.actionItems.length) * 100);
    }
    
    next();
});

/**
 * Static method to get upcoming meetings
 */
investorMeetingSchema.statics.getUpcomingMeetings = async function(limit = 5) {
    const now = new Date();
    return this.find({ 
        meetingDate: { $gte: now },
        status: { $in: ['Scheduled', 'Preparation'] }
    })
    .sort({ meetingDate: 1 })
    .limit(limit)
    .populate('investors.investorId', 'name entityName')
    .select('title meetingDate meetingType investors preparation status');
};

/**
 * Static method to get meeting statistics
 */
investorMeetingSchema.statics.getMeetingStatistics = async function(startDate, endDate) {
    const query = {};
    if (startDate || endDate) {
        query.meetingDate = {};
        if (startDate) query.meetingDate.$gte = new Date(startDate);
        if (endDate) query.meetingDate.$lte = new Date(endDate);
    }
    
    const totalMeetings = await this.countDocuments(query);
    const completedMeetings = await this.countDocuments({
        ...query,
        status: 'Completed'
    });
    
    const aggregateResult = await this.aggregate([
        { $match: query },
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

// Add indexes for common queries
investorMeetingSchema.index({ meetingDate: 1, status: 1 });
investorMeetingSchema.index({ 'investors.investorId': 1 });
investorMeetingSchema.index({ relatedRoundId: 1 });
investorMeetingSchema.index({ createdAt: -1 });

// Create model
const InvestorMeeting = mongoose.model('InvestorMeeting', investorMeetingSchema);
module.exports = InvestorMeeting;