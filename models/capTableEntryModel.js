// models/capTableEntryModel.js - FIXED VERSION
const mongoose = require('mongoose');

const capTableEntrySchema = new mongoose.Schema({
    // --- EXISTING FIELDS FOR MULTI-TENANCY (PRESERVED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a cap table entry.'],
        index: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: [true, 'User ID is required for a cap table entry.'],
        index: true,
    },

    // --- EXISTING CORE FIELDS (PRESERVED) ---
    shareholderName: {
        type: String,
        required: [true, 'Shareholder name is required (e.g., Founder, Investor, ESOP Pool).'],
        trim: true,
        maxlength: [150, 'Shareholder name cannot exceed 150 characters.']
    },
    shareholderType: {
        type: String,
        enum: ['Founder', 'Investor', 'ESOP Pool', 'Employee', 'Advisor', 'Other'],
        required: [true, 'Shareholder type is required.'],
    },
    numberOfShares: {
        type: Number,
        required: function() {
            return this.securityType !== 'SAFE' && this.securityType !== 'Convertible Note';
        },
        min: [0, 'Number of shares cannot be negative.']
    },
    securityType: {
        type: String,
        enum: [
            'Common Stock',
            'Preferred Stock',
            'SAFE',
            'Convertible Note',
            'Option',
            'RSU',
            'Warrant',
            'ESOP Pool Allocation'
        ],
        required: [true, 'Security type is required.'],
    },
    investmentAmount: {
        type: Number,
        min: [0, 'Investment amount cannot be negative.']
    },
    currency: {
        type: String,
        uppercase: true,
        trim: true,
        required: function() { return this.investmentAmount != null && this.investmentAmount > 0; },
        default: 'INR',
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    },
    issueDate: { type: Date },
    grantDate: { type: Date },
    vestingSchedule: {
        type: String,
        trim: true,
        maxlength: [255, 'Vesting schedule description cannot exceed 255 characters.']
    },
    cliffDate: { type: Date },
    exercisePrice: {
        type: Number,
        min: [0, 'Exercise price cannot be negative.']
    },
    notes: {
        type: String,
        trim: true,
        maxlength: [2000, 'Notes cannot exceed 2000 characters.']
    },

    // --- NEW CRITICAL FIELDS FOR FUNDRAISING INTEGRATION ---
    roundId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Round',
        index: true,
        comment: 'Links this cap table entry to a specific funding round'
    },
    investorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Investor',
        index: true,
        comment: 'Links this entry to an investor record (for investor entries)'
    },
    
    // --- CALCULATED VALUE FIELDS ---
    sharePrice: {
        type: Number,
        default: 0,
        min: [0, 'Share price cannot be negative'],
        comment: 'Price paid per share (investmentAmount / numberOfShares)'
    },
    currentValue: {
        type: Number,
        default: 0,
        min: [0, 'Current value cannot be negative'],
        comment: 'Current market value of shares (numberOfShares × current price per share)'
    },
    equityPercentage: {
        type: Number,
        default: 0,
        min: [0, 'Equity percentage cannot be negative'],
        max: [100, 'Equity percentage cannot exceed 100'],
        comment: 'Current ownership percentage (calculated from total outstanding shares)'
    },
    
    // --- FOUNDER SPECIFIC FIELDS ---
    isFounder: {
        type: Boolean,
        default: false,
        index: true,
        comment: 'Quick identification of founder entries'
    },
    originalInvestment: {
        type: Number,
        default: 0,
        min: [0, 'Original investment cannot be negative'],
        comment: 'Original amount invested by founders (for ROI calculations)'
    },
    
    // --- INVESTMENT TRACKING ---
    fullyVested: {
        type: Boolean,
        default: false,
        comment: 'Whether the shares are fully vested (for options/RSUs)'
    },
    vestedShares: {
        type: Number,
        default: 0,
        min: [0, 'Vested shares cannot be negative'],
        comment: 'Number of shares currently vested'
    },
    
    // --- CONVERSION TRACKING (FOR SAFE/CONVERTIBLE NOTES) ---
    conversionDetails: {
        isConverted: {
            type: Boolean,
            default: false,
            comment: 'Whether SAFE/Note has been converted to equity'
        },
        conversionRound: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Round',
            comment: 'Round in which conversion occurred'
        },
        conversionDate: {
            type: Date,
            comment: 'Date of conversion'
        },
        conversionPrice: {
            type: Number,
            comment: 'Price per share at conversion'
        },
        preConversionAmount: {
            type: Number,
            comment: 'Original SAFE/Note amount before conversion'
        }
    },
    
    // --- METADATA ---
    lastValueUpdate: {
        type: Date,
        default: Date.now,
        comment: 'Last time current value was recalculated'
    },
    status: {
        type: String,
        enum: ['Active', 'Exercised', 'Expired', 'Transferred', 'Converted'],
        default: 'Active',
        index: true,
        comment: 'Current status of the equity holding'
    }
}, {
    timestamps: true,
    collection: 'captableentries',
});

// --- ENHANCED PRE-SAVE MIDDLEWARE ---
capTableEntrySchema.pre('save', function(next) {
    try {
        // CALCULATE SHARE PRICE if investment amount and shares are provided
        if (this.investmentAmount > 0 && this.numberOfShares > 0) {
            this.sharePrice = Math.round(this.investmentAmount / this.numberOfShares);
            console.log(`[CAP TABLE] ${this.shareholderName}: Share price calculated as ₹${this.sharePrice.toLocaleString()}`);
        }
        
        // SET FOUNDER FLAG based on shareholder type
        if (this.shareholderType === 'Founder') {
            this.isFounder = true;
            // For founders, original investment is usually the investment amount
            if (this.investmentAmount > 0 && !this.originalInvestment) {
                this.originalInvestment = this.investmentAmount;
            }
        }
        
        // SET CURRENCY from organization if not provided
        if (!this.currency && this.investmentAmount > 0) {
            this.currency = 'INR'; // Default fallback
        }
        
        // VALIDATE VESTED SHARES don't exceed total shares
        if (this.vestedShares > this.numberOfShares) {
            this.vestedShares = this.numberOfShares;
        }
        
        // SET FULLY VESTED FLAG
        if (this.numberOfShares > 0 && this.vestedShares >= this.numberOfShares) {
            this.fullyVested = true;
        }
        
        // UPDATE LAST VALUE UPDATE TIMESTAMP
        if (this.isModified('currentValue')) {
            this.lastValueUpdate = new Date();
        }
        
        next();
        
    } catch (error) {
        console.error(`[CAP TABLE ERROR] Error in pre-save for ${this.shareholderName}:`, error);
        next(error);
    }
});

// --- INSTANCE METHODS ---

/**
 * Calculate current value based on latest round valuation
 * @param {Number} currentPricePerShare - Current market price per share
 */
capTableEntrySchema.methods.updateCurrentValue = function(currentPricePerShare) {
    if (this.numberOfShares > 0 && currentPricePerShare > 0) {
        this.currentValue = Math.round(this.numberOfShares * currentPricePerShare);
        this.lastValueUpdate = new Date();
        
        console.log(`[VALUE UPDATE] ${this.shareholderName}: ${this.numberOfShares} shares × ₹${currentPricePerShare.toLocaleString()} = ₹${this.currentValue.toLocaleString()}`);
        
        return this.save();
    }
    return Promise.resolve(this);
};

/**
 * Calculate equity percentage based on total outstanding shares
 * @param {Number} totalOutstandingShares - Total shares across all shareholders
 */
capTableEntrySchema.methods.updateEquityPercentage = function(totalOutstandingShares) {
    if (this.numberOfShares > 0 && totalOutstandingShares > 0) {
        this.equityPercentage = Math.round((this.numberOfShares / totalOutstandingShares) * 10000) / 100; // Round to 2 decimal places
        
        console.log(`[EQUITY UPDATE] ${this.shareholderName}: ${this.numberOfShares} / ${totalOutstandingShares} = ${this.equityPercentage}%`);
        
        return this.save();
    }
    return Promise.resolve(this);
};

/**
 * Calculate return on investment for this entry
 */
capTableEntrySchema.methods.calculateROI = function() {
    if (this.originalInvestment > 0 && this.currentValue > 0) {
        const roi = ((this.currentValue - this.originalInvestment) / this.originalInvestment) * 100;
        const multiple = this.currentValue / this.originalInvestment;
        
        return {
            roiPercentage: Math.round(roi * 100) / 100,
            multiple: Math.round(multiple * 100) / 100,
            absoluteGain: this.currentValue - this.originalInvestment,
            originalInvestment: this.originalInvestment,
            currentValue: this.currentValue
        };
    }
    
    return {
        roiPercentage: 0,
        multiple: 0,
        absoluteGain: 0,
        originalInvestment: this.originalInvestment || 0,
        currentValue: this.currentValue || 0
    };
};

/**
 * Get formatted display information
 */
capTableEntrySchema.methods.getFormattedInfo = function() {
    const formatCurrency = (amount) => {
        if (!amount || amount === 0) return '₹0';
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
        return `₹${amount.toLocaleString()}`;
    };
    
    return {
        shareholderName: this.shareholderName,
        shareholderType: this.shareholderType,
        shares: this.numberOfShares?.toLocaleString() || '0',
        sharePrice: formatCurrency(this.sharePrice),
        investmentAmount: formatCurrency(this.investmentAmount),
        currentValue: formatCurrency(this.currentValue),
        equityPercentage: `${this.equityPercentage || 0}%`,
        securityType: this.securityType,
        status: this.status,
        roi: this.calculateROI()
    };
};

/**
 * Convert SAFE or Convertible Note to equity
 * @param {Object} conversionParams - Conversion parameters
 */
capTableEntrySchema.methods.convertToEquity = function(conversionParams) {
    const { conversionPrice, conversionRound, conversionDate } = conversionParams;
    
    if (!['SAFE', 'Convertible Note'].includes(this.securityType)) {
        throw new Error('Only SAFE and Convertible Notes can be converted');
    }
    
    // Calculate shares from conversion
    const shares = Math.round(this.investmentAmount / conversionPrice);
    
    // Store original amount
    this.conversionDetails.preConversionAmount = this.investmentAmount;
    this.conversionDetails.isConverted = true;
    this.conversionDetails.conversionRound = conversionRound;
    this.conversionDetails.conversionDate = conversionDate || new Date();
    this.conversionDetails.conversionPrice = conversionPrice;
    
    // Update to equity
    this.securityType = 'Preferred Stock';
    this.numberOfShares = shares;
    this.sharePrice = conversionPrice;
    this.status = 'Converted';
    
    console.log(`[CONVERSION] ${this.shareholderName}: ${this.conversionDetails.preConversionAmount} ${this.securityType} → ${shares} shares at ₹${conversionPrice}/share`);
    
    return this.save();
};

// --- STATIC METHODS - FIXED OBJECTID USAGE ---

/**
 * Calculate total shares outstanding for an organization
 * FIXED: Using 'new' with ObjectId constructor
 */
capTableEntrySchema.statics.getTotalOutstandingShares = function(organizationId) {
    return this.aggregate([
        {
            $match: {
                organization: new mongoose.Types.ObjectId(organizationId), // FIXED: Added 'new'
                status: { $in: ['Active', 'Exercised'] },
                securityType: { $nin: ['SAFE', 'Convertible Note'] } // Exclude unconverted instruments
            }
        },
        {
            $group: {
                _id: null,
                totalShares: { $sum: '$numberOfShares' }
            }
        }
    ]);
};

/**
 * Get cap table summary for an organization
 * FIXED: Using 'new' with ObjectId constructor
 */
capTableEntrySchema.statics.getCapTableSummary = function(organizationId) {
    return this.aggregate([
        {
            $match: {
                organization: new mongoose.Types.ObjectId(organizationId), // FIXED: Added 'new'
                status: { $in: ['Active', 'Exercised'] }
            }
        },
        {
            $group: {
                _id: '$shareholderType',
                totalShares: { $sum: '$numberOfShares' },
                totalInvestment: { $sum: '$investmentAmount' },
                totalCurrentValue: { $sum: '$currentValue' },
                shareholderCount: { $sum: 1 }
            }
        },
        {
            $sort: { totalShares: -1 }
        }
    ]);
};

/**
 * Update all current values based on new price per share
 */
capTableEntrySchema.statics.updateAllCurrentValues = function(organizationId, currentPricePerShare) {
    return this.updateMany(
        {
            organization: organizationId, // No ObjectId conversion needed for updateMany
            numberOfShares: { $gt: 0 },
            status: { $in: ['Active', 'Exercised'] },
            securityType: { $nin: ['SAFE', 'Convertible Note'] }
        },
        [
            {
                $set: {
                    currentValue: { $multiply: ['$numberOfShares', currentPricePerShare] },
                    lastValueUpdate: new Date()
                }
            }
        ]
    );
};

/**
 * Update all equity percentages based on total outstanding shares
 */
capTableEntrySchema.statics.updateAllEquityPercentages = function(organizationId, totalOutstandingShares) {
    return this.updateMany(
        {
            organization: organizationId, // No ObjectId conversion needed for updateMany
            numberOfShares: { $gt: 0 },
            status: { $in: ['Active', 'Exercised'] },
            securityType: { $nin: ['SAFE', 'Convertible Note'] }
        },
        [
            {
                $set: {
                    equityPercentage: {
                        $round: [
                            { $multiply: [{ $divide: ['$numberOfShares', totalOutstandingShares] }, 100] },
                            2
                        ]
                    }
                }
            }
        ]
    );
};

// Add these methods to your capTableEntryModel.js file

/**
 * Get formatted information for display
 */
capTableEntrySchema.methods.getFormattedInfo = function() {
    try {
        const formatCurrency = (amount) => {
            if (!amount) return '₹0';
            if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
            if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
            return `₹${amount.toLocaleString()}`;
        };

        return {
            shareholderName: this.shareholderName,
            shareholderType: this.shareholderType,
            securityType: this.securityType,
            numberOfShares: this.numberOfShares?.toLocaleString() || '0',
            investmentAmount: formatCurrency(this.investmentAmount),
            currentValue: formatCurrency(this.currentValue),
            sharePrice: this.sharePrice ? `₹${this.sharePrice.toLocaleString()}` : '₹0',
            equityPercentage: this.equityPercentage ? `${this.equityPercentage.toFixed(4)}%` : '0%',
            grantDate: this.grantDate ? this.grantDate.toISOString().split('T')[0] : null,
            issueDate: this.issueDate ? this.issueDate.toISOString().split('T')[0] : null,
            status: this.status || 'Active'
        };
    } catch (error) {
        console.error('Error formatting cap table entry info:', error);
        return {
            shareholderName: this.shareholderName || 'Unknown',
            shareholderType: this.shareholderType || 'Unknown',
            securityType: this.securityType || 'Unknown',
            numberOfShares: '0',
            investmentAmount: '₹0',
            currentValue: '₹0',
            sharePrice: '₹0',
            equityPercentage: '0%'
        };
    }
};

/**
 * Calculate ROI (Return on Investment)
 */
capTableEntrySchema.methods.calculateROI = function() {
    try {
        if (!this.investmentAmount || this.investmentAmount <= 0) {
            return null;
        }

        const currentValue = this.currentValue || this.investmentAmount;
        const roi = ((currentValue - this.investmentAmount) / this.investmentAmount) * 100;
        
        return {
            originalInvestment: this.investmentAmount,
            currentValue: currentValue,
            absoluteGain: currentValue - this.investmentAmount,
            percentageGain: Math.round(roi * 100) / 100,
            multiple: Math.round((currentValue / this.investmentAmount) * 100) / 100
        };
    } catch (error) {
        console.error('Error calculating ROI for cap table entry:', error);
        return null;
    }
};

/**
 * Pre-save middleware to calculate derived fields
 */
capTableEntrySchema.pre('save', function(next) {
    try {
        // Calculate share price if we have investment amount and shares
        if (this.investmentAmount && this.numberOfShares && this.numberOfShares > 0) {
            this.sharePrice = this.investmentAmount / this.numberOfShares;
            
            // Initially, current value equals investment amount
            if (!this.currentValue) {
                this.currentValue = this.investmentAmount;
            }
        }

        // Set default status
        if (!this.status) {
            this.status = 'Active';
        }

        // Set issue date if grant date is provided but issue date isn't
        if (this.grantDate && !this.issueDate) {
            this.issueDate = this.grantDate;
        }

        next();
    } catch (error) {
        console.error('Error in cap table entry pre-save middleware:', error);
        next(error);
    }
});

// --- EXISTING INDEXES (PRESERVED) ---
capTableEntrySchema.index({ organization: 1 });
capTableEntrySchema.index({ organization: 1, shareholderName: 1 });
capTableEntrySchema.index({ organization: 1, securityType: 1 });

// --- NEW INDEXES FOR ENHANCED FUNCTIONALITY ---
capTableEntrySchema.index({ organization: 1, roundId: 1 });
capTableEntrySchema.index({ organization: 1, investorId: 1 });
capTableEntrySchema.index({ organization: 1, isFounder: 1 });
capTableEntrySchema.index({ organization: 1, status: 1 });
capTableEntrySchema.index({ organization: 1, lastValueUpdate: -1 });
capTableEntrySchema.index({ organization: 1, shareholderType: 1, status: 1 });

// --- VIRTUAL FIELDS ---
capTableEntrySchema.virtual('isEquity').get(function() {
    return ['Common Stock', 'Preferred Stock'].includes(this.securityType);
});

capTableEntrySchema.virtual('isUnconvertedInstrument').get(function() {
    return ['SAFE', 'Convertible Note'].includes(this.securityType) && !this.conversionDetails?.isConverted;
});

capTableEntrySchema.virtual('effectiveOwnership').get(function() {
    // For vesting securities, return percentage based on vested shares
    if (this.vestedShares > 0 && this.vestedShares < this.numberOfShares) {
        return Math.round((this.vestedShares / this.numberOfShares) * this.equityPercentage * 100) / 100;
    }
    return this.equityPercentage;
});

// Ensure virtual fields are included in JSON output
capTableEntrySchema.set('toJSON', { virtuals: true });
capTableEntrySchema.set('toObject', { virtuals: true });

const CapTableEntry = mongoose.model('CapTableEntry', capTableEntrySchema);
module.exports = CapTableEntry;