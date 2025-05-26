// models/headcountModel.js
const mongoose = require('mongoose');

/**
 * Compensation Schema - nested document for tracking employee compensation details
 * Includes base, variable, equity, and other compensation elements
 */
const compensationSchema = new mongoose.Schema({
    baseSalary: { 
        type: Number, 
        required: true,
        min: 0 
    },
    currency: { 
        type: String, 
        default: 'INR',
        enum: ['INR', 'USD', 'EUR', 'GBP'] 
    },
    variableCompensation: { 
        type: Number, 
        default: 0,
        min: 0 
    },
    variableFrequency: { 
        type: String, 
        enum: ['Monthly', 'Quarterly', 'Annually', 'One-time'],
        default: 'Annually' 
    },
    equityPercentage: { 
        type: Number, 
        default: 0,
        min: 0,
        max: 100 
    },
    equityVestingSchedule: { 
        type: String,
        trim: true 
    },
    benefits: { 
        type: Number, 
        default: 0,
        min: 0,
        comment: 'Monthly cost of benefits' 
    },
    totalAnnualCost: { 
        type: Number,
        default: 0,
        min: 0 
    },
    notes: { 
        type: String,
        trim: true 
    }
}, { _id: false });

/**
 * Budget Tracking Schema - for tracking planned vs actual costs
 */
const budgetTrackingSchema = new mongoose.Schema({
    budgetedAnnualCost: { 
        type: Number,
        min: 0 
    },
    budgetCategory: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Budget',
        comment: 'Reference to associated budget category' 
    },
    actualVsBudgetVariance: { 
        type: Number,
        default: 0 
    },
    budgetNotes: { 
        type: String,
        trim: true 
    }
}, { _id: false });

/**
 * Main Headcount Schema
 * Tracks all employee data including role, department, status, and compensation
 */
const headcountSchema = new mongoose.Schema({
    // Basic employee information
    name: { 
        type: String, 
        required: true, 
        trim: true 
    },
    email: { 
        type: String, 
        trim: true, 
        lowercase: true,
        index: true 
    },
    title: { 
        type: String, 
        required: true, 
        trim: true 
    },
    
    // Organizational information
    department: { 
        type: String, 
        required: true, 
        enum: [
            'Engineering', 
            'Product', 
            'Design', 
            'Marketing', 
            'Sales', 
            'Customer Success', 
            'Finance', 
            'HR', 
            'Operations', 
            'Executive', 
            'Other'
        ]
    },
    reportingTo: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Headcount',
        comment: 'Manager/supervisor of this employee' 
    },
    level: { 
        type: String,
        enum: ['Intern', 'Entry', 'Mid', 'Senior', 'Lead', 'Manager', 'Director', 'VP', 'C-Suite', 'Founder'],
        default: 'Mid' 
    },
    
    // Employment details
    status: { 
        type: String, 
        required: true, 
        enum: [
            'Active', 
            'Former', 
            'Offer Extended', 
            'Interviewing', 
            'Open Requisition'
        ],
        default: 'Active',
        index: true 
    },
    employmentType: { 
        type: String, 
        required: true, 
        enum: [
            'Full-time', 
            'Part-time', 
            'Contractor', 
            'Intern', 
            'Advisor'
        ],
        default: 'Full-time',
        index: true 
    },
    location: { 
        type: String, 
        trim: true 
    },
    remoteStatus: { 
        type: String,
        enum: ['Remote', 'Hybrid', 'In-office'],
        default: 'Remote' 
    },
    
    // Dates
    startDate: { 
        type: Date 
    },
    endDate: { 
        type: Date 
    },
    requisitionOpenDate: { 
        type: Date,
        comment: 'When position was opened for hiring' 
    },
    targetHireDate: { 
        type: Date,
        comment: 'Target date to fill the position' 
    },
    
    // Compensation details
    compensation: compensationSchema,
    
    // Budget tracking
    budgetTracking: budgetTrackingSchema,
    
    // Hiring process details for open positions
    hiringDetails: {
        requisitionId: { 
            type: String, 
            trim: true 
        },
        hiringPriority: { 
            type: String,
            enum: ['Critical', 'High', 'Medium', 'Low'],
            default: 'Medium' 
        },
        hiringStage: { 
            type: String,
            enum: [
                'Not Started', 
                'Sourcing', 
                'Screening', 
                'Interviewing', 
                'Offer Stage', 
                'Closed'
            ],
            default: 'Not Started' 
        },
        numberOfCandidates: { 
            type: Number, 
            default: 0,
            min: 0 
        },
        interviewsCompleted: { 
            type: Number, 
            default: 0,
            min: 0 
        },
        recruiter: { 
            type: String, 
            trim: true 
        }
    },
    
    // Performance tracking
    performanceTracking: {
        lastReviewDate: { 
            type: Date 
        },
        reviewScore: { 
            type: Number,
            min: 1,
            max: 5 
        },
        keyAccomplishments: [{ 
            type: String, 
            trim: true 
        }],
        developmentAreas: [{ 
            type: String, 
            trim: true 
        }]
    },
    
    // Additional metadata
    tags: [{ 
        type: String, 
        trim: true 
    }],
    notes: { 
        type: String, 
        trim: true 
    },
    
    // Related expense records
    relatedExpenses: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Expense' 
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
 * Pre-save middleware for headcount
 * Calculates total annual cost and budget variance before saving
 */
headcountSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Calculate total annual cost
    if (this.compensation) {
        const { baseSalary, variableCompensation, benefits } = this.compensation;
        const annualBase = baseSalary || 0;
        const annualVariable = variableCompensation || 0;
        const annualBenefits = (benefits || 0) * 12; // Monthly benefits * 12
        
        this.compensation.totalAnnualCost = annualBase + annualVariable + annualBenefits;
        
        // Calculate variance from budget if budgetedAnnualCost is available
        if (this.budgetTracking && this.budgetTracking.budgetedAnnualCost) {
            this.budgetTracking.actualVsBudgetVariance = 
                this.budgetTracking.budgetedAnnualCost - this.compensation.totalAnnualCost;
        }
    }
    
    next();
});

/**
 * Static method to get total headcount
 */
headcountSchema.statics.getTotalHeadcount = async function(statusFilter = 'Active') {
    const query = statusFilter ? { status: statusFilter } : {};
    return this.countDocuments(query);
};

/**
 * Static method to get headcount by department
 */
headcountSchema.statics.getHeadcountByDepartment = async function(statusFilter = 'Active') {
    const query = statusFilter ? { status: statusFilter } : {};
    
    return this.aggregate([
        { $match: query },
        { $group: { 
            _id: '$department', 
            count: { $sum: 1 },
            totalAnnualCost: { $sum: '$compensation.totalAnnualCost' }
        }},
        { $sort: { _id: 1 } }
    ]);
};

/**
 * Static method to get total annual cost
 */
headcountSchema.statics.getTotalAnnualCost = async function(statusFilter = 'Active') {
    const query = statusFilter ? { status: statusFilter } : {};
    
    const result = await this.aggregate([
        { $match: query },
        { $group: { 
            _id: null, 
            totalAnnualCost: { $sum: '$compensation.totalAnnualCost' }
        }}
    ]);
    
    return result.length > 0 ? result[0].totalAnnualCost : 0;
};

// Add indexes for common queries
headcountSchema.index({ department: 1, status: 1 });
headcountSchema.index({ employmentType: 1, status: 1 });
headcountSchema.index({ startDate: -1 });
headcountSchema.index({ 'compensation.totalAnnualCost': -1 });

// Create model
const Headcount = mongoose.model('Headcount', headcountSchema);
module.exports = Headcount;