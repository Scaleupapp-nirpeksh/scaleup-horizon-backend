// controllers/fundraisingController.js - COMPLETE FULL VERSION WITH TRANCHE FIXES
const Round = require('../models/roundModel');
const Investor = require('../models/investorModel');
const CapTableEntry = require('../models/capTableEntryModel');
const FundraisingCalculationService = require('../services/fundraisingCalculationService');
const mongoose = require('mongoose');

// --- Module 1.1: Enhanced Round Management ---

/**
 * @desc    Create a new fundraising round with automatic calculations
 * @route   POST /api/horizon/fundraising/rounds
 * @access  Private (Requires 'owner' or 'member' role)
 */
exports.createRound = async (req, res) => {
    const {
        name, targetAmount, currency,
        currentValuationPreMoney, currentValuationPostMoney,
        softCommitmentsTotal, hardCommitmentsTotal, totalFundsReceived,
        openDate, targetCloseDate, actualCloseDate, status, roundType, notes,
        // NEW CALCULATION FIELDS
        equityPercentageOffered, existingSharesPreRound
    } = req.body;
    
    const organizationId = req.organization._id;
    const userId = req.user._id;

    try {
        // Basic validation
        if (!name || targetAmount === undefined) {
            return res.status(400).json({ msg: 'Please provide a name and target amount for the round.' });
        }
        
        const orgCurrency = req.organization.currency || 'INR';
        
        // Prepare round data for enhanced creation
        const roundData = {
            name,
            targetAmount,
            currency: currency || orgCurrency,
            currentValuationPreMoney,
            currentValuationPostMoney,
            softCommitmentsTotal,
            hardCommitmentsTotal,
            totalFundsReceived,
            openDate,
            targetCloseDate,
            actualCloseDate,
            status,
            roundType,
            notes,
            equityPercentageOffered,
            existingSharesPreRound
        };
        
        // Use calculation service for intelligent round creation
        let round;
        if (equityPercentageOffered && existingSharesPreRound) {
            console.log(`[ROUND CREATE] Creating round with automatic calculations: ${name}`);
            round = await FundraisingCalculationService.initializeRound(roundData, organizationId, userId);
        } else {
            // Fallback to simple creation without calculations
            console.log(`[ROUND CREATE] Creating round without calculations: ${name}`);
            round = new Round({
                organization: organizationId,
                createdBy: userId,
                ...roundData
            });
            await round.save();
        }
        
        // Return round with enhanced data
        const response = {
            ...round.toObject(),
            formattedValuation: round.getFormattedValuation(),
            progressSummary: round.getProgressSummary(),
            validation: round.validateReadyForInvestors()
        };
        
        console.log(`[ROUND CREATED] ${round.name} - Post-money: ${response.formattedValuation.postMoney}, Price: ${response.formattedValuation.pricePerShare}`);
        
        res.status(201).json(response);
        
    } catch (err) {
        console.error('Error creating round:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        }
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'A round with this name already exists for your organization.' });
        }
        res.status(500).json({ msg: 'Server Error: Could not create round.', error: err.message });
    }
};

/**
 * @desc    Get all fundraising rounds with enhanced data
 * @route   GET /api/horizon/fundraising/rounds
 * @access  Private
 */
exports.getRounds = async (req, res) => {
    const organizationId = req.organization._id;
    
    try {
        const rounds = await Round.find({ organization: organizationId })
            .sort({ openDate: -1 });
        
        // Enhance each round with calculated data
        const enhancedRounds = rounds.map(round => ({
            ...round.toObject(),
            formattedValuation: round.getFormattedValuation(),
            progressSummary: round.getProgressSummary(),
            isReadyForInvestors: round.validateReadyForInvestors().isValid,
            // Virtual fields
            isFullyFunded: round.isFullyFunded,
            remainingFunding: round.remainingFunding,
            isActive: round.isActive,
            daysOpen: round.daysOpen
        }));
        
        console.log(`[ROUNDS FETCH] Retrieved ${enhancedRounds.length} rounds for organization`);
        res.json(enhancedRounds);
        
    } catch (err) {
        console.error('Error fetching rounds:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not fetch rounds.' });
    }
};

/**
 * @desc    Get a single round with comprehensive data
 * @route   GET /api/horizon/fundraising/rounds/:id
 * @access  Private
 */
exports.getRoundById = async (req, res) => {
    const organizationId = req.organization._id;
    
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }
        
        const round = await Round.findOne({ 
            _id: req.params.id, 
            organization: organizationId 
        });
        
        if (!round) {
            return res.status(404).json({ msg: 'Round not found within your organization.' });
        }
        
        // Get related data
        const [investors, capTableEntries] = await Promise.all([
            Investor.find({ roundId: round._id, organization: organizationId })
                .select('name status totalCommittedAmount totalReceivedAmount equityPercentageAllocated'),
            CapTableEntry.find({ roundId: round._id, organization: organizationId })
                .select('shareholderName numberOfShares currentValue equityPercentage')
        ]);
        
        // Prepare comprehensive response
        const response = {
            ...round.toObject(),
            formattedValuation: round.getFormattedValuation(),
            progressSummary: round.getProgressSummary(),
            validation: round.validateReadyForInvestors(),
            relatedData: {
                investorCount: investors.length,
                activeInvestors: investors.filter(inv => inv.totalReceivedAmount > 0).length,
                capTableEntries: capTableEntries.length,
                totalInvestorCommitments: investors.reduce((sum, inv) => sum + (inv.totalCommittedAmount || 0), 0),
                totalInvestorReceived: investors.reduce((sum, inv) => sum + (inv.totalReceivedAmount || 0), 0)
            },
            investors: investors,
            capTableEntries: capTableEntries
        };
        
        console.log(`[ROUND DETAIL] Retrieved round ${round.name} with ${investors.length} investors`);
        res.json(response);
        
    } catch (err) {
        console.error('Error fetching round by ID:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not fetch round.' });
    }
};

/**
 * @desc    Update round with potential recalculation
 * @route   PUT /api/horizon/fundraising/rounds/:id
 * @access  Private
 */
exports.updateRound = async (req, res) => {
    const {
        name, targetAmount, currency, currentValuationPreMoney, currentValuationPostMoney,
        softCommitmentsTotal, hardCommitmentsTotal, totalFundsReceived,
        openDate, targetCloseDate, actualCloseDate, status, roundType, notes,
        // NEW CALCULATION FIELDS
        equityPercentageOffered, existingSharesPreRound
    } = req.body;
    
    const organizationId = req.organization._id;
    const userId = req.user._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }
        
        let round = await Round.findOne({ 
            _id: req.params.id, 
            organization: organizationId 
        });
        
        if (!round) {
            return res.status(404).json({ msg: 'Round not found within your organization.' });
        }

        // Check if calculation-critical fields are being updated
        const calculationFields = ['targetAmount', 'equityPercentageOffered', 'existingSharesPreRound'];
        const needsRecalculation = calculationFields.some(field => 
            req.body[field] !== undefined && req.body[field] !== round[field]
        );

        // Build update object
        const updateFields = {};
        if (name !== undefined) updateFields.name = name;
        if (targetAmount !== undefined) updateFields.targetAmount = targetAmount;
        if (currency !== undefined) updateFields.currency = currency;
        if (currentValuationPreMoney !== undefined) updateFields.currentValuationPreMoney = currentValuationPreMoney;
        if (currentValuationPostMoney !== undefined) updateFields.currentValuationPostMoney = currentValuationPostMoney;
        if (softCommitmentsTotal !== undefined) updateFields.softCommitmentsTotal = softCommitmentsTotal;
        if (hardCommitmentsTotal !== undefined) updateFields.hardCommitmentsTotal = hardCommitmentsTotal;
        if (totalFundsReceived !== undefined) updateFields.totalFundsReceived = totalFundsReceived;
        if (openDate !== undefined) updateFields.openDate = openDate;
        if (targetCloseDate !== undefined) updateFields.targetCloseDate = targetCloseDate;
        if (actualCloseDate !== undefined) updateFields.actualCloseDate = actualCloseDate;
        if (status !== undefined) updateFields.status = status;
        if (roundType !== undefined) updateFields.roundType = roundType;
        if (notes !== undefined) updateFields.notes = notes;
        if (equityPercentageOffered !== undefined) updateFields.equityPercentageOffered = equityPercentageOffered;
        if (existingSharesPreRound !== undefined) updateFields.existingSharesPreRound = existingSharesPreRound;

        // Update the round
        round = await Round.findOneAndUpdate(
            { _id: req.params.id, organization: organizationId },
            { $set: updateFields },
            { new: true, runValidators: true }
        );
        
        // Trigger recalculation if needed
        if (needsRecalculation && round.equityPercentageOffered > 0 && round.existingSharesPreRound > 0) {
            console.log(`[ROUND UPDATE] Triggering recalculation for ${round.name}`);
            await FundraisingCalculationService.recalculateRoundMetrics(round._id, organizationId);
            
            // Reload round to get updated calculations
            round = await Round.findById(round._id);
        }
        
        const response = {
            ...round.toObject(),
            formattedValuation: round.getFormattedValuation(),
            progressSummary: round.getProgressSummary(),
            validation: round.validateReadyForInvestors(),
            recalculated: needsRecalculation
        };
        
        console.log(`[ROUND UPDATED] ${round.name}${needsRecalculation ? ' with recalculation' : ''}`);
        res.json(response);
        
    } catch (err) {
        console.error('Error updating round:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        }
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'A round with this name already exists for your organization.' });
        }
        res.status(500).json({ msg: 'Server Error: Could not update round.' });
    }
};

/**
 * @desc    Delete round with comprehensive cleanup
 * @route   DELETE /api/horizon/fundraising/rounds/:id
 * @access  Private
 */
exports.deleteRound = async (req, res) => {
    const organizationId = req.organization._id;
    
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }
        
        const round = await Round.findOne({ 
            _id: req.params.id, 
            organization: organizationId 
        });
        
        if (!round) {
            return res.status(404).json({ msg: 'Round not found within your organization.' });
        }

        // Check for existing investments before deletion
        const investorCount = await Investor.countDocuments({ 
            roundId: req.params.id, 
            organization: organizationId,
            totalReceivedAmount: { $gt: 0 }
        });
        
        if (investorCount > 0) {
            return res.status(400).json({ 
                msg: `Cannot delete round with ${investorCount} investors who have made payments. Please remove investors first.` 
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Delete all related data in correct order
            await CapTableEntry.deleteMany({ 
                roundId: req.params.id, 
                organization: organizationId 
            }).session(session);
            
            await Investor.deleteMany({ 
                roundId: req.params.id, 
                organization: organizationId 
            }).session(session);
            
            await Round.findByIdAndDelete(req.params.id).session(session);
            
            await session.commitTransaction();
            
            console.log(`[ROUND DELETED] ${round.name} and all associated data removed`);
            res.json({ 
                msg: 'Round and all associated data removed successfully',
                deletedRound: round.name
            });
            
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
        
    } catch (err) {
        console.error('Error deleting round:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not delete round.' });
    }
};

// --- Module 1.2: Enhanced Investor Management WITH COMPLETE TRANCHE SUPPORT ---

/**
 * @desc    Add investor with COMPLETE TRANCHE SUPPORT - FULLY FIXED VERSION
 * @route   POST /api/horizon/fundraising/investors
 * @access  Private
 */
exports.addInvestor = async (req, res) => {
    const {
        name, contactPerson, email, phone, entityName, investorType, investmentVehicle,
        safeValuationCap, safeDiscountRate, noteInterestRate, noteMaturityDate,
        totalCommittedAmount, roundId, status, notes, currency, tranches = []
    } = req.body;
    
    const organizationId = req.organization._id;
    const userId = req.user._id;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        console.log('=== INVESTOR CREATION START ===');
        console.log(`[INVESTOR ADD] Creating investor "${name}" with ${tranches.length} tranches`);
        console.log(`[INVESTOR ADD] Committed: ₹${totalCommittedAmount}, Vehicle: ${investmentVehicle}`);
        console.log(`[INVESTOR ADD] Tranches received:`, JSON.stringify(tranches, null, 2));
        
        // ✅ ENHANCED VALIDATION
        if (!name || !name.trim()) {
            return res.status(400).json({ msg: 'Investor name is required.' });
        }

        if (!totalCommittedAmount || parseFloat(totalCommittedAmount) <= 0) {
            return res.status(400).json({ msg: 'Total committed amount must be greater than 0.' });
        }

        if (!roundId) {
            return res.status(400).json({ msg: 'Round ID is required.' });
        }

        if (!mongoose.Types.ObjectId.isValid(roundId)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }

        // ✅ VALIDATE TRANCHES ARRAY
        if (!Array.isArray(tranches) || tranches.length === 0) {
            return res.status(400).json({ msg: 'At least one tranche is required.' });
        }

        // ✅ VALIDATE EACH TRANCHE
        for (let i = 0; i < tranches.length; i++) {
            const tranche = tranches[i];
            console.log(`[TRANCHE VALIDATION] Validating tranche ${i + 1}:`, tranche);
            
            if (!tranche.agreedAmount || parseFloat(tranche.agreedAmount) <= 0) {
                return res.status(400).json({ 
                    msg: `Tranche ${i + 1}: Agreed amount must be greater than 0.` 
                });
            }

            if (tranche.receivedAmount && parseFloat(tranche.receivedAmount) > parseFloat(tranche.agreedAmount)) {
                return res.status(400).json({ 
                    msg: `Tranche ${i + 1}: Received amount cannot exceed agreed amount.` 
                });
            }
        }

        // Verify round exists and is ready for investors
        const round = await Round.findOne({ _id: roundId, organization: organizationId }).session(session);
        if (!round) {
            return res.status(404).json({ msg: 'Specified round not found within your organization.' });
        }

        console.log(`[ROUND INFO] Using round: ${round.name}, Price: ₹${round.pricePerShare}/share`);
        
        const validation = round.validateReadyForInvestors();
        if (!validation.isValid) {
            return res.status(400).json({ 
                msg: 'Round is not ready for investors', 
                errors: validation.errors 
            });
        }
        
        const orgCurrency = req.organization.currency || 'INR';
        
        // ✅ CREATE INVESTOR WITH BASIC INFORMATION FIRST (NO TRANCHES YET)
        const newInvestor = new Investor({
            organization: organizationId,
            addedBy: userId,
            name: name.trim(),
            contactPerson: contactPerson?.trim() || name.trim(),
            email: email?.trim() || '',
            phone: phone?.trim() || '',
            entityName: entityName?.trim() || '',
            investorType: investorType,
            investmentVehicle: investmentVehicle || 'Equity',
            safeValuationCap: safeValuationCap ? parseFloat(safeValuationCap) : null,
            safeDiscountRate: safeDiscountRate ? parseFloat(safeDiscountRate) : null,
            noteInterestRate: noteInterestRate ? parseFloat(noteInterestRate) : null,
            noteMaturityDate: noteMaturityDate ? new Date(noteMaturityDate) : null,
            totalCommittedAmount: parseFloat(totalCommittedAmount),
            totalReceivedAmount: 0, // Will be calculated from tranches
            roundId: roundId,
            status: status || 'Introduced',
            notes: notes?.trim() || '',
            currency: currency || orgCurrency,
            tranches: [], // ✅ FIX: Start with empty array, will add tranches next
            sharesAllocated: 0,
            sharesReceived: 0,
            equityPercentageAllocated: 0,
            averageSharePrice: round.pricePerShare || 0
        });

        console.log(`[INVESTOR CREATED] Base investor created, now processing tranches...`);

        // ✅ PROCESS AND ADD EACH TRANCHE TO THE INVESTOR
        let totalReceivedFromTranches = 0;
        for (let i = 0; i < tranches.length; i++) {
            const trancheData = tranches[i];
            
            console.log(`[TRANCHE PROCESSING] Adding tranche ${i + 1}:`, trancheData);
            
            // ✅ CLEAN AND VALIDATE TRANCHE DATA
            const cleanTranche = {
                trancheNumber: i + 1,
                agreedAmount: parseFloat(trancheData.agreedAmount),
                receivedAmount: parseFloat(trancheData.receivedAmount) || 0,
                dateAgreed: trancheData.dateAgreed ? new Date(trancheData.dateAgreed) : new Date(),
                dateReceived: trancheData.dateReceived ? new Date(trancheData.dateReceived) : null,
                status: trancheData.status || 'Pending',
                triggerCondition: trancheData.triggerCondition?.trim() || '',
                paymentMethod: trancheData.paymentMethod?.trim() || '',
                transactionReference: trancheData.transactionReference?.trim() || '',
                notes: trancheData.notes?.trim() || ''
            };

            // ✅ SET STATUS BASED ON AMOUNTS
            if (cleanTranche.receivedAmount >= cleanTranche.agreedAmount) {
                cleanTranche.status = 'Fully Received';
                if (!cleanTranche.dateReceived) {
                    cleanTranche.dateReceived = new Date();
                }
            } else if (cleanTranche.receivedAmount > 0) {
                cleanTranche.status = 'Partially Received';
                if (!cleanTranche.dateReceived) {
                    cleanTranche.dateReceived = new Date();
                }
            } else {
                cleanTranche.status = 'Pending';
                cleanTranche.dateReceived = null;
            }

            // ✅ CALCULATE SHARES FOR THIS TRANCHE
            if (round.pricePerShare && round.pricePerShare > 0) {
                cleanTranche.sharePrice = round.pricePerShare;
                cleanTranche.sharesAllocated = Math.round(cleanTranche.receivedAmount / round.pricePerShare);
                cleanTranche.equityPercentage = round.totalSharesOutstanding > 0 ? 
                    (cleanTranche.sharesAllocated / round.totalSharesOutstanding) * 100 : 0;
            } else {
                cleanTranche.sharePrice = 0;
                cleanTranche.sharesAllocated = 0;
                cleanTranche.equityPercentage = 0;
            }

            // ✅ ADD TRANCHE TO INVESTOR
            newInvestor.tranches.push(cleanTranche);
            totalReceivedFromTranches += cleanTranche.receivedAmount;

            console.log(`[TRANCHE ADDED] T${cleanTranche.trancheNumber}: ₹${cleanTranche.agreedAmount} agreed, ₹${cleanTranche.receivedAmount} received, Status: ${cleanTranche.status}`);
        }

        // ✅ UPDATE INVESTOR TOTALS AFTER ALL TRANCHES ARE ADDED
        newInvestor.totalReceivedAmount = totalReceivedFromTranches;

        // ✅ CALCULATE EQUITY ALLOCATION FOR THE ENTIRE INVESTOR
        if (round.pricePerShare && round.totalSharesOutstanding) {
            newInvestor.sharesAllocated = Math.round(newInvestor.totalCommittedAmount / round.pricePerShare);
            newInvestor.sharesReceived = Math.round(newInvestor.totalReceivedAmount / round.pricePerShare);
            newInvestor.equityPercentageAllocated = (newInvestor.sharesAllocated / round.totalSharesOutstanding) * 100;
            newInvestor.averageSharePrice = round.pricePerShare;

            console.log(`[EQUITY CALCULATION] Investor will get:`);
            console.log(`  - Allocated Shares: ${newInvestor.sharesAllocated} (for ₹${newInvestor.totalCommittedAmount})`);
            console.log(`  - Received Shares: ${newInvestor.sharesReceived} (for ₹${newInvestor.totalReceivedAmount})`);
            console.log(`  - Equity %: ${newInvestor.equityPercentageAllocated.toFixed(4)}%`);
            console.log(`  - Price/Share: ₹${newInvestor.averageSharePrice}`);
        }

        // ✅ SAVE INVESTOR WITH ALL TRANCHES
        console.log(`[INVESTOR SAVE] Saving investor with ${newInvestor.tranches.length} tranches...`);
        await newInvestor.save({ session });
        console.log(`[INVESTOR SAVED] ✅ Investor saved with ID: ${newInvestor._id}`);
        console.log(`[INVESTOR SAVED] ✅ Tranches in DB: ${newInvestor.tranches.length}`);

        // ✅ CREATE CAP TABLE ENTRIES IF INVESTOR HAS RECEIVED MONEY
        if (newInvestor.sharesReceived > 0) {
            const capTableEntry = new CapTableEntry({
                organization: organizationId,
                user: userId,
                roundId: roundId,
                investorId: newInvestor._id,
                shareholderName: newInvestor.name,
                shareholderType: 'Investor',
                numberOfShares: newInvestor.sharesReceived,
                securityType: newInvestor.investmentVehicle === 'Equity' ? 'Common Stock' : 'Preferred Stock',
                investmentAmount: newInvestor.totalReceivedAmount,
                currentValue: newInvestor.totalReceivedAmount,
                equityPercentage: (newInvestor.sharesReceived / round.totalSharesOutstanding) * 100,
                grantDate: new Date(),
                notes: `Investment from ${newInvestor.name}`,
                linkedInvestorId: newInvestor._id
            });

            await capTableEntry.save({ session });
            console.log(`[CAP TABLE] ✅ Cap table entry created for ${newInvestor.sharesReceived} shares`);
        }

        // ✅ UPDATE ROUND METRICS
        round.totalFundsReceived = (round.totalFundsReceived || 0) + totalReceivedFromTranches;
        await round.save({ session });

        console.log(`[ROUND UPDATE] ✅ Round total funds updated: +₹${totalReceivedFromTranches.toLocaleString()}`);

        // ✅ COMMIT TRANSACTION
        await session.commitTransaction();

        // ✅ GET FINAL INVESTOR WITH POPULATED DATA
        const finalInvestor = await Investor.findById(newInvestor._id).populate('roundId');
        
        const response = {
            ...finalInvestor.toObject(),
            investmentSummary: finalInvestor.getInvestmentSummary(),
            equityAllocation: {
                sharesAllocated: finalInvestor.sharesAllocated,
                equityPercentage: finalInvestor.equityPercentageAllocated,
                sharePrice: finalInvestor.averageSharePrice
            },
            formattedCommitment: `₹${finalInvestor.totalCommittedAmount.toLocaleString()}`,
            formattedReceived: `₹${finalInvestor.totalReceivedAmount.toLocaleString()}`,
            tranchesCount: finalInvestor.tranches.length
        };
        
        console.log(`=== INVESTOR CREATION COMPLETE ===`);
        console.log(`[SUCCESS] ✅ ${finalInvestor.name}:`);
        console.log(`  - ID: ${finalInvestor._id}`);
        console.log(`  - Tranches: ${finalInvestor.tranches.length}`);
        console.log(`  - Committed: ₹${finalInvestor.totalCommittedAmount.toLocaleString()}`);
        console.log(`  - Received: ₹${finalInvestor.totalReceivedAmount.toLocaleString()}`);
        console.log(`  - Shares Allocated: ${finalInvestor.sharesAllocated}`);
        console.log(`  - Shares Received: ${finalInvestor.sharesReceived}`);
        console.log(`  - Equity %: ${finalInvestor.equityPercentageAllocated.toFixed(4)}%`);
        
        res.status(201).json(response);
        
    } catch (err) {
        await session.abortTransaction();
        console.error('=== INVESTOR CREATION FAILED ===');
        console.error('❌ Error adding investor:', err.message);
        console.error('Stack trace:', err.stack);
        
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        }
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'An investor with this email already exists for your organization.' });
        }
        res.status(500).json({ msg: 'Server Error: Could not add investor. ' + err.message });
    } finally {
        session.endSession();
    }
};
/**
 * @desc    Get investors with enhanced data
 * @route   GET /api/horizon/fundraising/investors
 * @access  Private
 */
exports.getInvestors = async (req, res) => {
    const organizationId = req.organization._id;
    
    try {
        const query = { organization: organizationId };
        
        if (req.query.roundId) {
            if (!mongoose.Types.ObjectId.isValid(req.query.roundId)) {
                return res.status(400).json({ msg: 'Invalid Round ID format for filtering' });
            }
            query.roundId = req.query.roundId;
        }
        
        const investors = await Investor.find(query)
            .populate({
                path: 'roundId',
                match: { organization: organizationId },
                select: 'name targetAmount currency pricePerShare'
            })
            .populate('addedBy', 'name email')
            .sort({ createdAt: -1 });

        // Filter out investors whose round didn't match organization
        const validInvestors = investors.filter(inv => inv.roundId !== null || !req.query.roundId);
        
        // Enhance each investor with calculated data
        const enhancedInvestors = validInvestors.map(investor => ({
            ...investor.toObject(),
            investmentSummary: investor.getInvestmentSummary(),
            // Virtual fields
            isFullyInvested: investor.isFullyInvested,
            remainingCommitment: investor.remainingCommitment,
            isConvertibleInstrument: investor.isConvertibleInstrument,
            pendingTranches: investor.pendingTranches
        }));
        
        console.log(`[INVESTORS FETCH] Retrieved ${enhancedInvestors.length} investors`);
        res.json(enhancedInvestors);
        
    } catch (err) {
        console.error('Error fetching investors:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not fetch investors.' });
    }
};

/**
 * @desc    Get single investor with comprehensive data
 * @route   GET /api/horizon/fundraising/investors/:id  
 * @access  Private
 */
exports.getInvestorById = async (req, res) => {
    const organizationId = req.organization._id;
    
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        
        const investor = await Investor.findOne({ 
            _id: req.params.id, 
            organization: organizationId 
        })
        .populate('roundId', 'name currency pricePerShare totalSharesOutstanding')
        .populate('addedBy', 'name email');
        
        if (!investor) {
            return res.status(404).json({ msg: 'Investor not found within your organization.' });
        }
        
        // Get cap table entry if exists
        const capTableEntry = await CapTableEntry.findOne({
            organization: organizationId,
            investorId: investor._id
        });
        
        const response = {
            ...investor.toObject(),
            investmentSummary: investor.getInvestmentSummary(),
            capTableEntry: capTableEntry,
            // Virtual fields
            isFullyInvested: investor.isFullyInvested,
            remainingCommitment: investor.remainingCommitment,
            isConvertibleInstrument: investor.isConvertibleInstrument,
            pendingTranches: investor.pendingTranches
        };
        
        console.log(`[INVESTOR DETAIL] Retrieved ${investor.name} with ${investor.tranches.length} tranches`);
        res.json(response);
        
    } catch (err) {
        console.error('Error fetching investor by ID:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not fetch investor.' });
    }
};

/**
 * @desc    Update investor with potential recalculation
 * @route   PUT /api/horizon/fundraising/investors/:id
 * @access  Private
 */
exports.updateInvestor = async (req, res) => {
    const {
        name, contactPerson, email, phone, entityName, investorType, investmentVehicle,
        safeValuationCap, safeDiscountRate, noteInterestRate, noteMaturityDate,
        totalCommittedAmount, currency, status, notes, tranches = []
    } = req.body;
    
    const organizationId = req.organization._id;
    const userId = req.user._id;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        console.log(`[INVESTOR UPDATE] Updating investor ${req.params.id} with ${tranches.length} tranches`);
        
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        
        let investor = await Investor.findOne({ 
            _id: req.params.id, 
            organization: organizationId 
        }).populate('roundId').session(session);
        
        if (!investor) {
            return res.status(404).json({ msg: 'Investor not found within your organization.' });
        }

        // Check if equity-affecting fields are being updated
        const equityFields = ['totalCommittedAmount', 'investmentVehicle'];
        const needsRecalculation = equityFields.some(field => 
            req.body[field] !== undefined && req.body[field] !== investor[field]
        );

        // Build update object
        const updateFields = {};
        if (name !== undefined) updateFields.name = name;
        if (contactPerson !== undefined) updateFields.contactPerson = contactPerson;
        if (email !== undefined) updateFields.email = email;
        if (phone !== undefined) updateFields.phone = phone;
        if (entityName !== undefined) updateFields.entityName = entityName;
        if (investorType !== undefined) updateFields.investorType = investorType;
        if (investmentVehicle !== undefined) updateFields.investmentVehicle = investmentVehicle;
        if (safeValuationCap !== undefined) updateFields.safeValuationCap = safeValuationCap;
        if (safeDiscountRate !== undefined) updateFields.safeDiscountRate = safeDiscountRate;
        if (noteInterestRate !== undefined) updateFields.noteInterestRate = noteInterestRate;
        if (noteMaturityDate !== undefined) updateFields.noteMaturityDate = noteMaturityDate;
        if (totalCommittedAmount !== undefined) updateFields.totalCommittedAmount = totalCommittedAmount;
        if (currency !== undefined) updateFields.currency = currency;
        if (status !== undefined) updateFields.status = status;
        if (notes !== undefined) updateFields.notes = notes;

        // ✅ UPDATE TRANCHES IF PROVIDED
        if (tranches.length > 0) {
            investor.tranches = [];
            let totalReceived = 0;

            for (let i = 0; i < tranches.length; i++) {
                const trancheData = tranches[i];
                
                const cleanTranche = {
                    trancheNumber: i + 1,
                    agreedAmount: parseFloat(trancheData.agreedAmount),
                    receivedAmount: parseFloat(trancheData.receivedAmount) || 0,
                    dateAgreed: trancheData.dateAgreed ? new Date(trancheData.dateAgreed) : new Date(),
                    dateReceived: trancheData.dateReceived ? new Date(trancheData.dateReceived) : null,
                    status: trancheData.status || 'Pending',
                    triggerCondition: trancheData.triggerCondition?.trim() || '',
                    paymentMethod: trancheData.paymentMethod?.trim() || '',
                    transactionReference: trancheData.transactionReference?.trim() || '',
                    notes: trancheData.notes?.trim() || ''
                };

                // Set status based on amounts
                if (cleanTranche.receivedAmount >= cleanTranche.agreedAmount) {
                    cleanTranche.status = 'Fully Received';
                } else if (cleanTranche.receivedAmount > 0) {
                    cleanTranche.status = 'Partially Received';
                } else {
                    cleanTranche.status = 'Pending';
                }

                investor.tranches.push(cleanTranche);
                totalReceived += cleanTranche.receivedAmount;
            }

            investor.totalReceivedAmount = totalReceived;
            updateFields.tranches = investor.tranches;
            updateFields.totalReceivedAmount = totalReceived;
        }

        investor = await Investor.findOneAndUpdate(
            { _id: req.params.id, organization: organizationId },
            { $set: updateFields },
            { new: true, runValidators: true, session }
        ).populate('roundId', 'name currency pricePerShare')
         .populate('addedBy', 'name email');
        
        // Recalculate equity if needed
        if (needsRecalculation && investor.roundId && investor.roundId.pricePerShare > 0) {
            console.log(`[INVESTOR UPDATE] Recalculating equity for ${investor.name}`);
            investor.calculateEquityAllocation(investor.roundId);
            await investor.save({ session });
        }

        await session.commitTransaction();
        
        const response = {
            ...investor.toObject(),
            investmentSummary: investor.getInvestmentSummary(),
            recalculated: needsRecalculation
        };
        
        console.log(`[INVESTOR UPDATED] ${investor.name}${needsRecalculation ? ' with recalculation' : ''}`);
        res.json(response);
        
    } catch (err) {
        await session.abortTransaction();
        console.error('Error updating investor:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        }
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'An investor with this email already exists for your organization.' });
        }
        res.status(500).json({ msg: 'Server Error: Could not update investor.' });
    } finally {
        session.endSession();
    }
};

/**
 * @desc    Delete investor with comprehensive cleanup
 * @route   DELETE /api/horizon/fundraising/investors/:id
 * @access  Private
 */
exports.deleteInvestor = async (req, res) => {
    const organizationId = req.organization._id;
    
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        
        // Use calculation service for comprehensive deletion
        const success = await FundraisingCalculationService.deleteInvestorCompletely(
            req.params.id, organizationId
        );
        
        if (success) {
            console.log(`[INVESTOR DELETED] Investor ${req.params.id} and all related data removed`);
            res.json({ msg: 'Investor and all related data removed successfully' });
        } else {
            res.status(404).json({ msg: 'Investor not found within your organization.' });
        }
        
    } catch (err) {
        console.error('Error deleting investor:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not delete investor.' });
    }
};

// --- Module 1.3: Enhanced Tranche Management ---

/**
 * @desc    Add tranche to investor
 * @route   POST /api/horizon/fundraising/investors/:investorId/tranches
 * @access  Private
 */
exports.addTranche = async (req, res) => {
    const { investorId } = req.params;
    const { 
        trancheNumber, agreedAmount, dateAgreed, triggerCondition, 
        status, dateReceived, receivedAmount, paymentMethod, transactionReference, notes 
    } = req.body;
    
    const organizationId = req.organization._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(investorId)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        
        const investor = await Investor.findOne({ 
            _id: investorId, 
            organization: organizationId 
        }).populate('roundId');
        
        if (!investor) {
            return res.status(404).json({ msg: 'Investor not found within your organization.' });
        }

        if (trancheNumber === undefined || agreedAmount === undefined) {
            return res.status(400).json({ msg: 'Tranche number and agreed amount are required.' });
        }

        const newTranche = {
            trancheNumber, 
            agreedAmount, 
            dateAgreed, 
            triggerCondition,
            status: status || 'Pending', 
            dateReceived, 
            receivedAmount: receivedAmount || 0,
            paymentMethod,
            transactionReference,
            notes
        };
        
        // Calculate shares for this tranche if round has price
        if (investor.roundId && investor.roundId.pricePerShare > 0) {
            newTranche.sharePrice = investor.roundId.pricePerShare;
            if (newTranche.receivedAmount > 0) {
                newTranche.sharesAllocated = Math.round(newTranche.receivedAmount / investor.roundId.pricePerShare);
                newTranche.equityPercentage = investor.roundId.totalSharesOutstanding > 0 ? 
                    (newTranche.sharesAllocated / investor.roundId.totalSharesOutstanding) * 100 : 0;
            }
        }
        
        investor.tranches.push(newTranche);
        await investor.save(); // Triggers pre-save calculations
        
        const response = {
            ...investor.toObject(),
            investmentSummary: investor.getInvestmentSummary(),
            newTranche: investor.tranches[investor.tranches.length - 1]
        };
        
        console.log(`[TRANCHE ADDED] ${investor.name} T${trancheNumber}: ₹${agreedAmount.toLocaleString()}`);
        res.status(201).json(response);
        
    } catch (err) {
        console.error('Error adding tranche:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        }
        res.status(500).json({ msg: 'Server Error: Could not add tranche.' });
    }
};

/**
 * @desc    Update tranche with payment processing
 * @route   PUT /api/horizon/fundraising/investors/:investorId/tranches/:trancheId
 * @access  Private
 */
exports.updateTranche = async (req, res) => {
    const { investorId, trancheId } = req.params;
    const { 
        trancheNumber, agreedAmount, dateAgreed, triggerCondition, 
        status, dateReceived, receivedAmount, paymentMethod, transactionReference, notes 
    } = req.body;
    
    const organizationId = req.organization._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(investorId) || !mongoose.Types.ObjectId.isValid(trancheId)) {
            return res.status(400).json({ msg: 'Invalid Investor or Tranche ID format' });
        }
        
        const investor = await Investor.findOne({ 
            _id: investorId, 
            organization: organizationId 
        });
        
        if (!investor) {
            return res.status(404).json({ msg: 'Investor not found within your organization.' });
        }

        const tranche = investor.tranches.id(trancheId);
        if (!tranche) {
            return res.status(404).json({ msg: 'Tranche not found for this investor.' });
        }

        // Check if this is a payment update that needs full processing
        const isPaymentUpdate = receivedAmount !== undefined && 
                               receivedAmount !== tranche.receivedAmount &&
                               receivedAmount > 0;

        if (isPaymentUpdate) {
            // Use calculation service for payment processing
            const paymentDetails = { paymentMethod, transactionReference, notes };
            const result = await FundraisingCalculationService.processTranchePayment(
                investorId, trancheId, receivedAmount, paymentDetails, organizationId
            );
            
            console.log(`[TRANCHE PAYMENT] ${result.investor.name} T${result.tranche.trancheNumber}: ₹${receivedAmount.toLocaleString()} processed`);
            
            const response = {
                ...result.investor.toObject(),
                investmentSummary: result.investor.getInvestmentSummary(),
                paymentProcessed: true,
                sharesAllocated: result.sharesPurchased,
                newTotalRaised: result.newTotalRaised
            };
            
            res.json(response);
            
        } else {
            // Simple field updates without payment processing
            if (trancheNumber !== undefined) tranche.trancheNumber = trancheNumber;
            if (agreedAmount !== undefined) tranche.agreedAmount = agreedAmount;
            if (dateAgreed !== undefined) tranche.dateAgreed = dateAgreed;
            if (triggerCondition !== undefined) tranche.triggerCondition = triggerCondition;
            if (status !== undefined) tranche.status = status;
            if (dateReceived !== undefined) tranche.dateReceived = dateReceived;
            if (paymentMethod !== undefined) tranche.paymentMethod = paymentMethod;
            if (transactionReference !== undefined) tranche.transactionReference = transactionReference;
            if (notes !== undefined) tranche.notes = notes;

            await investor.save();
            
            const response = {
                ...investor.toObject(),
                investmentSummary: investor.getInvestmentSummary(),
                paymentProcessed: false
            };
            
            console.log(`[TRANCHE UPDATED] ${investor.name} T${tranche.trancheNumber}: Fields updated`);
            res.json(response);
        }
        
    } catch (err) {
        console.error('Error updating tranche:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        }
        res.status(500).json({ msg: 'Server Error: Could not update tranche.' });
    }
};

/**
 * @desc    Delete tranche with cleanup
 * @route   DELETE /api/horizon/fundraising/investors/:investorId/tranches/:trancheId
 * @access  Private
 */
exports.deleteTranche = async (req, res) => {
    const { investorId, trancheId } = req.params;
    const organizationId = req.organization._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(investorId) || !mongoose.Types.ObjectId.isValid(trancheId)) {
            return res.status(400).json({ msg: 'Invalid Investor or Tranche ID format' });
        }
        
        const investor = await Investor.findOne({ 
            _id: investorId, 
            organization: organizationId 
        }).populate('roundId');
        
        if (!investor) {
            return res.status(404).json({ msg: 'Investor not found within your organization.' });
        }

        const tranche = investor.tranches.id(trancheId);
        if (!tranche) {
            return res.status(404).json({ msg: 'Tranche not found for this investor.' });
        }

        // Check if deleting a tranche with received payment
        const hadPayment = tranche.receivedAmount > 0;
        const amountToRemove = tranche.receivedAmount || 0;

        // Remove the tranche
        investor.tranches.pull({ _id: trancheId });
        await investor.save(); // Triggers recalculation of totals

        // If tranche had payment, need to update round and cap table
        if (hadPayment) {
            console.log(`[TRANCHE DELETE] Removing payment of ₹${amountToRemove.toLocaleString()}`);
            
            // Update round total
            if (investor.roundId) {
                investor.roundId.totalFundsReceived = Math.max(0, 
                    (investor.roundId.totalFundsReceived || 0) - amountToRemove
                );
                await investor.roundId.save();
            }
            
            // Recalculate all metrics
            await FundraisingCalculationService.recalculateRoundMetrics(
                investor.roundId._id, organizationId
            );
        }

        const response = {
            ...investor.toObject(),
            investmentSummary: investor.getInvestmentSummary(),
            amountRemoved: amountToRemove,
            hadPayment: hadPayment
        };
        
        console.log(`[TRANCHE DELETED] ${investor.name} tranche removed${hadPayment ? ` with ₹${amountToRemove.toLocaleString()} payment` : ''}`);
        res.json(response);
        
    } catch (err) {
        console.error('Error deleting tranche:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not delete tranche.' });
    }
};

// --- Module 1.4: Enhanced Cap Table Management ---

/**
 * @desc    Add cap table entry with automatic calculations
 * @route   POST /api/horizon/fundraising/captable
 * @access  Private
 */
exports.addCapTableEntry = async (req, res) => {
    const {
        shareholderName, shareholderType, numberOfShares, securityType,
        investmentAmount, currency, issueDate, grantDate, vestingSchedule, 
        cliffDate, exercisePrice, notes, roundId, linkedInvestorId
    } = req.body;
    
    const organizationId = req.organization._id;
    const userId = req.user._id;

    // Start a proper session for the transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        if (!shareholderName || !shareholderType || !securityType) {
            return res.status(400).json({ 
                msg: 'Shareholder name, type, and security type are required.' 
            });
        }
        
        if (!numberOfShares || parseFloat(numberOfShares) <= 0) {
            return res.status(400).json({ 
                msg: 'Number of shares must be greater than 0.' 
            });
        }
        
        const orgCurrency = req.organization.currency || 'INR';

        // Create the cap table entry
        const newEntry = new CapTableEntry({
            organization: organizationId,
            user: userId,
            shareholderName, 
            shareholderType, 
            numberOfShares: parseFloat(numberOfShares),
            securityType, 
            investmentAmount: parseFloat(investmentAmount) || null,
            currency: currency || orgCurrency,
            issueDate: issueDate || null, 
            grantDate: grantDate || null, 
            vestingSchedule, 
            cliffDate: cliffDate || null, 
            exercisePrice: parseFloat(exercisePrice) || null,
            notes: notes || '', 
            roundId: roundId || null,
            linkedInvestorId: linkedInvestorId || null,
            status: 'Active'
        });
        
        const entry = await newEntry.save({ session });
        
        // Calculate share price if investment amount is provided
        if (entry.investmentAmount && entry.numberOfShares > 0) {
            entry.sharePrice = entry.investmentAmount / entry.numberOfShares;
            entry.currentValue = entry.investmentAmount; // Initially same as investment
            await entry.save({ session });
        }
        
        // Update equity percentages for all entries
        await FundraisingCalculationService.updateAllEquityPercentages(organizationId, session);
        
        await session.commitTransaction();
        
        const response = {
            ...entry.toObject(),
            formattedInfo: entry.getFormattedInfo(),
            roi: entry.calculateROI()
        };
        
        console.log(`[CAP TABLE ENTRY] Added ${shareholderName}: ${numberOfShares} shares`);
        res.status(201).json(response);
        
    } catch (err) {
        await session.abortTransaction();
        console.error('Error adding cap table entry:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        }
        res.status(500).json({ msg: 'Server Error: Could not add cap table entry.' });
    } finally {
        session.endSession();
    }
};

/**
 * @desc    Get enhanced cap table summary
 * @route   GET /api/horizon/fundraising/captable
 * @access  Private
 */
exports.getCapTableSummary = async (req, res) => {
    const organizationId = req.organization._id;
    
    try {
        const entries = await CapTableEntry.find({ organization: organizationId })
            .populate('user', 'name email')
            .populate('roundId', 'name pricePerShare')
            .populate('investorId', 'name')
            .sort({ shareholderType: 1, createdAt: 1 });

        // Get aggregated statistics
        const stats = await CapTableEntry.getCapTableSummary(organizationId);
        const totalShares = await CapTableEntry.getTotalOutstandingShares(organizationId);
        
        // Enhance each entry with formatted data
        const enhancedEntries = entries.map(entry => ({
            ...entry.toObject(),
            formattedInfo: entry.getFormattedInfo(),
            roi: entry.calculateROI(),
            // Virtual fields
            isEquity: entry.isEquity,
            isUnconvertedInstrument: entry.isUnconvertedInstrument,
            effectiveOwnership: entry.effectiveOwnership
        }));

        const response = {
            entries: enhancedEntries,
            summary: {
                totalShares: totalShares[0]?.totalShares || 0,
                byType: stats,
                totalCurrentValue: enhancedEntries.reduce((sum, entry) => sum + (entry.currentValue || 0), 0),
                totalInvestment: enhancedEntries.reduce((sum, entry) => sum + (entry.investmentAmount || 0), 0)
            }
        };
        
        console.log(`[CAP TABLE SUMMARY] Retrieved ${enhancedEntries.length} entries, ${response.summary.totalShares.toLocaleString()} total shares`);
        res.json(response);
        
    } catch (err) {
        console.error('Error fetching cap table:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not fetch cap table.' });
    }
};

exports.getCapTableEntryById = async (req, res) => {
    const organizationId = req.organization._id;
    
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Cap Table Entry ID format' });
        }
        
        const entry = await CapTableEntry.findOne({ 
            _id: req.params.id, 
            organization: organizationId 
        })
        .populate('user', 'name email')
        .populate('roundId', 'name pricePerShare')
        .populate('investorId', 'name');
        
        if (!entry) {
            return res.status(404).json({ msg: 'Cap table entry not found within your organization.' });
        }
        
        const response = {
            ...entry.toObject(),
            formattedInfo: entry.getFormattedInfo(),
            roi: entry.calculateROI()
        };
        
        res.json(response);
        
    } catch (err) {
        console.error('Error fetching cap table entry by ID:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not fetch cap table entry.' });
    }
};

exports.updateCapTableEntry = async (req, res) => {
    const {
        shareholderName, shareholderType, numberOfShares, securityType,
        investmentAmount, currency, issueDate, grantDate, vestingSchedule, 
        cliffDate, exercisePrice, notes
    } = req.body;
    
    const organizationId = req.organization._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Cap Table Entry ID format' });
        }
        
        let entry = await CapTableEntry.findOne({ 
            _id: req.params.id, 
            organization: organizationId 
        });
        
        if (!entry) {
            return res.status(404).json({ msg: 'Cap table entry not found within your organization.' });
        }

        const updateFields = {};
        if (shareholderName !== undefined) updateFields.shareholderName = shareholderName;
        if (shareholderType !== undefined) updateFields.shareholderType = shareholderType;
        if (numberOfShares !== undefined) updateFields.numberOfShares = numberOfShares;
        if (securityType !== undefined) updateFields.securityType = securityType;
        if (investmentAmount !== undefined) updateFields.investmentAmount = investmentAmount;
        if (currency !== undefined) updateFields.currency = currency;
        if (issueDate !== undefined) updateFields.issueDate = issueDate;
        if (grantDate !== undefined) updateFields.grantDate = grantDate;
        if (vestingSchedule !== undefined) updateFields.vestingSchedule = vestingSchedule;
        if (cliffDate !== undefined) updateFields.cliffDate = cliffDate;
        if (exercisePrice !== undefined) updateFields.exercisePrice = exercisePrice;
        if (notes !== undefined) updateFields.notes = notes;

        entry = await CapTableEntry.findOneAndUpdate(
            { _id: req.params.id, organization: organizationId },
            { $set: updateFields },
            { new: true, runValidators: true }
        ).populate('user', 'name email');
        
        const response = {
            ...entry.toObject(),
            formattedInfo: entry.getFormattedInfo(),
            roi: entry.calculateROI()
        };
        
        res.json(response);
        
    } catch (err) {
        console.error('Error updating cap table entry:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        }
        res.status(500).json({ msg: 'Server Error: Could not update cap table entry.' });
    }
};

exports.deleteCapTableEntry = async (req, res) => {
    const organizationId = req.organization._id;
    
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Cap Table Entry ID format' });
        }
        
        const entry = await CapTableEntry.findOneAndDelete({ 
            _id: req.params.id, 
            organization: organizationId 
        });
        
        if (!entry) {
            return res.status(404).json({ msg: 'Cap table entry not found within your organization.' });
        }

        console.log(`[CAP TABLE DELETE] Removed ${entry.shareholderName}: ${entry.numberOfShares} shares`);
        res.json({ msg: 'Cap table entry removed', deletedEntry: entry.shareholderName });
        
    } catch (err) {
        console.error('Error deleting cap table entry:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not delete cap table entry.' });
    }
};

// --- New Enhanced Endpoints ---

/**
 * @desc    Get comprehensive fundraising dashboard
 * @route   GET /api/horizon/fundraising/dashboard
 * @access  Private
 */
exports.getFundraisingDashboard = async (req, res) => {
    const organizationId = req.organization._id;
    
    try {
        const dashboard = await FundraisingCalculationService.getFundraisingDashboard(organizationId);
        
        console.log(`[DASHBOARD] Generated fundraising dashboard with ${dashboard.rounds.length} rounds`);
        res.json(dashboard);
        
    } catch (err) {
        console.error('Error generating dashboard:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not generate fundraising dashboard.' });
    }
};

/**
 * @desc    Preview investment impact
 * @route   POST /api/horizon/fundraising/rounds/:roundId/preview-investment
 * @access  Private
 */
exports.previewInvestmentImpact = async (req, res) => {
    const { roundId } = req.params;
    const { investmentAmount } = req.body;
    const organizationId = req.organization._id;
    
    try {
        if (!investmentAmount || investmentAmount <= 0) {
            return res.status(400).json({ msg: 'Valid investment amount is required.' });
        }
        
        const preview = await FundraisingCalculationService.previewInvestmentImpact(
            roundId, investmentAmount, organizationId
        );
        
        console.log(`[INVESTMENT PREVIEW] ₹${investmentAmount.toLocaleString()} → ${preview.sharesAllocated} shares (${preview.equityPercentage}%)`);
        res.json(preview);
        
    } catch (err) {
        console.error('Error previewing investment:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not preview investment impact.' });
    }
};

/**
 * @desc    Manually trigger round recalculation
 * @route   POST /api/horizon/fundraising/rounds/:roundId/recalculate
 * @access  Private
 */
exports.recalculateRoundMetrics = async (req, res) => {
    const { roundId } = req.params;
    const organizationId = req.organization._id;
    
    try {
        const result = await FundraisingCalculationService.recalculateRoundMetrics(
            roundId, organizationId
        );
        
        console.log(`[MANUAL RECALC] Round ${roundId} recalculated: ${result.activeInvestors} investors, ₹${result.totalRaised.toLocaleString()} raised`);
        res.json({
            msg: 'Round metrics recalculated successfully',
            ...result
        });
        
    } catch (err) {
        console.error('Error recalculating round:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not recalculate round metrics.' });
    }
};

/**
 * @desc    Process bulk tranche payments
 * @route   POST /api/horizon/fundraising/bulk-payment
 * @access  Private
 */
exports.processBulkPayments = async (req, res) => {
    const { payments } = req.body;
    const organizationId = req.organization._id;
    
    try {
        if (!Array.isArray(payments) || payments.length === 0) {
            return res.status(400).json({ msg: 'Payments array is required and cannot be empty.' });
        }
        
        const result = await FundraisingCalculationService.processBulkTranchePayments(
            payments, organizationId
        );
        
        console.log(`[BULK PAYMENT] Processed ${result.totalProcessed} payments: ${result.successful.length} successful, ${result.failed.length} failed`);
        res.json({
            msg: `Bulk payment processing completed: ${result.successful.length} successful, ${result.failed.length} failed`,
            ...result
        });
        
    } catch (err) {
        console.error('Error processing bulk payments:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not process bulk payments.' });
    }
};

/**
 * @desc    Get investor analytics and statistics
 * @route   GET /api/horizon/fundraising/analytics/investors
 * @access  Private
 */
exports.getInvestorAnalytics = async (req, res) => {
    const organizationId = req.organization._id;
    const { roundId, dateFrom, dateTo, groupBy = 'month' } = req.query;
    
    try {
        const analytics = await FundraisingCalculationService.getInvestorAnalytics(
            organizationId, { roundId, dateFrom, dateTo, groupBy }
        );
        
        console.log(`[INVESTOR ANALYTICS] Generated analytics for ${analytics.totalInvestors} investors`);
        res.json(analytics);
        
    } catch (err) {
        console.error('Error generating investor analytics:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not generate investor analytics.' });
    }
};

/**
 * @desc    Get round performance metrics
 * @route   GET /api/horizon/fundraising/analytics/rounds
 * @access  Private
 */
exports.getRoundAnalytics = async (req, res) => {
    const organizationId = req.organization._id;
    const { includeProjections = false, compareToMarket = false } = req.query;
    
    try {
        const analytics = await FundraisingCalculationService.getRoundAnalytics(
            organizationId, { includeProjections, compareToMarket }
        );
        
        console.log(`[ROUND ANALYTICS] Generated analytics for ${analytics.totalRounds} rounds`);
        res.json(analytics);
        
    } catch (err) {
        console.error('Error generating round analytics:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not generate round analytics.' });
    }
};

/**
 * @desc    Export fundraising data
 * @route   GET /api/horizon/fundraising/export
 * @access  Private
 */
exports.exportFundraisingData = async (req, res) => {
    const organizationId = req.organization._id;
    const { format = 'json', includeCapTable = true, includeTransactions = true } = req.query;
    
    try {
        const exportData = await FundraisingCalculationService.exportFundraisingData(
            organizationId, { format, includeCapTable, includeTransactions }
        );
        
        // Set appropriate headers based on format
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=fundraising-data.csv');
        } else if (format === 'xlsx') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=fundraising-data.xlsx');
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=fundraising-data.json');
        }
        
        console.log(`[EXPORT] Generated ${format.toUpperCase()} export for organization ${organizationId}`);
        res.send(exportData);
        
    } catch (err) {
        console.error('Error exporting fundraising data:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not export fundraising data.' });
    }
};

/**
 * @desc    Validate fundraising data integrity
 * @route   POST /api/horizon/fundraising/validate
 * @access  Private
 */
exports.validateDataIntegrity = async (req, res) => {
    const organizationId = req.organization._id;
    const { autoFix = false, includeWarnings = true } = req.body;
    
    try {
        const validation = await FundraisingCalculationService.validateDataIntegrity(
            organizationId, { autoFix, includeWarnings }
        );
        
        console.log(`[VALIDATION] Data integrity check: ${validation.errors.length} errors, ${validation.warnings.length} warnings${autoFix ? ', auto-fixes applied' : ''}`);
        res.json({
            msg: `Data integrity validation completed: ${validation.errors.length} errors, ${validation.warnings.length} warnings`,
            ...validation
        });
        
    } catch (err) {
        console.error('Error validating data integrity:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not validate data integrity.' });
    }
};

/**
 * @desc    Get funding round templates
 * @route   GET /api/horizon/fundraising/templates
 * @access  Private
 */
exports.getRoundTemplates = async (req, res) => {
    const { roundType, stage, industry } = req.query;
    
    try {
        const templates = await FundraisingCalculationService.getRoundTemplates({
            roundType, stage, industry
        });
        
        console.log(`[TEMPLATES] Retrieved ${templates.length} round templates`);
        res.json(templates);
        
    } catch (err) {
        console.error('Error fetching round templates:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not fetch round templates.' });
    }
};

/**
 * @desc    Apply round template
 * @route   POST /api/horizon/fundraising/templates/:templateId/apply
 * @access  Private
 */
exports.applyRoundTemplate = async (req, res) => {
    const { templateId } = req.params;
    const { customizations = {} } = req.body;
    const organizationId = req.organization._id;
    const userId = req.user._id;
    
    try {
        const round = await FundraisingCalculationService.applyRoundTemplate(
            templateId, customizations, organizationId, userId
        );
        
        console.log(`[TEMPLATE APPLY] Applied template ${templateId} to create round: ${round.name}`);
        res.json({
            msg: 'Round template applied successfully',
            round: {
                ...round.toObject(),
                formattedValuation: round.getFormattedValuation(),
                progressSummary: round.getProgressSummary(),
                validation: round.validateReadyForInvestors()
            }
        });
        
    } catch (err) {
        console.error('Error applying round template:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not apply round template.' });
    }
};

/**
 * @desc    Get market benchmarks and comparisons
 * @route   GET /api/horizon/fundraising/benchmarks
 * @access  Private
 */
exports.getMarketBenchmarks = async (req, res) => {
    const organizationId = req.organization._id;
    const { industry, stage, region, includeMetrics = true } = req.query;
    
    try {
        const benchmarks = await FundraisingCalculationService.getMarketBenchmarks(
            organizationId, { industry, stage, region, includeMetrics }
        );
        
        console.log(`[BENCHMARKS] Retrieved market benchmarks for ${industry || 'all'} industry, ${stage || 'all'} stage`);
        res.json(benchmarks);
        
    } catch (err) {
        console.error('Error fetching market benchmarks:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not fetch market benchmarks.' });
    }
};

/**
 * @desc    Generate investor reports
 * @route   POST /api/horizon/fundraising/reports/investor
 * @access  Private
 */
exports.generateInvestorReport = async (req, res) => {
    const { investorId, reportType, period, includeProjections = false } = req.body;
    const organizationId = req.organization._id;
    
    try {
        if (!investorId || !reportType) {
            return res.status(400).json({ msg: 'Investor ID and report type are required.' });
        }
        
        const report = await FundraisingCalculationService.generateInvestorReport(
            investorId, organizationId, { reportType, period, includeProjections }
        );
        
        console.log(`[INVESTOR REPORT] Generated ${reportType} report for investor ${investorId}`);
        res.json({
            msg: 'Investor report generated successfully',
            report
        });
        
    } catch (err) {
        console.error('Error generating investor report:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not generate investor report.' });
    }
};

/**
 * @desc    Generate board presentation data
 * @route   POST /api/horizon/fundraising/reports/board
 * @access  Private
 */
exports.generateBoardReport = async (req, res) => {
    const { quarterYear, includeProjections = true, includeComparisons = true } = req.body;
    const organizationId = req.organization._id;
    
    try {
        const report = await FundraisingCalculationService.generateBoardReport(
            organizationId, { quarterYear, includeProjections, includeComparisons }
        );
        
        console.log(`[BOARD REPORT] Generated board report for ${quarterYear || 'current period'}`);
        res.json({
            msg: 'Board report generated successfully',
            report
        });
        
    } catch (err) {
        console.error('Error generating board report:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not generate board report.' });
    }
};

/**
 * @desc    Process convertible instrument conversion
 * @route   POST /api/horizon/fundraising/convert/:investorId
 * @access  Private
 */
exports.processConversion = async (req, res) => {
    const { investorId } = req.params;
    const { conversionTrigger, newRoundId, conversionTerms = {} } = req.body;
    const organizationId = req.organization._id;
    
    try {
        if (!conversionTrigger || !newRoundId) {
            return res.status(400).json({ msg: 'Conversion trigger and new round ID are required.' });
        }
        
        const result = await FundraisingCalculationService.processConversion(
            investorId, organizationId, { conversionTrigger, newRoundId, conversionTerms }
        );
        
        console.log(`[CONVERSION] Processed ${conversionTrigger} conversion for investor ${investorId}: ${result.sharesIssued} shares`);
        res.json({
            msg: 'Conversion processed successfully',
            ...result
        });
        
    } catch (err) {
        console.error('Error processing conversion:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not process conversion.' });
    }
};

/**
 * @desc    Set up automated reporting
 * @route   POST /api/horizon/fundraising/automation/reports
 * @access  Private
 */
exports.setupAutomatedReporting = async (req, res) => {
    const { reportConfig } = req.body;
    const organizationId = req.organization._id;
    
    try {
        if (!reportConfig || !reportConfig.frequency || !reportConfig.recipients) {
            return res.status(400).json({ msg: 'Report configuration with frequency and recipients is required.' });
        }
        
        const automation = await FundraisingCalculationService.setupAutomatedReporting(
            organizationId, reportConfig
        );
        
        console.log(`[AUTOMATION] Set up automated ${reportConfig.frequency} reporting for ${reportConfig.recipients.length} recipients`);
        res.json({
            msg: 'Automated reporting configured successfully',
            automation
        });
        
    } catch (err) {
        console.error('Error setting up automated reporting:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not setup automated reporting.' });
    }
};

/**
 * @desc    Get fundraising insights and recommendations
 * @route   GET /api/horizon/fundraising/insights
 * @access  Private
 */
exports.getFundraisingInsights = async (req, res) => {
    const organizationId = req.organization._id;
    const { includeRecommendations = true, includePredictions = false } = req.query;
    
    try {
        const insights = await FundraisingCalculationService.getFundraisingInsights(
            organizationId, { includeRecommendations, includePredictions }
        );
        
        console.log(`[INSIGHTS] Generated fundraising insights with ${insights.recommendations?.length || 0} recommendations`);
        res.json(insights);
        
    } catch (err) {
        console.error('Error generating fundraising insights:', err.message, err.stack);
        res.status(500).json({ msg: 'Server Error: Could not generate fundraising insights.' });
    }
};

module.exports = exports;