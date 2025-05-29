// updated_controllers/fundraisingController.js
const Round = require('../models/roundModel'); // Phase 4 updated model
const Investor = require('../models/investorModel'); // Phase 4 updated model
const CapTableEntry = require('../models/capTableEntryModel'); // Phase 4 updated model
const mongoose = require('mongoose');

// --- Module 1.1: Round Management ---
// @desc    Create a new fundraising round for the active organization
// @route   POST /api/horizon/fundraising/rounds
// @access  Private (Requires 'owner' or 'member' role)
exports.createRound = async (req, res) => {
    const {
        name, targetAmount, currency, // Added currency
        currentValuationPreMoney, currentValuationPostMoney,
        softCommitmentsTotal, hardCommitmentsTotal, totalFundsReceived,
        openDate, targetCloseDate, actualCloseDate, status, roundType, notes // Added actualCloseDate, roundType
    } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id;

    try {
        if (!name || targetAmount === undefined) { // Target amount can be 0
            return res.status(400).json({ msg: 'Please provide a name and target amount for the round.' });
        }
        const orgCurrency = req.organization.currency || 'INR';

        const newRound = new Round({
            organization: organizationId, // Scope to organization
            createdBy: userId,          // Track creator
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
            notes
        });
        const round = await newRound.save();
        res.status(201).json(round);
    } catch (err) {
        console.error('Error creating round:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        if (err.code === 11000) {
             return res.status(400).json({ msg: 'A round with this name might already exist for your organization.' });
        }
        res.status(500).send('Server Error: Could not create round.');
    }
};

// @desc    Get all fundraising rounds for the active organization
// @route   GET /api/horizon/fundraising/rounds
// @access  Private
exports.getRounds = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        // --- MULTI-TENANCY: Filter by organizationId ---
        const rounds = await Round.find({ organization: organizationId }).sort({ openDate: -1 });
        res.json(rounds);
    } catch (err) {
        console.error('Error fetching rounds:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch rounds.');
    }
};

// @desc    Get a single fundraising round by ID for the active organization
// @route   GET /api/horizon/fundraising/rounds/:id
// @access  Private
exports.getRoundById = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const round = await Round.findOne({ _id: req.params.id, organization: organizationId });
        if (!round) return res.status(404).json({ msg: 'Round not found within your organization.' });
        res.json(round);
    } catch (err) {
        console.error('Error fetching round by ID:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch round.');
    }
};

// @desc    Update a fundraising round for the active organization
// @route   PUT /api/horizon/fundraising/rounds/:id
// @access  Private
exports.updateRound = async (req, res) => {
    const { /* Destructure all fields from Round model */
        name, targetAmount, currency, currentValuationPreMoney, currentValuationPostMoney,
        softCommitmentsTotal, hardCommitmentsTotal, totalFundsReceived,
        openDate, targetCloseDate, actualCloseDate, status, roundType, notes
    } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // For updatedBy if model supports

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        let round = await Round.findOne({ _id: req.params.id, organization: organizationId });
        if (!round) return res.status(404).json({ msg: 'Round not found within your organization.' });

        // Build update object carefully
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
        // if (userId && round.updatedBy !== undefined) round.updatedBy = userId; // If Round model has updatedBy

        round = await Round.findOneAndUpdate(
            { _id: req.params.id, organization: organizationId }, // Ensure org match
            { $set: updateFields },
            { new: true, runValidators: true }
        );
        res.json(round);
    } catch (err) {
        console.error('Error updating round:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        if (err.code === 11000) {
             return res.status(400).json({ msg: 'A round with this name might already exist for your organization.' });
        }
        res.status(500).send('Server Error: Could not update round.');
    }
};

// @desc    Delete a fundraising round for the active organization
// @route   DELETE /api/horizon/fundraising/rounds/:id
// @access  Private
exports.deleteRound = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const round = await Round.findOne({ _id: req.params.id, organization: organizationId });
        if (!round) return res.status(404).json({ msg: 'Round not found within your organization.' });

        // --- MULTI-TENANCY: Ensure associated investors are also scoped by organization when deleting ---
        await Investor.deleteMany({ roundId: req.params.id, organization: organizationId });
        // Also consider deleting CapTableEntries linked to this round and organization
        await CapTableEntry.deleteMany({ /* some link to round, */ organization: organizationId });


        await Round.findByIdAndDelete(req.params.id); // Already confirmed it belongs to the org
        res.json({ msg: 'Round and associated investors/cap table entries (for this org) removed' });
    } catch (err) {
        console.error('Error deleting round:', err.message, err.stack);
        res.status(500).send('Server Error: Could not delete round.');
    }
};

// --- Module 1.2: Investor Relationship Tracking ---
// @desc    Add a new investor (linked to a round) for the active organization
// @route   POST /api/horizon/fundraising/investors
// @access  Private
exports.addInvestor = async (req, res) => {
    const {
        name, contactPerson, email, phone, entityName, investorType, investmentVehicle, // Added investorType
        safeValuationCap, safeDiscountRate, noteInterestRate, noteMaturityDate,
        totalCommittedAmount, roundId, status, notes, currency // Added currency
    } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // For addedBy field

    try {
        if (!name || !roundId || totalCommittedAmount === undefined) {
            return res.status(400).json({ msg: 'Investor name, round ID, and total committed amount are required.' });
        }
        if (!mongoose.Types.ObjectId.isValid(roundId)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }
        // --- MULTI-TENANCY: Ensure the round exists and belongs to the organization ---
        const roundExists = await Round.findOne({ _id: roundId, organization: organizationId });
        if (!roundExists) {
            return res.status(404).json({ msg: 'Specified round not found within your organization.' });
        }
        const orgCurrency = req.organization.currency || 'INR';

        const newInvestor = new Investor({
            organization: organizationId, // Scope to organization
            addedBy: userId,            // Track creator
            name, contactPerson, email, phone, entityName, investorType, investmentVehicle,
            safeValuationCap, safeDiscountRate, noteInterestRate, noteMaturityDate,
            totalCommittedAmount,
            currency: currency || orgCurrency, // Currency for committed amount
            roundId, // This investor entry is specific to this round and org
            status, notes
        });
        const investor = await newInvestor.save();
        res.status(201).json(investor);
    } catch (err) {
        console.error('Error adding investor:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message });
         if (err.code === 11000) { // Handle unique index violation (e.g., org + email for investor)
             return res.status(400).json({ msg: 'An investor with this email might already exist for your organization.' });
        }
        res.status(500).send('Server Error: Could not add investor.');
    }
};

// @desc    Get all investors for the active organization (optionally filter by roundId)
// @route   GET /api/horizon/fundraising/investors
// @access  Private
exports.getInvestors = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        // --- MULTI-TENANCY: Base query includes organizationId ---
        const query = { organization: organizationId };
        if (req.query.roundId) {
            if (!mongoose.Types.ObjectId.isValid(req.query.roundId)) {
                return res.status(400).json({ msg: 'Invalid Round ID format for filtering' });
            }
            // Ensure the roundId also belongs to the organization for security, though query on Investor model already filters by org.
            query.roundId = req.query.roundId;
        }
        const investors = await Investor.find(query)
            .populate({ // Populate round details, ensuring round also belongs to the org
                path: 'roundId',
                match: { organization: organizationId }, // Only populate if round matches org
                select: 'name targetAmount currency'
            })
            .populate('addedBy', 'name email') // Populate creator
            .sort({ createdAt: -1 });

        // Filter out investors whose roundId didn't match the organization (if populate match fails)
        const validInvestors = investors.filter(inv => inv.roundId !== null || !req.query.roundId);


        res.json(validInvestors);
    } catch (err) {
        console.error('Error fetching investors:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch investors.');
    }
};

// @desc    Get a specific investor by ID for the active organization
// @route   GET /api/horizon/fundraising/investors/:id
// @access  Private
exports.getInvestorById = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const investor = await Investor.findOne({ _id: req.params.id, organization: organizationId })
            .populate('roundId', 'name currency')
            .populate('addedBy', 'name email');
        if (!investor) return res.status(404).json({ msg: 'Investor not found within your organization.' });
        res.json(investor);
    } catch (err) {
        console.error('Error fetching investor by ID:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch investor.');
    }
};

// @desc    Update an investor for the active organization
// @route   PUT /api/horizon/fundraising/investors/:id
// @access  Private
exports.updateInvestor = async (req, res) => {
    const { /* Destructure all fields from Investor model */
        name, contactPerson, email, phone, entityName, investorType, investmentVehicle,
        safeValuationCap, safeDiscountRate, noteInterestRate, noteMaturityDate,
        totalCommittedAmount, currency, status, notes // roundId typically not changed here
    } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // For updatedBy if model supports

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        let investor = await Investor.findOne({ _id: req.params.id, organization: organizationId });
        if (!investor) return res.status(404).json({ msg: 'Investor not found within your organization.' });

        // Build update object carefully
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
        // if (userId && investor.updatedBy !== undefined) investor.updatedBy = userId; // If Investor model has updatedBy

        investor = await Investor.findOneAndUpdate(
            { _id: req.params.id, organization: organizationId }, // Ensure org match
            { $set: updateFields },
            { new: true, runValidators: true }
        ).populate('roundId', 'name currency').populate('addedBy', 'name email');
        res.json(investor);
    } catch (err) {
        console.error('Error updating investor:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        if (err.code === 11000) {
             return res.status(400).json({ msg: 'An investor with this email might already exist for your organization.' });
        }
        res.status(500).send('Server Error: Could not update investor.');
    }
};

// @desc    Delete an investor for the active organization
// @route   DELETE /api/horizon/fundraising/investors/:id
// @access  Private
exports.deleteInvestor = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const investor = await Investor.findOneAndDelete({ _id: req.params.id, organization: organizationId });
        if (!investor) return res.status(404).json({ msg: 'Investor not found within your organization or already deleted.' });

        res.json({ msg: 'Investor removed' });
    } catch (err) {
        console.error('Error deleting investor:', err.message, err.stack);
        res.status(500).send('Server Error: Could not delete investor.');
    }
};

// --- Module 1.3: Tranche Tracking ---
// @desc    Add a tranche to a specific investor of the active organization
// @route   POST /api/horizon/fundraising/investors/:investorId/tranches
// @access  Private
exports.addTranche = async (req, res) => {
    const { investorId } = req.params;
    const { trancheNumber, agreedAmount, dateAgreed, triggerCondition, status, dateReceived, receivedAmount } = req.body;
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(investorId)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        // --- MULTI-TENANCY: Ensure investor belongs to the active organization ---
        const investor = await Investor.findOne({ _id: investorId, organization: organizationId });
        if (!investor) return res.status(404).json({ msg: 'Investor not found within your organization.' });

        if (trancheNumber === undefined || agreedAmount === undefined) {
            return res.status(400).json({ msg: 'Tranche number and agreed amount are required.' });
        }

        const newTranche = {
            trancheNumber, agreedAmount, dateAgreed, triggerCondition,
            status: status || 'Pending', dateReceived, receivedAmount
        };
        investor.tranches.push(newTranche);
        await investor.save(); // Triggers pre-save on Investor model to update totals
        res.status(201).json(investor);
    } catch (err) {
        console.error('Error adding tranche:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        res.status(500).send('Server Error: Could not add tranche.');
    }
};

// @desc    Update a specific tranche for an investor of the active organization
// @route   PUT /api/horizon/fundraising/investors/:investorId/tranches/:trancheObjectId
// @access  Private
exports.updateTranche = async (req, res) => {
    const { investorId, trancheObjectId } = req.params; // Assuming trancheObjectId is the _id of the subdocument
    const { trancheNumber, agreedAmount, dateAgreed, triggerCondition, status, dateReceived, receivedAmount } = req.body;
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(investorId) || !mongoose.Types.ObjectId.isValid(trancheObjectId)) {
            return res.status(400).json({ msg: 'Invalid Investor or Tranche Object ID format' });
        }
        // --- MULTI-TENANCY: Ensure investor belongs to the active organization ---
        const investor = await Investor.findOne({ _id: investorId, organization: organizationId });
        if (!investor) return res.status(404).json({ msg: 'Investor not found within your organization.' });

        const tranche = investor.tranches.id(trancheObjectId); // Mongoose way to get subdocument by its _id
        if (!tranche) return res.status(404).json({ msg: 'Tranche not found for this investor.' });

        // Update tranche fields if provided
        if (trancheNumber !== undefined) tranche.trancheNumber = trancheNumber;
        if (agreedAmount !== undefined) tranche.agreedAmount = agreedAmount;
        if (dateAgreed !== undefined) tranche.dateAgreed = dateAgreed;
        if (triggerCondition !== undefined) tranche.triggerCondition = triggerCondition;
        if (status !== undefined) tranche.status = status;
        if (dateReceived !== undefined) tranche.dateReceived = dateReceived;
        if (receivedAmount !== undefined) tranche.receivedAmount = receivedAmount;

        await investor.save(); // Triggers pre-save on Investor model
        res.json(investor);
    } catch (err) {
        console.error('Error updating tranche:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        res.status(500).send('Server Error: Could not update tranche.');
    }
};

// @desc    Delete a specific tranche for an investor of the active organization
// @route   DELETE /api/horizon/fundraising/investors/:investorId/tranches/:trancheObjectId
// @access  Private
exports.deleteTranche = async (req, res) => {
    const { investorId, trancheObjectId } = req.params;
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(investorId) || !mongoose.Types.ObjectId.isValid(trancheObjectId)) {
            return res.status(400).json({ msg: 'Invalid Investor or Tranche Object ID format' });
        }
        // --- MULTI-TENANCY: Ensure investor belongs to the active organization ---
        const investor = await Investor.findOne({ _id: investorId, organization: organizationId });
        if (!investor) return res.status(404).json({ msg: 'Investor not found within your organization.' });

        const tranche = investor.tranches.id(trancheObjectId);
        if (!tranche) return res.status(404).json({ msg: 'Tranche not found for this investor.' });

        investor.tranches.pull({ _id: trancheObjectId }); // Mongoose method to remove subdocument from array

        await investor.save(); // Triggers pre-save on Investor model
        res.json(investor);
    } catch (err) {
        console.error('Error deleting tranche:', err.message, err.stack);
        res.status(500).send('Server Error: Could not delete tranche.');
    }
};

// --- Module 1.4: Cap Table Management ---
// @desc    Add an entry to the cap table for the active organization
// @route   POST /api/horizon/fundraising/captable
// @access  Private
exports.addCapTableEntry = async (req, res) => {
    const {
        shareholderName, shareholderType, numberOfShares, securityType, // Removed percentageOwnership
        investmentAmount, currency, issueDate, grantDate, vestingSchedule, cliffDate, exercisePrice, notes // Added currency, issueDate, vesting, cliff, exercisePrice
    } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // For 'user' field in CapTableEntry model

    try {
        if (!shareholderName || !shareholderType || !securityType) {
            return res.status(400).json({ msg: 'Shareholder name, type, and security type are required.' });
        }
        const orgCurrency = req.organization.currency || 'INR';

        const newEntry = new CapTableEntry({
            organization: organizationId, // Scope to organization
            user: userId,                 // Track creator
            shareholderName, shareholderType, numberOfShares,
            securityType, investmentAmount,
            currency: currency || orgCurrency, // Currency for investmentAmount & exercisePrice
            issueDate, grantDate, vestingSchedule, cliffDate, exercisePrice,
            notes
            // percentageOwnership is calculated, not stored directly
        });
        const entry = await newEntry.save();
        res.status(201).json(entry);
    } catch (err) {
        console.error('Error adding cap table entry:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        res.status(500).send('Server Error: Could not add cap table entry.');
    }
};

// @desc    Get all cap table entries for the active organization
// @route   GET /api/horizon/fundraising/captable
// @access  Private
exports.getCapTableSummary = async (req, res) => { // Renamed from getCapTableEntries for clarity if it's a summary
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        // --- MULTI-TENANCY: Filter by organizationId ---
        const entries = await CapTableEntry.find({ organization: organizationId })
            .populate('user', 'name email') // Populate creator
            .sort({ shareholderType: 1, createdAt: 1 });

        // TODO: Implement dynamic calculation of percentageOwnership here if needed for summary
        // This would require fetching total outstanding shares for the organization.
        // For now, returning entries as stored.
        res.json(entries);
    } catch (err) {
        console.error('Error fetching cap table entries:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch cap table.');
    }
};

// @desc    Get a specific cap table entry by ID for the active organization
// @route   GET /api/horizon/fundraising/captable/:id
// @access  Private
exports.getCapTableEntryById = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Cap Table Entry ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const entry = await CapTableEntry.findOne({ _id: req.params.id, organization: organizationId })
            .populate('user', 'name email');
        if (!entry) return res.status(404).json({ msg: 'Cap table entry not found within your organization.' });
        res.json(entry);
    } catch (err) {
        console.error('Error fetching cap table entry by ID:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch cap table entry.');
    }
};

// @desc    Update a cap table entry for the active organization
// @route   PUT /api/horizon/fundraising/captable/:id
// @access  Private
exports.updateCapTableEntry = async (req, res) => {
    const { /* Destructure all fields from CapTableEntry model */
        shareholderName, shareholderType, numberOfShares, securityType,
        investmentAmount, currency, issueDate, grantDate, vestingSchedule, cliffDate, exercisePrice, notes
    } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // For updatedBy if model supports

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Cap Table Entry ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        let entry = await CapTableEntry.findOne({ _id: req.params.id, organization: organizationId });
        if (!entry) return res.status(404).json({ msg: 'Cap table entry not found within your organization.' });

        // Build update object
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
        // if (userId && entry.updatedBy !== undefined) entry.updatedBy = userId; // If model supports updatedBy

        entry = await CapTableEntry.findOneAndUpdate(
            { _id: req.params.id, organization: organizationId }, // Ensure org match
            { $set: updateFields },
            { new: true, runValidators: true }
        ).populate('user', 'name email');
        res.json(entry);
    } catch (err) {
        console.error('Error updating cap table entry:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        res.status(500).send('Server Error: Could not update cap table entry.');
    }
};

// @desc    Delete a cap table entry for the active organization
// @route   DELETE /api/horizon/fundraising/captable/:id
// @access  Private
exports.deleteCapTableEntry = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Cap Table Entry ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const entry = await CapTableEntry.findOneAndDelete({ _id: req.params.id, organization: organizationId });
        if (!entry) return res.status(404).json({ msg: 'Cap table entry not found within your organization or already deleted.' });

        res.json({ msg: 'Cap table entry removed' });
    } catch (err) {
        console.error('Error deleting cap table entry:', err.message, err.stack);
        res.status(500).send('Server Error: Could not delete cap table entry.');
    }
};