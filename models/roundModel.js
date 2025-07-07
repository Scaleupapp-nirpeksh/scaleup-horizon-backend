// models/roundModel.js - FIXED VERSION
const mongoose = require('mongoose');

// Enhanced roundSchema - With calculation capabilities added (non-breaking)
const roundSchema = new mongoose.Schema({
    // --- EXISTING FIELDS FOR MULTI-TENANCY (PRESERVED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for a funding round.'],
        index: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: [true, 'User ID of the creator is required for a funding round.'],
    },

    // --- EXISTING USER FIELDS (PRESERVED EXACTLY) ---
    name: { type: String, required: true, trim: true }, // e.g., "Pre-Seed FFF"
    targetAmount: { type: Number, required: true, min: [0, 'Target amount cannot be negative.'] },
    currency: {
        type: String,
        uppercase: true,
        trim: true,
        required: [true, 'Currency is required for the funding round.'],
        default: 'INR',
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    },
    currentValuationPreMoney: { type: Number, min: 0 },
    currentValuationPostMoney: { type: Number, min: 0 },
    softCommitmentsTotal: { type: Number, default: 0, min: 0 },
    hardCommitmentsTotal: { type: Number, default: 0, min: 0 },
    totalFundsReceived: { type: Number, default: 0, min: 0 },
    openDate: { type: Date, default: Date.now },
    targetCloseDate: { type: Date },
    actualCloseDate: { type: Date },
    status: {
        type: String,
        enum: ['Planning', 'Open', 'Closing', 'Closed', 'On Hold', 'Cancelled'],
        default: 'Planning',
        index: true,
    },
    roundType: {
        type: String,
        enum: ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Bridge', 'Angel', 'Debt', 'Grant', 'Other'],
        trim: true,
    },
    notes: { type: String, trim: true },

    // --- NEW CALCULATION FIELDS (NON-BREAKING ADDITIONS) ---
    equityPercentageOffered: {
        type: Number,
        default: 0,
        min: [0, 'Equity percentage cannot be negative'],
        max: [100, 'Equity percentage cannot exceed 100'],
        comment: 'Percentage of equity being offered in this round'
    },
    totalSharesOutstanding: {
        type: Number,
        default: 0,
        min: [0, 'Total shares cannot be negative'],
        comment: 'Total shares outstanding after this round completes'
    },
    pricePerShare: {
        type: Number,
        default: 0,
        min: [0, 'Price per share cannot be negative'],
        comment: 'Fixed price per share for this round (calculated from post-money / total shares)'
    },
    sharesAllocatedThisRound: {
        type: Number,
        default: 0,
        min: [0, 'Shares allocated cannot be negative'],
        comment: 'New shares being issued in this round to investors'
    },
    existingSharesPreRound: {
        type: Number,
        default: 0,
        min: [0, 'Existing shares cannot be negative'],
        comment: 'Shares outstanding before this round (typically founder shares)'
    },
    
    // --- CALCULATION METADATA ---
    lastCalculatedAt: {
        type: Date,
        default: Date.now,
        comment: 'Timestamp of last valuation calculation'
    },
    calculationMethod: {
        type: String,
        enum: ['post_money_driven', 'pre_money_driven', 'manual', 'post_money_driven_corrected'],
        default: 'post_money_driven_corrected',
        comment: 'Method used for calculating valuations and share prices'
    },
    
    // --- PROGRESS TRACKING ---
    fundingProgress: {
        percentageComplete: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
            comment: 'Percentage of target amount raised'
        },
        investorCount: {
            type: Number,
            default: 0,
            min: 0,
            comment: 'Number of investors who have invested in this round'
        },
        lastInvestmentDate: {
            type: Date,
            comment: 'Date of most recent investment received'
        }
    }
}, {
    timestamps: true,
    collection: 'rounds',
});

// --- ENHANCED PRE-SAVE MIDDLEWARE ---
roundSchema.pre('save', function(next) {
    try {
        // EXISTING VALIDATION LOGIC - PRESERVED EXACTLY
        if (this.isModified('currentValuationPreMoney') || this.isModified('totalFundsReceived')) {
            if (this.currentValuationPreMoney != null && this.totalFundsReceived != null) {
                // Original commented logic preserved as-is
                // this.currentValuationPostMoney = this.currentValuationPreMoney + this.totalFundsReceived;
                // This calculation might be better handled in a controller or service after an investment is logged.
            }
        }
        
        if (this.openDate && this.targetCloseDate && this.openDate > this.targetCloseDate) {
            return next(new Error('Round open date cannot be after the target close date.'));
        }
        
        if (this.targetCloseDate && this.actualCloseDate && this.targetCloseDate > this.actualCloseDate && this.status === 'Closed') {
            // Just a note, not an error - round closed earlier than targeted.
        }

        // CORRECTED ENHANCED CALCULATION LOGIC
        if (this.isModified('targetAmount') || this.isModified('equityPercentageOffered') || 
            this.isModified('existingSharesPreRound') || this.isNew) {
            
            // AUTO-CALCULATE POST-MONEY VALUATION if target amount and equity percentage provided
            if (this.targetAmount > 0 && this.equityPercentageOffered > 0) {
                // CORRECTED Core Formula: Post-money = Target Amount ÷ Equity Percentage
                this.currentValuationPostMoney = Math.round(this.targetAmount / (this.equityPercentageOffered / 100));
                
                // Pre-money = Post-money - Target Amount
                this.currentValuationPreMoney = this.currentValuationPostMoney - this.targetAmount;
                
                console.log(`[ROUND CALCULATION] ${this.name}: CORRECTED calculation`);
                console.log(`- Target: ₹${(this.targetAmount/10000000).toFixed(2)}Cr for ${this.equityPercentageOffered}%`);
                console.log(`- Post-money: ₹${(this.currentValuationPostMoney/10000000).toFixed(2)}Cr`);
                console.log(`- Pre-money: ₹${(this.currentValuationPreMoney/10000000).toFixed(2)}Cr`);
            }
            
            // AUTO-CALCULATE SHARE STRUCTURE if we have existing shares and valuations
            if (this.existingSharesPreRound > 0 && this.currentValuationPostMoney > 0 && this.equityPercentageOffered > 0) {
                // CORRECTED Formula: Total shares = existing shares ÷ (remaining equity percentage)
                const remainingEquityPercentage = (100 - this.equityPercentageOffered) / 100;
                this.totalSharesOutstanding = Math.round(this.existingSharesPreRound / remainingEquityPercentage);
                
                // Calculate new shares to be issued to investors
                this.sharesAllocatedThisRound = this.totalSharesOutstanding - this.existingSharesPreRound;
                
                // Calculate fixed price per share for this round
                this.pricePerShare = Math.round(this.currentValuationPostMoney / this.totalSharesOutstanding);
                
                console.log(`[SHARE CALCULATION] ${this.name}: CORRECTED share structure`);
                console.log(`- Existing shares: ${this.existingSharesPreRound.toLocaleString()} (${(100-this.equityPercentageOffered)}%)`);
                console.log(`- Total shares: ${this.totalSharesOutstanding.toLocaleString()}`);
                console.log(`- New shares: ${this.sharesAllocatedThisRound.toLocaleString()} (${this.equityPercentageOffered}%)`);
                console.log(`- FIXED Price: ₹${this.pricePerShare.toLocaleString()}/share`);
            }
        }
        
        // UPDATE CALCULATION METADATA
        if (this.isModified('targetAmount') || this.isModified('equityPercentageOffered') || 
            this.isModified('currentValuationPostMoney') || this.isModified('existingSharesPreRound')) {
            this.lastCalculatedAt = new Date();
        }
        
        // UPDATE FUNDING PROGRESS
        if (this.isModified('totalFundsReceived') || this.isModified('targetAmount')) {
            if (this.targetAmount > 0) {
                this.fundingProgress.percentageComplete = Math.min(100, Math.round((this.totalFundsReceived / this.targetAmount) * 100));
            }
        }
        
        next();
        
    } catch (error) {
        console.error(`[ROUND ERROR] Error in ${this.name} pre-save calculations:`, error);
        next(error);
    }
});

// --- INSTANCE METHODS ---

/**
 * Manually trigger recalculation of all financial metrics
 * CORRECTED: Only recalculates funding progress, not valuations
 */
roundSchema.methods.recalculateMetrics = function() {
    console.log(`[RECALCULATION] Triggering metrics recalculation for round: ${this.name}`);
    
    // Update calculation timestamp
    this.lastCalculatedAt = new Date();
    
    // CORRECTED: Only force recalculation of funding progress, not valuations
    this.markModified('totalFundsReceived');
    
    return this.save();
};

/**
 * Get human-readable formatted valuation information
 */
roundSchema.methods.getFormattedValuation = function() {
    const formatCurrency = (amount) => {
        if (!amount || amount === 0) return '₹0';
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
        return `₹${amount.toLocaleString()}`;
    };
    
    return {
        preMoney: formatCurrency(this.currentValuationPreMoney || 0),
        postMoney: formatCurrency(this.currentValuationPostMoney || 0),
        targetAmount: formatCurrency(this.targetAmount || 0),
        totalFundsReceived: formatCurrency(this.totalFundsReceived || 0),
        pricePerShare: `₹${(this.pricePerShare || 0).toLocaleString()}`,
        remainingToRaise: formatCurrency((this.targetAmount || 0) - (this.totalFundsReceived || 0))
    };
};

/**
 * Get comprehensive progress summary for dashboard
 */
roundSchema.methods.getProgressSummary = function() {
    const remainingAmount = Math.max(0, (this.targetAmount || 0) - (this.totalFundsReceived || 0));
    const remainingShares = Math.max(0, (this.sharesAllocatedThisRound || 0) - this.getAllocatedShares());
    
    return {
        financial: {
            targetAmount: this.targetAmount || 0,
            raisedAmount: this.totalFundsReceived || 0,
            remainingAmount: remainingAmount,
            percentageComplete: this.fundingProgress?.percentageComplete || 0
        },
        equity: {
            equityOffered: this.equityPercentageOffered || 0,
            sharesAvailable: this.sharesAllocatedThisRound || 0,
            sharesRemaining: remainingShares,
            pricePerShare: this.pricePerShare || 0
        },
        metrics: {
            investorCount: this.fundingProgress?.investorCount || 0,
            lastInvestmentDate: this.fundingProgress?.lastInvestmentDate,
            daysOpen: this.openDate ? Math.floor((Date.now() - this.openDate.getTime()) / (1000 * 60 * 60 * 24)) : 0,
            daysToTarget: this.targetCloseDate ? Math.floor((this.targetCloseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
        }
    };
};

/**
 * Helper method to calculate shares already allocated to investors
 * This would need to query the investor/cap table collections
 */
roundSchema.methods.getAllocatedShares = function() {
    // This is a placeholder - in implementation, this would aggregate
    // shares from cap table entries or investor records for this round
    return 0;
};

/**
 * Validate that round is properly configured for accepting investments
 */
roundSchema.methods.validateReadyForInvestors = function() {
    const errors = [];
    const warnings = [];
    
    // Critical validations
    if (!this.targetAmount || this.targetAmount <= 0) {
        errors.push('Target amount must be greater than 0');
    }
    
    if (!this.equityPercentageOffered || this.equityPercentageOffered <= 0) {
        errors.push('Equity percentage offered must be greater than 0');
    }
    
    if (!this.existingSharesPreRound || this.existingSharesPreRound <= 0) {
        errors.push('Existing shares before round must be specified');
    }
    
    if (!this.pricePerShare || this.pricePerShare <= 0) {
        errors.push('Price per share must be calculated (check target amount and equity percentage)');
    }
    
    // Warning validations
    if (!this.openDate) {
        warnings.push('Open date not set');
    }
    
    if (!this.targetCloseDate) {
        warnings.push('Target close date not set');
    }
    
    if (this.status === 'Planning') {
        warnings.push('Round status is still in Planning - consider updating to Open');
    }
    
    return {
        isValid: errors.length === 0,
        isComplete: errors.length === 0 && warnings.length === 0,
        errors: errors,
        warnings: warnings
    };
};

/**
 * Calculate the impact of a potential investment
 * CORRECTED: Uses fixed price per share
 */
roundSchema.methods.previewInvestmentImpact = function(investmentAmount) {
    if (!this.pricePerShare || this.pricePerShare <= 0) {
        throw new Error('Round must have valid price per share to preview investment impact');
    }
    
    // CORRECTED: Uses fixed round price
    const shares = Math.round(investmentAmount / this.pricePerShare);
    const equityPercentage = this.totalSharesOutstanding > 0 ? (shares / this.totalSharesOutstanding) * 100 : 0;
    const newFundsReceived = (this.totalFundsReceived || 0) + investmentAmount;
    const newProgressPercentage = this.targetAmount > 0 ? (newFundsReceived / this.targetAmount) * 100 : 0;
    
    return {
        investmentAmount: investmentAmount,
        sharesAllocated: shares,
        equityPercentage: Math.round(equityPercentage * 100) / 100, // Round to 2 decimal places
        newTotalRaised: newFundsReceived,
        newProgressPercentage: Math.min(100, Math.round(newProgressPercentage * 100) / 100),
        remainingToRaise: Math.max(0, this.targetAmount - newFundsReceived),
        // CORRECTED: Valuations don't change
        postMoneyValuation: this.currentValuationPostMoney,
        pricePerShare: this.pricePerShare,
        valuationImpact: 'No change - fixed valuation during round'
    };
};

// --- STATIC METHODS - FIXED OBJECTID USAGE ---

/**
 * Find rounds that need calculation updates
 */
roundSchema.statics.findRoundsNeedingCalculation = function(organizationId) {
    return this.find({
        organization: organizationId,
        $or: [
            { lastCalculatedAt: { $exists: false } },
            { pricePerShare: { $lte: 0 } },
            { totalSharesOutstanding: { $lte: 0 } },
            { equityPercentageOffered: { $lte: 0 } }
        ]
    });
};

/**
 * Get aggregated statistics for an organization's rounds
 * FIXED: Using 'new' with ObjectId constructor
 */
roundSchema.statics.getOrganizationRoundStats = function(organizationId) {
    return this.aggregate([
        { $match: { organization: new mongoose.Types.ObjectId(organizationId) } }, // FIXED
        {
            $group: {
                _id: '$organization',
                totalRounds: { $sum: 1 },
                totalTargetAmount: { $sum: '$targetAmount' },
                totalFundsReceived: { $sum: '$totalFundsReceived' },
                avgValuation: { $avg: '$currentValuationPostMoney' },
                openRounds: {
                    $sum: {
                        $cond: [{ $eq: ['$status', 'Open'] }, 1, 0]
                    }
                }
            }
        }
    ]);
};

// --- EXISTING INDEXES (PRESERVED) ---
roundSchema.index({ organization: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
roundSchema.index({ organization: 1, status: 1 });
roundSchema.index({ organization: 1, openDate: -1 });
roundSchema.index({ organization: 1, roundType: 1 });

// --- NEW INDEXES FOR ENHANCED FUNCTIONALITY ---
roundSchema.index({ organization: 1, lastCalculatedAt: -1 });
roundSchema.index({ organization: 1, 'fundingProgress.percentageComplete': -1 });
roundSchema.index({ organization: 1, equityPercentageOffered: 1 });

// --- VIRTUAL FIELDS ---
roundSchema.virtual('isFullyFunded').get(function() {
    return (this.totalFundsReceived || 0) >= (this.targetAmount || 0);
});

roundSchema.virtual('remainingFunding').get(function() {
    return Math.max(0, (this.targetAmount || 0) - (this.totalFundsReceived || 0));
});

roundSchema.virtual('isActive').get(function() {
    return ['Open', 'Closing'].includes(this.status);
});

roundSchema.virtual('daysOpen').get(function() {
    if (!this.openDate) return 0;
    return Math.floor((Date.now() - this.openDate.getTime()) / (1000 * 60 * 60 * 24));
});

// Ensure virtual fields are included in JSON output
roundSchema.set('toJSON', { virtuals: true });
roundSchema.set('toObject', { virtuals: true });

// Create and export the model
const Round = mongoose.models.Round || mongoose.model('Round', roundSchema);
module.exports = Round;