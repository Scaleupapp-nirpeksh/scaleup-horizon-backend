// services/fundraisingCalculationService.js - COMPLETE FIXED VERSION
const mongoose = require('mongoose');
const Round = require('../models/roundModel');
const Investor = require('../models/investorModel');
const CapTableEntry = require('../models/capTableEntryModel');

/**
 * Comprehensive Fundraising Calculation Service
 * Handles all financial calculations, equity allocations, and cross-model updates
 * for the fundraising workflow with CORRECTED CALCULATION LOGIC
 */
class FundraisingCalculationService {
    
    /**
     * Initialize a new funding round with proper calculations
     * CORRECTED: Post-money = Target Amount ÷ Equity Percentage (not Pre-money + Target)
     * @param {Object} roundData - Round creation data
     * @param {Number} roundData.targetAmount - Amount to raise
     * @param {Number} roundData.equityPercentageOffered - Equity % to give away
     * @param {Number} roundData.existingSharesPreRound - Current founder shares
     * @param {String} organizationId - Organization ID
     * @param {String} userId - User creating the round
     */
    static async initializeRound(roundData, organizationId, userId) {
        console.log(`[ROUND INIT] Starting round initialization for ${roundData.name}`);
        console.log(`[ROUND INIT] Target: ₹${(roundData.targetAmount/10000000).toFixed(2)}Cr for ${roundData.equityPercentageOffered}% equity`);
        
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            // Validate required calculation inputs
            if (!roundData.targetAmount || roundData.targetAmount <= 0) {
                throw new Error('Target amount must be greater than 0');
            }
            
            if (!roundData.equityPercentageOffered || roundData.equityPercentageOffered <= 0) {
                throw new Error('Equity percentage offered must be greater than 0');
            }
            
            if (!roundData.existingSharesPreRound || roundData.existingSharesPreRound <= 0) {
                throw new Error('Existing shares before round must be specified');
            }
            
            // CORRECTED CALCULATION LOGIC
            // 1. Post-money Valuation = Target Amount ÷ Equity Percentage
            const postMoneyValuation = Math.round(roundData.targetAmount / (roundData.equityPercentageOffered / 100));
            
            // 2. Pre-money Valuation = Post-money - Target Amount
            const preMoneyValuation = postMoneyValuation - roundData.targetAmount;
            
            // 3. Total shares after funding = Existing shares ÷ (100 - Equity %) 
            const remainingEquityPercentage = (100 - roundData.equityPercentageOffered) / 100;
            const totalSharesAfterFunding = Math.round(roundData.existingSharesPreRound / remainingEquityPercentage);
            
            // 4. New shares to issue = Total shares - Existing shares
            const newSharesToIssue = totalSharesAfterFunding - roundData.existingSharesPreRound;
            
            // 5. Price per share = Post-money valuation ÷ Total shares
            const pricePerShare = Math.round(postMoneyValuation / totalSharesAfterFunding);
            
            console.log(`[CALCULATION] Corrected fundraising math:`);
            console.log(`- Post-money: ₹${(postMoneyValuation/10000000).toFixed(2)}Cr`);
            console.log(`- Pre-money: ₹${(preMoneyValuation/10000000).toFixed(2)}Cr`);
            console.log(`- Total shares: ${totalSharesAfterFunding.toLocaleString()}`);
            console.log(`- New shares: ${newSharesToIssue.toLocaleString()}`);
            console.log(`- Price/share: ₹${pricePerShare.toLocaleString()}`);
            
            // Create round with corrected calculation fields
            const round = new Round({
                organization: organizationId,
                createdBy: userId,
                ...roundData,
                // Override with corrected calculations
                currentValuationPostMoney: postMoneyValuation,
                currentValuationPreMoney: preMoneyValuation,
                totalSharesOutstanding: totalSharesAfterFunding,
                sharesAllocatedThisRound: newSharesToIssue,
                pricePerShare: pricePerShare,
                calculationMethod: 'post_money_driven_corrected'
            });
            
            // Save round
            await round.save({ session });
            
            // Validate calculations were successful
            const validation = round.validateReadyForInvestors();
            if (!validation.isValid) {
                throw new Error(`Round calculation failed: ${validation.errors.join(', ')}`);
            }
            
            console.log(`[ROUND INIT] ${round.name} initialized with corrected calculations`);
            
            await session.commitTransaction();
            return round;
            
        } catch (error) {
            await session.abortTransaction();
            console.error(`[ROUND INIT ERROR] Failed to initialize round:`, error);
            throw error;
        } finally {
            session.endSession();
        }
    }
    
    /**
     * Add investor to a round with equity allocation calculation
     * CORRECTED: Uses fixed price per share from round
     * @param {Object} investorData - Investor data
     * @param {String} roundId - Round ID
     * @param {String} organizationId - Organization ID
     * @param {String} userId - User adding investor
     */
    static async addInvestorToRound(investorData, roundId, organizationId, userId) {
        console.log(`[INVESTOR ADD] Adding ${investorData.name} with ₹${(investorData.totalCommittedAmount/10000000).toFixed(2)}Cr commitment`);
        
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            // Get round information
            const round = await Round.findOne({ 
                _id: roundId, 
                organization: organizationId 
            }).session(session);
            
            if (!round) {
                throw new Error('Round not found');
            }
            
            // Validate round is ready for investors
            const validation = round.validateReadyForInvestors();
            if (!validation.isValid) {
                throw new Error(`Round not ready for investors: ${validation.errors.join(', ')}`);
            }
            
            // Create investor record
            const investor = new Investor({
                organization: organizationId,
                addedBy: userId,
                roundId: roundId,
                ...investorData
            });
            
            // CORRECTED: Calculate equity allocation using fixed round price
            const sharesAllocated = Math.round(investor.totalCommittedAmount / round.pricePerShare);
            const equityPercentage = round.totalSharesOutstanding > 0 ? 
                (sharesAllocated / round.totalSharesOutstanding) * 100 : 0;
            
            // Set calculated values
            investor.sharesAllocated = sharesAllocated;
            investor.equityPercentageAllocated = Math.round(equityPercentage * 100) / 100;
            investor.averageSharePrice = round.pricePerShare;
            
            console.log(`[EQUITY CALC] ${investor.name}:`);
            console.log(`- Commitment: ₹${investor.totalCommittedAmount.toLocaleString()}`);
            console.log(`- Shares allocated: ${sharesAllocated.toLocaleString()}`);
            console.log(`- Equity percentage: ${investor.equityPercentageAllocated}%`);
            console.log(`- Fixed price: ₹${round.pricePerShare.toLocaleString()}/share`);
            
            // Save investor
            await investor.save({ session });
            
            await session.commitTransaction();
            return investor;
            
        } catch (error) {
            await session.abortTransaction();
            console.error(`[INVESTOR ADD ERROR] Failed to add investor:`, error);
            throw error;
        } finally {
            session.endSession();
        }
    }
    
    /**
     * Process tranche payment and update all related calculations
     * ✅ CORRECTED: Integrates with fixed investor model methods
     * @param {String} investorId - Investor ID
     * @param {String} trancheId - Tranche ID (MongoDB ObjectId as string)
     * @param {Number} amountReceived - Amount actually received
     * @param {Object} paymentDetails - Payment details
     * @param {String} organizationId - Organization ID
     */
    static async processTranchePayment(investorId, trancheId, amountReceived, paymentDetails, organizationId) {
        console.log(`[PAYMENT SERVICE START] Processing ₹${amountReceived.toLocaleString()} for investor ${investorId}, tranche ${trancheId}`);
        
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            // Validate inputs
            if (!investorId || !trancheId || !amountReceived || amountReceived <= 0) {
                throw new Error('Invalid payment parameters');
            }
            
            // Get investor with session
            const investor = await Investor.findOne({
                _id: investorId,
                organization: organizationId
            }).session(session);
            
            if (!investor) {
                throw new Error('Investor not found');
            }
            
            // Get associated round
            const round = await Round.findById(investor.roundId).session(session);
            if (!round) {
                throw new Error('Associated round not found');
            }
            
            if (!round.pricePerShare || round.pricePerShare <= 0) {
                throw new Error('Round price per share not set');
            }
            
            // Find the specific tranche
            const tranche = investor.tranches.id(trancheId);
            if (!tranche) {
                throw new Error('Tranche not found');
            }
            
            // Store previous state for calculations
            const previousReceivedAmount = investor.totalReceivedAmount || 0;
            const previousShares = investor.sharesReceived || 0;
            
            console.log(`[PAYMENT STATE] Before processing:`);
            console.log(`  - Investor total received: ₹${previousReceivedAmount.toLocaleString()}`);
            console.log(`  - Investor total shares: ${previousShares.toLocaleString()}`);
            console.log(`  - Tranche ${tranche.trancheNumber} current: ₹${tranche.receivedAmount || 0}`);
            
            // ✅ STEP 1: Process the tranche payment (this updates all investor totals)
            await investor.processTranchePayment(trancheId, amountReceived, paymentDetails);
            
            // ✅ STEP 2: Save investor with updated calculations
            await investor.save({ session });
            
            // ✅ STEP 3: Update round totals
            const paymentIncrease = investor.totalReceivedAmount - previousReceivedAmount;
            round.totalFundsReceived = (round.totalFundsReceived || 0) + paymentIncrease;
            
            // Update round progress
            round.fundingProgress = round.fundingProgress || {};
            round.fundingProgress.lastInvestmentDate = new Date();
            
            // Count unique investors who have made payments
            const investorsWithPayments = await Investor.countDocuments({
                roundId: round._id,
                organization: organizationId,
                totalReceivedAmount: { $gt: 0 }
            }).session(session);
            round.fundingProgress.investorCount = investorsWithPayments;
            
            // Calculate funding progress percentage
            const fundingProgress = round.targetAmount > 0 ? 
                (round.totalFundsReceived / round.targetAmount) * 100 : 0;
            round.fundingProgress.percentageComplete = Math.min(100, Math.round(fundingProgress * 100) / 100);
            
            await round.save({ session });
            
            // ✅ STEP 4: Create or update cap table entry
            let capTableEntry = null;
            try {
                capTableEntry = await investor.createCapTableEntry();
                console.log(`[CAP TABLE RESULT] ${capTableEntry ? 'Success' : 'Skipped'} for ${investor.name}`);
            } catch (capTableError) {
                console.error(`[CAP TABLE ERROR] Failed to create entry for ${investor.name}:`, capTableError.message);
                // Don't fail the entire transaction for cap table issues, but log them
            }
            
            // ✅ STEP 5: Update all cap table current values (with same round price)
            try {
                await this.updateAllCapTableValues(organizationId, round.pricePerShare, session);
            } catch (updateError) {
                console.error(`[CAP TABLE UPDATE ERROR]`, updateError.message);
                // Don't fail the transaction for global updates
            }
            
            // Commit the transaction
            await session.commitTransaction();
            
            // Calculate results for response
            const sharesPurchased = investor.sharesReceived - previousShares;
            const newTotalRaised = round.totalFundsReceived;
            
            console.log(`[PAYMENT COMPLETE] ${investor.name} T${tranche.trancheNumber}:`);
            console.log(`  - Payment processed: ₹${amountReceived.toLocaleString()}`);
            console.log(`  - Shares purchased: ${sharesPurchased.toLocaleString()}`);
            console.log(`  - Total investor received: ₹${investor.totalReceivedAmount.toLocaleString()}`);
            console.log(`  - Total investor shares: ${investor.sharesReceived.toLocaleString()}`);
            console.log(`  - Round total raised: ₹${newTotalRaised.toLocaleString()}`);
            console.log(`  - Cap table entry: ${capTableEntry ? 'Created/Updated' : 'Skipped'}`);
            console.log(`  - Valuation UNCHANGED: ₹${(round.currentValuationPostMoney/10000000).toFixed(2)}Cr`);
            
            return {
                success: true,
                investor: investor,
                round: round,
                tranche: tranche,
                capTableEntry: capTableEntry,
                sharesPurchased: sharesPurchased,
                newTotalRaised: newTotalRaised,
                paymentIncrease: paymentIncrease,
                fundingProgress: round.fundingProgress.percentageComplete,
                valuationChanged: false // Valuation never changes during a round
            };
            
        } catch (error) {
            await session.abortTransaction();
            console.error(`[PAYMENT ERROR] Failed to process payment for ${investorId}:`, error.message);
            throw error;
        } finally {
            session.endSession();
        }
    }
    
    /**
     * Create or update cap table entry for an investor - ENHANCED VERSION
     * ✅ CORRECTED: Uses investor's own method for consistency
     * @param {Object} investor - Investor document
     * @param {Object} session - MongoDB session
     */
    static async updateCapTableForInvestor(investor, session) {
        console.log(`[CAP TABLE SERVICE] Processing cap table for ${investor.name}`);
        
        if (!investor.totalReceivedAmount || investor.totalReceivedAmount <= 0) {
            console.log(`[CAP TABLE SERVICE] ${investor.name}: No payment received yet`);
            return null;
        }
        
        try {
            // Use the investor's own method for consistency with the fixed model
            const capTableEntry = await investor.createCapTableEntry();
            
            if (capTableEntry) {
                console.log(`[CAP TABLE SERVICE] ✅ ${investor.name}: Entry ${capTableEntry.isNew ? 'created' : 'updated'}`);
            } else {
                console.log(`[CAP TABLE SERVICE] ⚠️  ${investor.name}: Entry creation skipped`);
            }
            
            return capTableEntry;
            
        } catch (error) {
            console.error(`[CAP TABLE SERVICE ERROR] ${investor.name}:`, error.message);
            // Return null instead of throwing to prevent transaction rollback
            return null;
        }
    }
    
    /**
     * Update current values for all cap table entries based on latest price
     * ✅ CORRECTED: Enhanced session handling and proper ObjectId usage
     * @param {String} organizationId - Organization ID
     * @param {Number} currentPricePerShare - Current price per share
     * @param {Object} session - MongoDB session (optional)
     */
    static async updateAllCapTableValues(organizationId, currentPricePerShare, session = null) {
        console.log(`[CAP TABLE VALUES] Updating all entries for org ${organizationId} at ₹${currentPricePerShare.toLocaleString()}/share`);
        
        try {
            // Handle session options properly - check if session is valid
            const sessionOptions = {};
            if (session && typeof session === 'object' && session.id) {
                sessionOptions.session = session;
            }
            
            const query = {
                organization: new mongoose.Types.ObjectId(organizationId),
                numberOfShares: { $gt: 0 },
                status: { $in: ['Active', 'Exercised'] },
                securityType: { $nin: ['SAFE', 'Convertible Note'] } // Don't update unconverted instruments
            };
            
            const updateOperation = [
                {
                    $set: {
                        currentValue: { $multiply: ['$numberOfShares', currentPricePerShare] },
                        lastValueUpdate: new Date()
                    }
                }
            ];
            
            const result = await CapTableEntry.updateMany(
                query,
                updateOperation,
                sessionOptions
            );
            
            console.log(`[CAP TABLE VALUES] ✅ Updated ${result.modifiedCount} entries`);
            
            // Update equity percentages (these do change as new shares are issued)
            await this.updateAllEquityPercentages(organizationId, session);
            
            return result;
            
        } catch (error) {
            console.error(`[CAP TABLE VALUES ERROR]`, error.message);
            throw error;
        }
    }
    
    /**
     * Update equity percentages for all cap table entries
     * ✅ FIXED: Corrected ObjectId usage and session handling
     * @param {String} organizationId - Organization ID  
     * @param {Object} session - MongoDB session (optional)
     */
    static async updateAllEquityPercentages(organizationId, session = null) {
        console.log(`[EQUITY PERCENTAGES] Recalculating for organization ${organizationId}`);
        
        try {
            // Handle session options properly
            const sessionOptions = {};
            if (session && typeof session === 'object' && session.id) {
                sessionOptions.session = session;
            }
            
            // Get total outstanding shares (FIXED: Added 'new' for ObjectId and proper session handling)
            const totalSharesResult = await CapTableEntry.aggregate([
                {
                    $match: {
                        organization: new mongoose.Types.ObjectId(organizationId),
                        status: { $in: ['Active', 'Exercised'] },
                        numberOfShares: { $gt: 0 }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalShares: { $sum: '$numberOfShares' }
                    }
                }
            ], sessionOptions);
            
            const totalShares = totalSharesResult[0]?.totalShares || 0;
            
            if (totalShares <= 0) {
                console.log(`[EQUITY PERCENTAGES] No shares found for organization`);
                return;
            }
            
            // Update each entry's equity percentage
            const entries = await CapTableEntry.find({
                organization: organizationId,
                status: { $in: ['Active', 'Exercised'] },
                numberOfShares: { $gt: 0 }
            }, null, sessionOptions);
            
            let updatedCount = 0;
            
            for (const entry of entries) {
                const equityPercentage = (entry.numberOfShares / totalShares) * 100;
                entry.equityPercentage = Math.round(equityPercentage * 10000) / 10000; // Round to 4 decimal places
                await entry.save(sessionOptions);
                updatedCount++;
            }
            
            console.log(`[EQUITY PERCENTAGES] ✅ Updated ${updatedCount} entries with total ${totalShares.toLocaleString()} shares`);
            
        } catch (error) {
            console.error(`[EQUITY PERCENTAGES ERROR]`, error.message);
            throw error;
        }
    }
    
    /**
     * Bulk process multiple tranche payments - ENHANCED METHOD
     * ✅ NEW: Process multiple payments efficiently with proper rollback
     * @param {Array} payments - Array of payment objects
     * @param {String} organizationId - Organization ID
     * @returns {Object} Bulk processing results
     */
    static async processBulkTranchePayments(payments, organizationId) {
        console.log(`[BULK PAYMENT] Processing ${payments.length} payments for organization ${organizationId}`);
        
        const results = {
            successful: [],
            failed: [],
            totalProcessed: 0,
            totalAmount: 0,
            totalShares: 0
        };
        
        // Process each payment individually to maintain data integrity
        for (const payment of payments) {
            try {
                const result = await this.processTranchePayment(
                    payment.investorId,
                    payment.trancheId,
                    payment.amountReceived,
                    payment.paymentDetails || {},
                    organizationId
                );
                
                results.successful.push({
                    investorId: payment.investorId,
                    trancheId: payment.trancheId,
                    amount: payment.amountReceived,
                    shares: result.sharesPurchased,
                    result: result
                });
                
                results.totalAmount += payment.amountReceived;
                results.totalShares += result.sharesPurchased;
                
            } catch (paymentError) {
                console.error(`[BULK PAYMENT ERROR] Failed payment for ${payment.investorId}:`, paymentError.message);
                
                results.failed.push({
                    investorId: payment.investorId,
                    trancheId: payment.trancheId,
                    amount: payment.amountReceived,
                    error: paymentError.message
                });
            }
            
            results.totalProcessed++;
        }
        
        console.log(`[BULK PAYMENT COMPLETE] Processed ${results.totalProcessed} payments:`);
        console.log(`  - Successful: ${results.successful.length}`);
        console.log(`  - Failed: ${results.failed.length}`);
        console.log(`  - Total amount: ₹${results.totalAmount.toLocaleString()}`);
        console.log(`  - Total shares: ${results.totalShares.toLocaleString()}`);
        
        return results;
    }
    
    /**
     * Recalculate all metrics for a round (use when data integrity issues occur)
     * ✅ CORRECTED: Maintains fixed valuations and prices
     * @param {String} roundId - Round ID
     * @param {String} organizationId - Organization ID
     */
    static async recalculateRoundMetrics(roundId, organizationId) {
        console.log(`[ROUND RECALC] Recalculating metrics for round ${roundId} (valuations stay fixed)`);
        
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            // Get round
            const round = await Round.findOne({ 
                _id: roundId, 
                organization: organizationId 
            }).session(session);
            
            if (!round) {
                throw new Error('Round not found');
            }
            
            // Get all investors for this round
            const investors = await Investor.find({ 
                roundId: roundId, 
                organization: organizationId 
            }).session(session);
            
            // Recalculate round totals from investors
            let totalFundsReceived = 0;
            let investorCount = 0;
            let lastInvestmentDate = null;
            
            for (const investor of investors) {
                totalFundsReceived += investor.totalReceivedAmount || 0;
                
                if (investor.totalReceivedAmount > 0) {
                    investorCount++;
                    
                    if (investor.investmentProgress?.lastPaymentDate) {
                        if (!lastInvestmentDate || investor.investmentProgress.lastPaymentDate > lastInvestmentDate) {
                            lastInvestmentDate = investor.investmentProgress.lastPaymentDate;
                        }
                    }
                }
                
                // CORRECTED: Recalculate investor equity using FIXED round price
                if (round.pricePerShare > 0) {
                    const correctShares = Math.round(investor.totalCommittedAmount / round.pricePerShare);
                    const correctEquity = round.totalSharesOutstanding > 0 ? 
                        (correctShares / round.totalSharesOutstanding) * 100 : 0;
                    
                    investor.sharesAllocated = correctShares;
                    investor.equityPercentageAllocated = Math.round(correctEquity * 100) / 100;
                    investor.averageSharePrice = round.pricePerShare; // FIXED price
                    
                    await investor.save({ session });
                }
                
                // Update cap table entry
                await this.updateCapTableForInvestor(investor, session);
            }
            
            // Update round metrics (NO valuation changes)
            round.totalFundsReceived = totalFundsReceived;
            round.fundingProgress = round.fundingProgress || {};
            round.fundingProgress.investorCount = investorCount;
            round.fundingProgress.lastInvestmentDate = lastInvestmentDate;
            
            // CORRECTED: Do NOT trigger recalculation that changes valuations
            // Only update funding progress
            if (round.targetAmount > 0) {
                round.fundingProgress.percentageComplete = Math.min(100, 
                    Math.round((totalFundsReceived / round.targetAmount) * 100));
            }
            
            await round.save({ session });
            
            // Update all cap table equity percentages (values stay the same)
            await this.updateAllEquityPercentages(organizationId, session);
            
            console.log(`[ROUND RECALC] Completed recalculation (valuations preserved):`);
            console.log(`- Total raised: ₹${totalFundsReceived.toLocaleString()}`);
            console.log(`- Investor count: ${investorCount}`);
            console.log(`- Progress: ${round.fundingProgress.percentageComplete}%`);
            console.log(`- Post-money UNCHANGED: ₹${(round.currentValuationPostMoney/10000000).toFixed(2)}Cr`);
            console.log(`- Price/share UNCHANGED: ₹${round.pricePerShare.toLocaleString()}`);
            
            await session.commitTransaction();
            
            return {
                round: round,
                totalInvestors: investors.length,
                activeInvestors: investorCount,
                totalRaised: totalFundsReceived,
                valuationPreserved: true
            };
            
        } catch (error) {
            await session.abortTransaction();
            console.error(`[ROUND RECALC ERROR] Failed to recalculate round metrics:`, error);
            throw error;
        } finally {
            session.endSession();
        }
    }
    
    /**
     * Get comprehensive fundraising dashboard data
     * ✅ FIXED: Corrected ObjectId usage in aggregations
     * @param {String} organizationId - Organization ID
     */
    static async getFundraisingDashboard(organizationId) {
        try {
            console.log(`[DASHBOARD] Generating fundraising dashboard for org ${organizationId}`);
            
            // Get all rounds for organization
            const rounds = await Round.find({ 
                organization: organizationId 
            }).sort({ openDate: -1 });
            
            // Get round statistics (FIXED: Added 'new' for ObjectId)
            const roundStats = await Round.aggregate([
                { $match: { organization: new mongoose.Types.ObjectId(organizationId) } }, // FIXED
                {
                    $group: {
                        _id: null,
                        totalRounds: { $sum: 1 },
                        totalTargetAmount: { $sum: '$targetAmount' },
                        totalFundsReceived: { $sum: '$totalFundsReceived' },
                        avgValuation: { $avg: '$currentValuationPostMoney' },
                        openRounds: {
                            $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] }
                        },
                        closedRounds: {
                            $sum: { $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0] }
                        }
                    }
                }
            ]);
            
            // Get investor statistics (FIXED: Added 'new' for ObjectId)
            const investorStats = await Investor.aggregate([
                { $match: { organization: new mongoose.Types.ObjectId(organizationId) } }, // FIXED
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        totalCommitted: { $sum: '$totalCommittedAmount' },
                        totalReceived: { $sum: '$totalReceivedAmount' }
                    }
                }
            ]);
            
            // Get cap table summary (FIXED: Added 'new' for ObjectId)
            const capTableStats = await CapTableEntry.aggregate([
                { 
                    $match: { 
                        organization: new mongoose.Types.ObjectId(organizationId), // FIXED
                        status: { $in: ['Active', 'Exercised'] }
                    } 
                },
                {
                    $group: {
                        _id: '$shareholderType',
                        totalShares: { $sum: '$numberOfShares' },
                        totalValue: { $sum: '$currentValue' },
                        shareholderCount: { $sum: 1 }
                    }
                },
                { $sort: { totalShares: -1 } }
            ]);
            
            const stats = roundStats[0] || {};
            
            return {
                overview: {
                    totalRounds: stats.totalRounds || 0,
                    openRounds: stats.openRounds || 0,
                    closedRounds: stats.closedRounds || 0,
                    totalTargetAmount: stats.totalTargetAmount || 0,
                    totalFundsReceived: stats.totalFundsReceived || 0,
                    averageValuation: stats.avgValuation || 0,
                    overallProgress: stats.totalTargetAmount > 0 ? 
                        (stats.totalFundsReceived / stats.totalTargetAmount) * 100 : 0
                },
                rounds: rounds.map(round => ({
                    ...round.toObject(),
                    formattedValuation: round.getFormattedValuation ? round.getFormattedValuation() : null,
                    progressSummary: round.getProgressSummary ? round.getProgressSummary() : null
                })),
                investorStats: investorStats,
                capTableStats: capTableStats,
                generatedAt: new Date()
            };
            
        } catch (error) {
            console.error(`[DASHBOARD ERROR] Failed to generate dashboard:`, error);
            throw error;
        }
    }
    
    /**
     * Preview investment impact before actual investment
     * ✅ CORRECTED: Uses fixed round price, not dynamic valuations
     * @param {String} roundId - Round ID
     * @param {Number} investmentAmount - Proposed investment amount
     * @param {String} organizationId - Organization ID
     */
    static async previewInvestmentImpact(roundId, investmentAmount, organizationId) {
        try {
            const round = await Round.findOne({ 
                _id: roundId, 
                organization: organizationId 
            });
            
            if (!round) {
                throw new Error('Round not found');
            }
            
            // Calculate preview using fixed round price
            const sharesPurchased = Math.round(investmentAmount / round.pricePerShare);
            const equityPercentage = round.totalSharesOutstanding > 0 ? 
                (sharesPurchased / round.totalSharesOutstanding) * 100 : 0;
            
            return {
                investmentAmount,
                sharesPurchased,
                equityPercentage: Math.round(equityPercentage * 100) / 100,
                pricePerShare: round.pricePerShare,
                postMoneyValuation: round.currentValuationPostMoney,
                valuationChanges: false, // Valuation never changes during round
                newTotalShares: round.totalSharesOutstanding,
                fundingProgress: round.targetAmount > 0 ? 
                    ((round.totalFundsReceived + investmentAmount) / round.targetAmount) * 100 : 0
            };
            
        } catch (error) {
            console.error(`[PREVIEW ERROR] Failed to preview investment:`, error);
            throw error;
        }
    }
    
    /**
     * Get comprehensive payment processing summary
     * ✅ NEW: Provides detailed overview of payment processing results
     * @param {String} investorId - Investor ID
     * @returns {Object} Payment processing summary
     */
    static async getPaymentProcessingSummary(investorId) {
        try {
            const investor = await Investor.findById(investorId).populate('roundId');
            
            if (!investor) {
                throw new Error('Investor not found');
            }
            
            const capTableEntry = await CapTableEntry.findOne({
                linkedInvestorId: investor._id,
                organization: investor.organization
            });
            
            const round = investor.roundId;
            
            return {
                investor: {
                    name: investor.name,
                    totalCommitted: investor.totalCommittedAmount || 0,
                    totalReceived: investor.totalReceivedAmount || 0,
                    totalShares: investor.sharesReceived || 0,
                    averageSharePrice: investor.averageSharePrice || 0,
                    equityPercentage: investor.equityPercentageAllocated || 0,
                    status: investor.status,
                    investmentSummary: investor.getInvestmentSummary()
                },
                round: round ? {
                    name: round.name,
                    pricePerShare: round.pricePerShare,
                    totalFundsReceived: round.totalFundsReceived || 0,
                    targetAmount: round.targetAmount || 0,
                    fundingProgress: round.fundingProgress
                } : null,
                capTable: capTableEntry ? {
                    entryId: capTableEntry._id,
                    shareholderName: capTableEntry.shareholderName,
                    numberOfShares: capTableEntry.numberOfShares,
                    investmentAmount: capTableEntry.investmentAmount,
                    currentValue: capTableEntry.currentValue,
                    equityPercentage: capTableEntry.equityPercentage
                } : null,
                status: {
                    hasCapTableEntry: !!capTableEntry,
                    isFullyInvested: investor.isFullyInvested,
                    remainingCommitment: investor.remainingCommitment,
                    lastUpdate: new Date()
                }
            };
            
        } catch (error) {
            console.error(`[PAYMENT SUMMARY ERROR]`, error.message);
            throw error;
        }
    }
    
    /**
     * Recalculate all investor totals and sync with cap table - UTILITY METHOD
     * ✅ NEW: Comprehensive data consistency check and repair
     * @param {String} organizationId - Organization ID
     * @returns {Object} Recalculation results
     */
    static async recalculateAllInvestorTotals(organizationId) {
        console.log(`[RECALCULATION] Starting full recalculation for organization ${organizationId}`);
        
        const session = await mongoose.startSession();
        session.startTransaction();
        
        const results = {
            investorsProcessed: 0,
            capTableEntriesCreated: 0,
            capTableEntriesUpdated: 0,
            errors: []
        };
        
        try {
            // Get all investors for the organization
            const investors = await Investor.find({
                organization: organizationId
            }).populate('roundId').session(session);
            
            for (const investor of investors) {
                try {
                    // Recalculate investor totals (this is now done in pre-save middleware)
                    await investor.save({ session });
                    
                    // Update or create cap table entry
                    if (investor.totalReceivedAmount > 0) {
                        const existingEntry = await CapTableEntry.findOne({
                            linkedInvestorId: investor._id,
                            organization: organizationId
                        }).session(session);
                        
                        if (existingEntry) {
                            results.capTableEntriesUpdated++;
                        } else {
                            results.capTableEntriesCreated++;
                        }
                        
                        await investor.createCapTableEntry();
                    }
                    
                    results.investorsProcessed++;
                    
                } catch (investorError) {
                    console.error(`[RECALCULATION ERROR] Failed for investor ${investor.name}:`, investorError.message);
                    results.errors.push({
                        investorId: investor._id,
                        investorName: investor.name,
                        error: investorError.message
                    });
                }
            }
            
            // Update all equity percentages
            await this.updateAllEquityPercentages(organizationId, session);
            
            await session.commitTransaction();
            
            console.log(`[RECALCULATION COMPLETE] Results:`);
            console.log(`  - Investors processed: ${results.investorsProcessed}`);
            console.log(`  - Cap table entries created: ${results.capTableEntriesCreated}`);
            console.log(`  - Cap table entries updated: ${results.capTableEntriesUpdated}`);
            console.log(`  - Errors: ${results.errors.length}`);
            
            return results;
            
        } catch (error) {
            await session.abortTransaction();
            console.error(`[RECALCULATION ERROR] Transaction failed:`, error.message);
            throw error;
        } finally {
            session.endSession();
        }
    }
    
    /**
     * Delete investor and clean up all related data
     * ✅ ENHANCED: More comprehensive cleanup with proper session handling
     * @param {String} investorId - Investor ID
     * @param {String} organizationId - Organization ID
     */
    static async deleteInvestorCompletely(investorId, organizationId) {
        console.log(`[INVESTOR DELETE] Completely removing investor ${investorId}`);
        
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            // Get investor details before deletion
            const investor = await Investor.findOne({ 
                _id: investorId, 
                organization: organizationId 
            }).session(session);
            
            if (!investor) {
                return false; // Not found
            }
            
            const roundId = investor.roundId;
            const amountToSubtract = investor.totalReceivedAmount || 0;
            
            // Delete cap table entries (both investorId and linkedInvestorId patterns)
            await CapTableEntry.deleteMany({
                organization: organizationId,
                $or: [
                    { investorId: investorId },
                    { linkedInvestorId: investorId }
                ]
            }).session(session);
            
            // Delete investor
            await Investor.deleteOne({ 
                _id: investorId, 
                organization: organizationId 
            }).session(session);
            
            // Update round totals (but NOT valuations)
            if (roundId && amountToSubtract > 0) {
                const round = await Round.findById(roundId).session(session);
                if (round) {
                    round.totalFundsReceived = Math.max(0, (round.totalFundsReceived || 0) - amountToSubtract);
                    // CORRECTED: Do NOT change valuations when removing investor
                    await round.save({ session });
                    
                    // Recalculate metrics (preserve valuations)
                    await this.recalculateRoundMetrics(roundId, organizationId);
                }
            }
            
            console.log(`[INVESTOR DELETE] Successfully removed ${investor.name} and updated all related data`);
            
            await session.commitTransaction();
            return true;
            
        } catch (error) {
            await session.abortTransaction();
            console.error(`[INVESTOR DELETE ERROR] Failed to delete investor:`, error);
            throw error;
        } finally {
            session.endSession();
        }
    }
    
    /**
     * Validate round data integrity - UTILITY METHOD
     * ✅ NEW: Comprehensive validation of round calculations
     * @param {String} roundId - Round ID
     * @returns {Object} Validation results
     */
    static async validateRoundIntegrity(roundId) {
        console.log(`[VALIDATION] Checking integrity for round ${roundId}`);
        
        try {
            const round = await Round.findById(roundId);
            if (!round) {
                throw new Error('Round not found');
            }
            
            // Get all investors for this round
            const investors = await Investor.find({ roundId: roundId });
            
            // Calculate totals from investors
            const calculatedTotalReceived = investors.reduce((sum, inv) => sum + (inv.totalReceivedAmount || 0), 0);
            const calculatedTotalShares = investors.reduce((sum, inv) => sum + (inv.sharesReceived || 0), 0);
            
            // Get cap table entries for this round
            const capTableEntries = await CapTableEntry.find({ roundId: roundId });
            const capTableTotalShares = capTableEntries.reduce((sum, entry) => sum + (entry.numberOfShares || 0), 0);
            const capTableTotalInvestment = capTableEntries.reduce((sum, entry) => sum + (entry.investmentAmount || 0), 0);
            
            const validation = {
                round: {
                    id: round._id,
                    name: round.name,
                    pricePerShare: round.pricePerShare,
                    totalFundsReceived: round.totalFundsReceived || 0,
                    targetAmount: round.targetAmount || 0
                },
                investors: {
                    count: investors.length,
                    totalReceived: calculatedTotalReceived,
                    totalShares: calculatedTotalShares
                },
                capTable: {
                    entriesCount: capTableEntries.length,
                    totalShares: capTableTotalShares,
                    totalInvestment: capTableTotalInvestment
                },
                discrepancies: {
                    roundVsInvestors: Math.abs((round.totalFundsReceived || 0) - calculatedTotalReceived),
                    investorsVsCapTable: Math.abs(calculatedTotalReceived - capTableTotalInvestment),
                    sharesVsCapTable: Math.abs(calculatedTotalShares - capTableTotalShares)
                },
                isValid: true
            };
            
            // Check for significant discrepancies (> ₹100)
            validation.isValid = Object.values(validation.discrepancies).every(diff => diff < 100);
            
            console.log(`[VALIDATION COMPLETE] Round ${round.name} ${validation.isValid ? 'VALID' : 'HAS DISCREPANCIES'}`);
            
            return validation;
            
        } catch (error) {
            console.error(`[VALIDATION ERROR]`, error.message);
            throw error;
        }
    }
}

module.exports = FundraisingCalculationService;