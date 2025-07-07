// models/investorModel.js - COMPLETE FIXED VERSION WITH NULL SAFETY
const mongoose = require('mongoose');

// Enhanced trancheSchema - With calculation capabilities
const trancheSchema = new mongoose.Schema({
    _id: false, // To prevent sub-document IDs if not needed
    trancheNumber: { type: Number, required: true },
    agreedAmount: { type: Number, required: true },
    receivedAmount: { type: Number, default: 0 },
    dateAgreed: { type: Date },
    dateReceived: { type: Date },
    triggerCondition: { type: String, trim: true },
    status: {
        type: String,
        enum: ['Pending', 'Partially Received', 'Fully Received', 'Cancelled'],
        default: 'Pending',
    },
    
    // --- NEW CALCULATION FIELDS FOR TRANCHES ---
    sharesAllocated: {
        type: Number,
        default: 0,
        min: [0, 'Shares allocated cannot be negative'],
        comment: 'Shares allocated for this specific tranche'
    },
    sharePrice: {
        type: Number,
        default: 0,
        min: [0, 'Share price cannot be negative'],
        comment: 'Price per share for this tranche (calculated from round price)'
    },
    equityPercentage: {
        type: Number,
        default: 0,
        min: [0, 'Equity percentage cannot be negative'],
        comment: 'Equity percentage for this tranche'
    },
    capTableEntryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CapTableEntry',
        comment: 'Reference to cap table entry created for this tranche'
    },
    
    // --- PAYMENT TRACKING ---
    paymentMethod: {
        type: String,
        enum: ['Wire Transfer', 'Check', 'ACH', 'Digital Payment', 'Other'],
        comment: 'Method of payment received'
    },
    transactionReference: {
        type: String,
        trim: true,
        comment: 'Bank transaction reference or check number'
    },
    notes: {
        type: String,
        trim: true,
        comment: 'Tranche-specific notes'
    }
});

// Enhanced investorSchema - With equity calculation capabilities
const investorSchema = new mongoose.Schema({
    // --- EXISTING FIELDS FOR MULTI-TENANCY (PRESERVED) ---
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization ID is required for an investor record.'],
        index: true,
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HorizonUser',
        required: [true, 'User ID of the person adding the investor is required.'],
    },

    // --- EXISTING CORE FIELDS (PRESERVED) ---
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    entityName: { type: String, trim: true },
    investorType: {
        type: String,
        enum: ['Angel', 'VC Firm', 'Corporate VC', 'Family Office', 'Accelerator', 'Incubator', 'Individual', 'Other'],
        trim: true,
    },
    investmentVehicle: {
        type: String,
        enum: ['SAFE', 'Convertible Note', 'Equity', 'Other'],
    },
    safeValuationCap: { type: Number, min: 0 },
    safeDiscountRate: { type: Number, min: 0, max: 1 },
    noteInterestRate: { type: Number, min: 0 },
    noteMaturityDate: { type: Date },
    totalCommittedAmount: { type: Number, default: 0, min: 0 },
    totalReceivedAmount: { type: Number, default: 0, min: 0 },
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', required: true, index: true },
    tranches: { type: [trancheSchema], default: [] }, // ✅ FIX: Ensure default empty array
    status: {
        type: String,
        enum: ['Lead', 'Contacted', 'Introduced', 'Pitched', 'Follow-up', 'Negotiating', 'Soft Committed', 'Hard Committed', 'Invested', 'Declined', 'Passed', 'On Hold'],
        default: 'Introduced',
        index: true,
    },
    notes: { type: String, trim: true },

    // --- NEW EQUITY CALCULATION FIELDS ---
    equityPercentageAllocated: {
        type: Number,
        default: 0,
        min: [0, 'Equity percentage cannot be negative'],
        max: [100, 'Equity percentage cannot exceed 100'],
        comment: 'Total equity percentage allocated to this investor'
    },
    sharesAllocated: {
        type: Number,
        default: 0,
        min: [0, 'Shares allocated cannot be negative'],
        comment: 'Total shares allocated to this investor'
    },
    sharesReceived: {
        type: Number,
        default: 0,
        min: [0, 'Shares received cannot be negative'],
        comment: 'Actual shares received based on payments made'
    },
    averageSharePrice: {
        type: Number,
        default: 0,
        min: [0, 'Average share price cannot be negative'],
        comment: 'Weighted average price paid per share'
    },
    
    // --- CONVERSION DETAILS (FOR SAFE/CONVERTIBLE NOTES) ---
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
        convertedShares: {
            type: Number,
            comment: 'Number of shares received upon conversion'
        }
    },
    
    // --- INVESTMENT PROGRESS TRACKING ---
    investmentProgress: {
        percentageReceived: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
            comment: 'Percentage of committed amount actually received'
        },
        tranchesCompleted: {
            type: Number,
            default: 0,
            min: 0,
            comment: 'Number of tranches fully received'
        },
        totalTranches: {
            type: Number,
            default: 0,
            min: 0,
            comment: 'Total number of planned tranches'
        },
        lastPaymentDate: {
            type: Date,
            comment: 'Date of most recent payment received'
        },
        nextExpectedPayment: {
            amount: {
                type: Number,
                min: 0,
                comment: 'Expected amount of next payment'
            },
            expectedDate: {
                type: Date,
                comment: 'Expected date of next payment'
            }
        }
    },
    
    // --- RELATIONSHIP TRACKING ---
    relationshipHistory: [{
        date: {
            type: Date,
            required: true
        },
        status: {
            type: String,
            required: true
        },
        notes: {
            type: String,
            trim: true
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser'
        }
    }],
    
    // --- METADATA ---
    lastCalculatedAt: {
        type: Date,
        default: Date.now,
        comment: 'Last time equity calculations were performed'
    },
    currency: {
        type: String,
        uppercase: true,
        trim: true,
        default: 'INR',
        enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'],
        comment: 'Currency for all monetary amounts'
    }
}, {
    timestamps: true,
    collection: 'investors',
});

// ✅ FIX: Helper function to safely access tranches
function safeTranches(tranches) {
    return Array.isArray(tranches) ? tranches : [];
}

// --- ENHANCED PRE-SAVE MIDDLEWARE WITH NULL SAFETY ---
investorSchema.pre('save', function(next) {
    try {
        // ✅ FIX: Ensure tranches is always an array
        if (!Array.isArray(this.tranches)) {
            this.tranches = [];
        }
        
        // ✅ FIX: Ensure totalReceivedAmount is always calculated from tranches
        this.totalReceivedAmount = safeTranches(this.tranches).reduce((sum, t) => sum + (t.receivedAmount || 0), 0);
        
        // ✅ FIX: Ensure sharesReceived is always calculated from tranches
        this.sharesReceived = safeTranches(this.tranches).reduce((sum, t) => sum + (t.sharesAllocated || 0), 0);
        
        // ✅ FIX: Recalculate average share price if we have shares
        if (this.sharesReceived > 0 && this.totalReceivedAmount > 0) {
            this.averageSharePrice = this.totalReceivedAmount / this.sharesReceived;
        }
        
        // Calculate investment progress
        if (this.totalCommittedAmount > 0) {
            this.investmentProgress.percentageReceived = Math.round((this.totalReceivedAmount / this.totalCommittedAmount) * 100);
        }
        
        // Count completed tranches
        this.investmentProgress.tranchesCompleted = safeTranches(this.tranches).filter(t => t.status === 'Fully Received').length;
        this.investmentProgress.totalTranches = safeTranches(this.tranches).length;
        
        // Find last payment date
        const receivedTranches = safeTranches(this.tranches).filter(t => t.dateReceived);
        if (receivedTranches.length > 0) {
            this.investmentProgress.lastPaymentDate = new Date(Math.max(...receivedTranches.map(t => new Date(t.dateReceived))));
        }
        
        // Calculate next expected payment
        const pendingTranches = safeTranches(this.tranches).filter(t => t.status === 'Pending').sort((a, b) => a.trancheNumber - b.trancheNumber);
        if (pendingTranches.length > 0) {
            this.investmentProgress.nextExpectedPayment.amount = pendingTranches[0].agreedAmount;
        }
        
        // Track relationship status changes
        if (this.isModified('status') && !this.isNew) {
            this.relationshipHistory.push({
                date: new Date(),
                status: this.status,
                notes: `Status changed to ${this.status}`,
                updatedBy: this.addedBy
            });
        }
        
        // Update calculation timestamp if equity-related fields changed
        if (this.isModified('totalReceivedAmount') || this.isModified('equityPercentageAllocated') || 
            this.isModified('sharesAllocated') || this.isModified('tranches')) {
            this.lastCalculatedAt = new Date();
        }
        
        console.log(`[INVESTOR SAVE] ${this.name}: ₹${this.totalReceivedAmount.toLocaleString()} received, ${this.sharesReceived} shares`);
        
        next();
        
    } catch (error) {
        console.error(`[INVESTOR ERROR] Error in pre-save for ${this.name}:`, error);
        next(error);
    }
});

// --- INSTANCE METHODS ---

/**
 * Calculate equity allocation based on round valuation - CORRECTED VERSION
 * ✅ FIX: More robust calculation with better error handling
 */
investorSchema.methods.calculateEquityAllocation = async function() {
    if (!this.roundId) {
        throw new Error('Investor must be associated with a round');
    }
    
    if (!this.totalCommittedAmount || this.totalCommittedAmount <= 0) {
        console.log(`[EQUITY CALC] ${this.name}: No committed amount to allocate`);
        return {
            sharesAllocated: 0,
            equityPercentage: 0,
            sharePrice: 0,
            totalValue: 0
        };
    }
    
    const Round = mongoose.model('Round');
    const round = await Round.findById(this.roundId);
    
    if (!round) {
        throw new Error('Associated round not found');
    }
    
    if (!round.pricePerShare || round.pricePerShare <= 0) {
        throw new Error('Round price per share not properly set');
    }
    
    if (!round.totalSharesOutstanding || round.totalSharesOutstanding <= 0) {
        throw new Error('Round total shares outstanding not properly set');
    }
    
    // Calculate total shares based on FIXED round price
    const totalShares = Math.round(this.totalCommittedAmount / round.pricePerShare);
    const equityPercentage = round.totalSharesOutstanding > 0 ? 
        (totalShares / round.totalSharesOutstanding) * 100 : 0;
    
    // Update investor allocation
    this.sharesAllocated = totalShares;
    this.equityPercentageAllocated = Math.round(equityPercentage * 100) / 100; // Round to 2 decimal places
    this.averageSharePrice = round.pricePerShare; // FIXED price from round
    
    console.log(`[EQUITY CALCULATION] ${this.name}:`);
    console.log(`  - Commitment: ₹${this.totalCommittedAmount.toLocaleString()}`);
    console.log(`  - Price: ₹${round.pricePerShare.toLocaleString()}/share`);
    console.log(`  - Allocated Shares: ${totalShares.toLocaleString()}`);
    console.log(`  - Equity %: ${this.equityPercentageAllocated}%`);
    
    return {
        sharesAllocated: this.sharesAllocated,
        equityPercentage: this.equityPercentageAllocated,
        sharePrice: this.averageSharePrice,
        totalValue: this.totalCommittedAmount
    };
};

/**
 * Process a tranche payment and update equity - CORRECTED VERSION
 * ✅ FIX: Calculate shares immediately and update investor totals
 */
investorSchema.methods.processTranchePayment = async function(trancheId, amountReceived, paymentDetails = {}) {
    // ✅ FIX: Ensure tranches is an array
    if (!Array.isArray(this.tranches)) {
        this.tranches = [];
    }
    
    const tranche = this.tranches.id(trancheId);
    if (!tranche) {
        throw new Error('Tranche not found');
    }
    
    console.log(`[TRANCHE START] Processing ₹${amountReceived.toLocaleString()} payment for ${this.name} T${tranche.trancheNumber}`);
    
    // Store previous amount for calculation
    const previousReceivedAmount = tranche.receivedAmount || 0;
    const paymentIncrease = amountReceived - previousReceivedAmount;
    
    // Update tranche payment details
    tranche.receivedAmount = amountReceived;
    tranche.dateReceived = new Date();
    tranche.paymentMethod = paymentDetails.paymentMethod || 'Wire Transfer';
    tranche.transactionReference = paymentDetails.transactionReference || '';
    tranche.notes = paymentDetails.notes || '';
    
    // Update tranche status
    if (amountReceived >= tranche.agreedAmount) {
        tranche.status = 'Fully Received';
    } else if (amountReceived > 0) {
        tranche.status = 'Partially Received';
    } else {
        tranche.status = 'Pending';
    }
    
    // ✅ FIX: Get round information and calculate shares IMMEDIATELY
    const Round = mongoose.model('Round');
    const round = await Round.findById(this.roundId);
    
    if (!round) {
        throw new Error('Associated round not found');
    }
    
    if (!round.pricePerShare || round.pricePerShare <= 0) {
        throw new Error('Round price per share not set');
    }
    
    // Calculate shares for this specific tranche payment
    const sharesPurchased = Math.round(amountReceived / round.pricePerShare);
    const previousShares = tranche.sharesAllocated || 0;
    const shareIncrease = sharesPurchased - previousShares;
    
    // Update tranche with calculated shares using FIXED round price
    tranche.sharesAllocated = sharesPurchased;
    tranche.sharePrice = round.pricePerShare; // FIXED price from round
    tranche.equityPercentage = round.totalSharesOutstanding > 0 ? 
        (sharesPurchased / round.totalSharesOutstanding) * 100 : 0;
    
    // ✅ FIX: Update investor totals BEFORE saving
    this.totalReceivedAmount = safeTranches(this.tranches).reduce((sum, t) => sum + (t.receivedAmount || 0), 0);
    this.sharesReceived = safeTranches(this.tranches).reduce((sum, t) => sum + (t.sharesAllocated || 0), 0);
    
    // Calculate weighted average share price
    if (this.sharesReceived > 0) {
        this.averageSharePrice = this.totalReceivedAmount / this.sharesReceived;
    } else {
        this.averageSharePrice = round.pricePerShare;
    }
    
    // Update equity percentage based on total shares
    this.equityPercentageAllocated = round.totalSharesOutstanding > 0 ? 
        (this.sharesReceived / round.totalSharesOutstanding) * 100 : 0;
    
    // Update overall investor status if appropriate
    if ((this.status === 'Soft Committed' || this.status === 'Hard Committed') && this.totalReceivedAmount > 0) {
        this.status = 'Invested';
    }
    
    console.log(`[TRANCHE CALCULATED] ${this.name} T${tranche.trancheNumber}:`);
    console.log(`  - Payment: ₹${amountReceived.toLocaleString()} (increase: ₹${paymentIncrease.toLocaleString()})`);
    console.log(`  - Shares: ${sharesPurchased.toLocaleString()} (increase: ${shareIncrease})`);
    console.log(`  - Price: ₹${round.pricePerShare.toLocaleString()}/share`);
    console.log(`  - Total investor received: ₹${this.totalReceivedAmount.toLocaleString()}`);
    console.log(`  - Total investor shares: ${this.sharesReceived.toLocaleString()}`);
    console.log(`  - Average price: ₹${this.averageSharePrice.toFixed(2)}/share`);
    
    return this.save();
};

/**
 * Create or update cap table entry for this investor - CORRECTED VERSION
 * ✅ FIX: Removes blocking conditions and ensures proper linking
 */
investorSchema.methods.createCapTableEntry = async function() {
    // ✅ FIX: Only check for received amount, allow creation even with 0 shares initially
    if (!this.totalReceivedAmount || this.totalReceivedAmount <= 0) {
        console.log(`[CAP TABLE] ${this.name}: No payment received yet (₹${this.totalReceivedAmount || 0})`);
        return null;
    }
    
    console.log(`[CAP TABLE START] Creating/updating entry for ${this.name}: ₹${this.totalReceivedAmount.toLocaleString()}, ${this.sharesReceived || 0} shares`);
    
    const CapTableEntry = mongoose.model('CapTableEntry');
    
    // ✅ FIX: Search using linkedInvestorId for proper connection
    let capTableEntry = await CapTableEntry.findOne({
        organization: this.organization,
        linkedInvestorId: this._id,
        roundId: this.roundId
    });
    
    // Calculate final values for cap table
    const finalShares = this.sharesReceived || 0;
    const finalInvestmentAmount = this.totalReceivedAmount;
    const finalSharePrice = this.averageSharePrice || 0;
    const finalCurrentValue = finalInvestmentAmount; // During round, current value = investment amount
    
    // Determine security type based on investment vehicle
    const securityType = this.investmentVehicle === 'Equity' ? 'Preferred Stock' : 
                        this.investmentVehicle === 'SAFE' ? 'SAFE' :
                        this.investmentVehicle === 'Convertible Note' ? 'Convertible Note' : 
                        'Preferred Stock';
    
    if (capTableEntry) {
        // Update existing entry
        console.log(`[CAP TABLE] Updating existing entry for ${this.name}`);
        
        capTableEntry.numberOfShares = finalShares;
        capTableEntry.investmentAmount = finalInvestmentAmount;
        capTableEntry.sharePrice = finalSharePrice;
        capTableEntry.currentValue = finalCurrentValue;
        capTableEntry.securityType = securityType;
        capTableEntry.equityPercentage = this.equityPercentageAllocated;
        
        // Update issue date to latest payment date
        const latestPaymentDate = safeTranches(this.tranches)
            .filter(t => t.dateReceived)
            .sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived))[0]?.dateReceived;
        
        if (latestPaymentDate) {
            capTableEntry.issueDate = latestPaymentDate;
        }
        
        await capTableEntry.save();
        console.log(`[CAP TABLE] ✅ Updated entry for ${this.name}: ${finalShares} shares, ₹${finalInvestmentAmount.toLocaleString()}`);
        
    } else {
        // Create new entry
        console.log(`[CAP TABLE] Creating new entry for ${this.name}`);
        
        // Get the latest payment date for issue date
        const latestPaymentDate = safeTranches(this.tranches)
            .filter(t => t.dateReceived)
            .sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived))[0]?.dateReceived || new Date();
        
        capTableEntry = new CapTableEntry({
            organization: this.organization,
            user: this.addedBy,
            linkedInvestorId: this._id, // ✅ FIX: Proper investor linking
            roundId: this.roundId,
            shareholderName: this.name,
            shareholderType: 'Investor',
            numberOfShares: finalShares,
            securityType: securityType,
            investmentAmount: finalInvestmentAmount,
            sharePrice: finalSharePrice,
            currentValue: finalCurrentValue,
            equityPercentage: this.equityPercentageAllocated,
            issueDate: latestPaymentDate,
            grantDate: latestPaymentDate,
            currency: this.currency || 'INR',
            notes: `${this.investmentVehicle} investment - ${safeTranches(this.tranches).length} tranche(s)`,
            status: 'Active'
        });
        
        await capTableEntry.save();
        console.log(`[CAP TABLE] ✅ Created entry for ${this.name}: ${finalShares} shares, ₹${finalInvestmentAmount.toLocaleString()}`);
    }
    
    return capTableEntry;
};

/**
 * Get comprehensive investment summary - ENHANCED VERSION WITH NULL SAFETY
 * ✅ FIX: More detailed and accurate reporting
 */
investorSchema.methods.getInvestmentSummary = function() {
    // ✅ FIX: Ensure tranches is always an array
    const tranches = safeTranches(this.tranches);
    
    const totalTranches = tranches.length;
    const fullyReceivedTranches = tranches.filter(t => t.status === 'Fully Received').length;
    const pendingTranches = tranches.filter(t => t.status === 'Pending').length;
    const partialTranches = tranches.filter(t => t.status === 'Partially Received').length;
    
    const totalAgreed = tranches.reduce((sum, t) => sum + (t.agreedAmount || 0), 0);
    const totalReceived = tranches.reduce((sum, t) => sum + (t.receivedAmount || 0), 0);
    const totalPending = totalAgreed - totalReceived;
    
    const totalSharesFromTranches = tranches.reduce((sum, t) => sum + (t.sharesAllocated || 0), 0);
    
    // Calculate progress percentages
    const paymentProgress = totalAgreed > 0 ? (totalReceived / totalAgreed) * 100 : 0;
    const trancheProgress = totalTranches > 0 ? (fullyReceivedTranches / totalTranches) * 100 : 0;
    
    return {
        // Financial Summary
        totalCommittedAmount: this.totalCommittedAmount || 0,
        totalReceivedAmount: totalReceived,
        totalPendingAmount: totalPending,
        paymentProgress: Math.round(paymentProgress * 100) / 100,
        
        // Tranche Summary
        totalTranches,
        fullyReceivedTranches,
        partiallyReceivedTranches: partialTranches,
        pendingTranches,
        trancheProgress: Math.round(trancheProgress * 100) / 100,
        
        // Equity Summary
        sharesAllocated: this.sharesAllocated || 0,
        sharesReceived: totalSharesFromTranches,
        equityPercentageAllocated: this.equityPercentageAllocated || 0,
        averageSharePrice: this.averageSharePrice || 0,
        
        // Status Information
        investmentStatus: this.status,
        investmentVehicle: this.investmentVehicle,
        isFullyInvested: totalReceived >= (this.totalCommittedAmount || 0),
        hasPartialPayments: partialTranches > 0,
        
        // Value Information
        currentValue: totalReceived, // During round, current value = amount invested
        
        // Recent Activity
        lastPaymentDate: tranches
            .filter(t => t.dateReceived)
            .sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived))[0]?.dateReceived,
        
        // Next Actions
        nextTranchesDue: tranches
            .filter(t => t.status === 'Pending' && t.agreedAmount > 0)
            .sort((a, b) => a.trancheNumber - b.trancheNumber)
            .slice(0, 3)
            .map(t => ({
                trancheNumber: t.trancheNumber,
                agreedAmount: t.agreedAmount,
                triggerCondition: t.triggerCondition
            }))
    };
};

/**
 * Convert SAFE or Convertible Note to equity
 */
investorSchema.methods.convertToEquity = async function(conversionRound, conversionPrice) {
    if (!['SAFE', 'Convertible Note'].includes(this.investmentVehicle)) {
        throw new Error('Only SAFE and Convertible Notes can be converted');
    }
    
    // Calculate conversion price based on instrument type
    let finalConversionPrice = conversionPrice;
    
    if (this.investmentVehicle === 'SAFE') {
        // SAFE conversion: min(valuation cap, discount to round price)
        const capPrice = this.safeValuationCap ? this.totalReceivedAmount / (this.safeValuationCap * (this.equityPercentageAllocated / 100)) : Infinity;
        const discountPrice = this.safeDiscountRate ? conversionPrice * (1 - this.safeDiscountRate) : conversionPrice;
        finalConversionPrice = Math.min(capPrice, discountPrice, conversionPrice);
    }
    
    // Calculate shares from conversion
    const convertedShares = Math.round(this.totalReceivedAmount / finalConversionPrice);
    
    // Update conversion details
    this.conversionDetails.isConverted = true;
    this.conversionDetails.conversionRound = conversionRound._id;
    this.conversionDetails.conversionDate = new Date();
    this.conversionDetails.conversionPrice = finalConversionPrice;
    this.conversionDetails.convertedShares = convertedShares;
    
    // Update investor details
    this.investmentVehicle = 'Equity';
    this.sharesReceived = convertedShares;
    this.averageSharePrice = finalConversionPrice;
    this.status = 'Invested';
    
    console.log(`[CONVERSION] ${this.name}: ${this.totalReceivedAmount} SAFE/Note → ${convertedShares} shares at ₹${finalConversionPrice}/share`);
    
    // Create/update cap table entry
    await this.createCapTableEntry();
    
    return this.save();
};

// --- STATIC METHODS - FIXED OBJECTID USAGE ---

/**
 * Get aggregated investor statistics for a round
 * FIXED: Using 'new' with ObjectId constructor
 */
investorSchema.statics.getRoundInvestorStats = function(roundId) {
    return this.aggregate([
        { $match: { roundId: new mongoose.Types.ObjectId(roundId) } }, // FIXED
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalCommitted: { $sum: '$totalCommittedAmount' },
                totalReceived: { $sum: '$totalReceivedAmount' },
                avgCommitment: { $avg: '$totalCommittedAmount' }
            }
        },
        { $sort: { totalCommitted: -1 } }
    ]);
};

/**
 * Find investors needing follow-up
 */
investorSchema.statics.findInvestorsNeedingFollowUp = function(organizationId, daysThreshold = 7) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);
    
    return this.find({
        organization: organizationId,
        status: { $in: ['Contacted', 'Pitched', 'Follow-up', 'Negotiating'] },
        $or: [
            { 'investmentProgress.lastPaymentDate': { $lt: thresholdDate } },
            { 'investmentProgress.lastPaymentDate': { $exists: false } }
        ]
    }).populate('roundId', 'name status');
};

// --- EXISTING INDEXES (PRESERVED) ---
investorSchema.index({ organization: 1, name: 1 }, { collation: { locale: 'en', strength: 2 } });
investorSchema.index({ organization: 1, entityName: 1 }, { collation: { locale: 'en', strength: 2 } });
investorSchema.index({ organization: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $exists: true, $ne: null, $ne: "" } } });
investorSchema.index({ organization: 1, status: 1 });
investorSchema.index({ organization: 1, roundId: 1 });

// --- NEW INDEXES FOR ENHANCED FUNCTIONALITY ---
investorSchema.index({ organization: 1, investmentVehicle: 1 });
investorSchema.index({ organization: 1, 'investmentProgress.percentageReceived': -1 });
investorSchema.index({ organization: 1, lastCalculatedAt: -1 });
investorSchema.index({ organization: 1, 'conversionDetails.isConverted': 1 });
investorSchema.index({ roundId: 1, status: 1 });

// --- VIRTUAL FIELDS WITH NULL SAFETY ---
investorSchema.virtual('isFullyInvested').get(function() {
    const totalReceived = safeTranches(this.tranches).reduce((sum, t) => sum + (t.receivedAmount || 0), 0);
    return totalReceived >= (this.totalCommittedAmount || 0);
});

investorSchema.virtual('remainingCommitment').get(function() {
    const totalReceived = safeTranches(this.tranches).reduce((sum, t) => sum + (t.receivedAmount || 0), 0);
    return Math.max(0, (this.totalCommittedAmount || 0) - totalReceived);
});

investorSchema.virtual('isConvertibleInstrument').get(function() {
    return ['SAFE', 'Convertible Note'].includes(this.investmentVehicle);
});

investorSchema.virtual('pendingTranches').get(function() {
    return safeTranches(this.tranches).filter(t => t.status === 'Pending' || t.status === 'Partially Received');
});

// Ensure virtual fields are included in JSON output
investorSchema.set('toJSON', { virtuals: true });
investorSchema.set('toObject', { virtuals: true });

const Investor = mongoose.models.Investor || mongoose.model('Investor', investorSchema);
module.exports = Investor;