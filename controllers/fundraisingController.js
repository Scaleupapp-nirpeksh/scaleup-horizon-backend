// controllers/fundraisingController.js
const Round = require('../models/roundModel');
const Investor = require('../models/investorModel');
const CapTableEntry = require('../models/capTableEntryModel');
const mongoose = require('mongoose');


// --- Module 1.1: Round Management ---
// @desc    Create a new fundraising round
// @route   POST /api/horizon/fundraising/rounds
// @access  Private (Founders)
exports.createRound = async (req, res) => {
    const {
        name,
        targetAmount,
        currentValuationPreMoney,
        currentValuationPostMoney,
        softCommitmentsTotal,
        hardCommitmentsTotal,
        totalFundsReceived,
        openDate,
        targetCloseDate,
        status,
        notes
    } = req.body;

    try {
        if (!name || !targetAmount) {
            return res.status(400).json({ msg: 'Please provide a name and target amount for the round.' });
        }
        const newRound = new Round({
            name, targetAmount, currentValuationPreMoney, currentValuationPostMoney,
            softCommitmentsTotal, hardCommitmentsTotal, totalFundsReceived,
            openDate, targetCloseDate, status, notes
            // createdBy: req.horizonUser.id // If tracking creator
        });
        const round = await newRound.save();
        res.status(201).json(round);
    } catch (err) {
        console.error('Error creating round:', err.message);
        res.status(500).send('Server Error: Could not create round.');
    }
};

// @desc    Get all fundraising rounds
// @route   GET /api/horizon/fundraising/rounds
// @access  Private (Founders)
exports.getRounds = async (req, res) => {
    try {
        const rounds = await Round.find().sort({ openDate: -1 });
        res.json(rounds);
    } catch (err) {
        console.error('Error fetching rounds:', err.message);
        res.status(500).send('Server Error: Could not fetch rounds.');
    }
};

// @desc    Get a single fundraising round by ID
// @route   GET /api/horizon/fundraising/rounds/:id
// @access  Private (Founders)
exports.getRoundById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }
        const round = await Round.findById(req.params.id);
        if (!round) return res.status(404).json({ msg: 'Round not found' });
        res.json(round);
    } catch (err) {
        console.error('Error fetching round by ID:', err.message);
        res.status(500).send('Server Error: Could not fetch round.');
    }
};

// @desc    Update a fundraising round
// @route   PUT /api/horizon/fundraising/rounds/:id
// @access  Private (Founders)
exports.updateRound = async (req, res) => {
    const {
        name, targetAmount, currentValuationPreMoney, currentValuationPostMoney,
        softCommitmentsTotal, hardCommitmentsTotal, totalFundsReceived,
        openDate, targetCloseDate, status, notes
    } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }
        let round = await Round.findById(req.params.id);
        if (!round) return res.status(404).json({ msg: 'Round not found' });

        const roundFields = {};
        if (name !== undefined) roundFields.name = name;
        if (targetAmount !== undefined) roundFields.targetAmount = targetAmount;
        if (currentValuationPreMoney !== undefined) roundFields.currentValuationPreMoney = currentValuationPreMoney;
        if (currentValuationPostMoney !== undefined) roundFields.currentValuationPostMoney = currentValuationPostMoney;
        if (softCommitmentsTotal !== undefined) roundFields.softCommitmentsTotal = softCommitmentsTotal;
        if (hardCommitmentsTotal !== undefined) roundFields.hardCommitmentsTotal = hardCommitmentsTotal;
        if (totalFundsReceived !== undefined) roundFields.totalFundsReceived = totalFundsReceived;
        if (openDate !== undefined) roundFields.openDate = openDate;
        if (targetCloseDate !== undefined) roundFields.targetCloseDate = targetCloseDate;
        if (status !== undefined) roundFields.status = status;
        if (notes !== undefined) roundFields.notes = notes;
        roundFields.updatedAt = Date.now();

        round = await Round.findByIdAndUpdate(req.params.id, { $set: roundFields }, { new: true });
        res.json(round);
    } catch (err) {
        console.error('Error updating round:', err.message);
        res.status(500).send('Server Error: Could not update round.');
    }
};

// @desc    Delete a fundraising round
// @route   DELETE /api/horizon/fundraising/rounds/:id
// @access  Private (Founders)
exports.deleteRound = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }
        const round = await Round.findById(req.params.id);
        if (!round) return res.status(404).json({ msg: 'Round not found' });

        await Investor.deleteMany({ roundId: req.params.id });
        await Round.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Round and associated investors removed' });
    } catch (err) {
        console.error('Error deleting round:', err.message);
        res.status(500).send('Server Error: Could not delete round.');
    }
};

// --- Module 1.2: Investor Relationship Tracking ---
// @desc    Add a new investor to a round
// @route   POST /api/horizon/fundraising/investors
// @access  Private
exports.addInvestor = async (req, res) => {
    const {
        name, contactPerson, email, phone, entityName, investmentVehicle,
        safeValuationCap, safeDiscountRate, noteInterestRate, noteMaturityDate,
        totalCommittedAmount, roundId, status, notes
    } = req.body;
    try {
        if (!name || !roundId || totalCommittedAmount === undefined) {
            return res.status(400).json({ msg: 'Investor name, round ID, and total committed amount are required.' });
        }
        if (!mongoose.Types.ObjectId.isValid(roundId)) {
            return res.status(400).json({ msg: 'Invalid Round ID format' });
        }
        const roundExists = await Round.findById(roundId);
        if (!roundExists) {
            return res.status(404).json({ msg: 'Specified round not found.' });
        }

        const newInvestor = new Investor({
            name, contactPerson, email, phone, entityName, investmentVehicle,
            safeValuationCap, safeDiscountRate, noteInterestRate, noteMaturityDate,
            totalCommittedAmount, roundId, status, notes
        });
        const investor = await newInvestor.save();
        res.status(201).json(investor);
    } catch (err) {
        console.error('Error adding investor:', err.message);
        res.status(500).send('Server Error: Could not add investor.');
    }
};

// @desc    Get all investors (optionally filter by roundId)
// @route   GET /api/horizon/fundraising/investors
// @access  Private
exports.getInvestors = async (req, res) => {
    try {
        const query = {};
        if (req.query.roundId) {
            if (!mongoose.Types.ObjectId.isValid(req.query.roundId)) {
                return res.status(400).json({ msg: 'Invalid Round ID format for filtering' });
            }
            query.roundId = req.query.roundId;
        }
        const investors = await Investor.find(query).populate('roundId', 'name targetAmount').sort({ createdAt: -1 });
        res.json(investors);
    } catch (err) {
        console.error('Error fetching investors:', err.message);
        res.status(500).send('Server Error: Could not fetch investors.');
    }
};

// @desc    Get a specific investor by ID
// @route   GET /api/horizon/fundraising/investors/:id
// @access  Private
exports.getInvestorById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        const investor = await Investor.findById(req.params.id).populate('roundId', 'name');
        if (!investor) return res.status(404).json({ msg: 'Investor not found' });
        res.json(investor);
    } catch (err) {
        console.error('Error fetching investor by ID:', err.message);
        res.status(500).send('Server Error: Could not fetch investor.');
    }
};

// @desc    Update an investor
// @route   PUT /api/horizon/fundraising/investors/:id
// @access  Private
exports.updateInvestor = async (req, res) => {
    const {
        name, contactPerson, email, phone, entityName, investmentVehicle,
        safeValuationCap, safeDiscountRate, noteInterestRate, noteMaturityDate,
        totalCommittedAmount, status, notes // roundId typically shouldn't change here
    } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        let investor = await Investor.findById(req.params.id);
        if (!investor) return res.status(404).json({ msg: 'Investor not found' });

        const investorFields = { updatedAt: Date.now() };
        // Only update fields that are actually provided in the request
        if (name !== undefined) investorFields.name = name;
        if (contactPerson !== undefined) investorFields.contactPerson = contactPerson;
        if (email !== undefined) investorFields.email = email;
        if (phone !== undefined) investorFields.phone = phone;
        if (entityName !== undefined) investorFields.entityName = entityName;
        if (investmentVehicle !== undefined) investorFields.investmentVehicle = investmentVehicle;
        if (safeValuationCap !== undefined) investorFields.safeValuationCap = safeValuationCap;
        if (safeDiscountRate !== undefined) investorFields.safeDiscountRate = safeDiscountRate;
        if (noteInterestRate !== undefined) investorFields.noteInterestRate = noteInterestRate;
        if (noteMaturityDate !== undefined) investorFields.noteMaturityDate = noteMaturityDate;
        if (totalCommittedAmount !== undefined) investorFields.totalCommittedAmount = totalCommittedAmount;
        if (status !== undefined) investorFields.status = status;
        if (notes !== undefined) investorFields.notes = notes;

        investor = await Investor.findByIdAndUpdate(req.params.id, { $set: investorFields }, { new: true })
            .populate('roundId', 'name');
        res.json(investor);
    } catch (err) {
        console.error('Error updating investor:', err.message);
        res.status(500).send('Server Error: Could not update investor.');
    }
};

// @desc    Delete an investor
// @route   DELETE /api/horizon/fundraising/investors/:id
// @access  Private
exports.deleteInvestor = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        const investor = await Investor.findById(req.params.id);
        if (!investor) return res.status(404).json({ msg: 'Investor not found' });
        
        await Investor.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Investor removed' });
    } catch (err) {
        console.error('Error deleting investor:', err.message);
        res.status(500).send('Server Error: Could not delete investor.');
    }
};

// --- Module 1.3: Tranche Tracking ---
// @desc    Add a tranche to a specific investor
// @route   POST /api/horizon/fundraising/investors/:investorId/tranches
// @access  Private
exports.addTranche = async (req, res) => {
    const { investorId } = req.params;
    const { trancheNumber, agreedAmount, dateAgreed, triggerCondition, status, dateReceived, receivedAmount } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(investorId)) {
            return res.status(400).json({ msg: 'Invalid Investor ID format' });
        }
        const investor = await Investor.findById(investorId);
        if (!investor) return res.status(404).json({ msg: 'Investor not found' });

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
            receivedAmount
        };
        investor.tranches.push(newTranche);
        await investor.save(); // This will also trigger the pre-save hook to update totals
        res.status(201).json(investor);
    } catch (err) {
        console.error('Error adding tranche:', err.message);
        res.status(500).send('Server Error: Could not add tranche.');
    }
};

// @desc    Update a specific tranche for an investor
// @route   PUT /api/horizon/fundraising/investors/:investorId/tranches/:trancheId
// @access  Private
exports.updateTranche = async (req, res) => {
    const { investorId, trancheId } = req.params;
    const { trancheNumber, agreedAmount, dateAgreed, triggerCondition, status, dateReceived, receivedAmount } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(investorId) || !mongoose.Types.ObjectId.isValid(trancheId)) {
            return res.status(400).json({ msg: 'Invalid Investor or Tranche ID format' });
        }
        const investor = await Investor.findById(investorId);
        if (!investor) return res.status(404).json({ msg: 'Investor not found' });

        const tranche = investor.tranches.id(trancheId);
        if (!tranche) return res.status(404).json({ msg: 'Tranche not found' });

        if (trancheNumber !== undefined) tranche.trancheNumber = trancheNumber;
        if (agreedAmount !== undefined) tranche.agreedAmount = agreedAmount;
        if (dateAgreed !== undefined) tranche.dateAgreed = dateAgreed;
        if (triggerCondition !== undefined) tranche.triggerCondition = triggerCondition;
        if (status !== undefined) tranche.status = status;
        if (dateReceived !== undefined) tranche.dateReceived = dateReceived;
        if (receivedAmount !== undefined) tranche.receivedAmount = receivedAmount;

        await investor.save(); // This will also trigger the pre-save hook
        res.json(investor);
    } catch (err) {
        console.error('Error updating tranche:', err.message);
        res.status(500).send('Server Error: Could not update tranche.');
    }
};

// @desc    Delete a specific tranche for an investor
// @route   DELETE /api/horizon/fundraising/investors/:investorId/tranches/:trancheId
// @access  Private
exports.deleteTranche = async (req, res) => {
    const { investorId, trancheId } = req.params;
    try {
        if (!mongoose.Types.ObjectId.isValid(investorId) || !mongoose.Types.ObjectId.isValid(trancheId)) {
            return res.status(400).json({ msg: 'Invalid Investor or Tranche ID format' });
        }
        const investor = await Investor.findById(investorId);
        if (!investor) return res.status(404).json({ msg: 'Investor not found' });

        const tranche = investor.tranches.id(trancheId);
        if (!tranche) return res.status(404).json({ msg: 'Tranche not found' });
        
        // Mongoose subdocument removal
        investor.tranches.pull({ _id: trancheId }); // or tranche.remove() then investor.save()

        await investor.save(); // This will also trigger the pre-save hook
        res.json(investor);
    } catch (err) {
        console.error('Error deleting tranche:', err.message);
        res.status(500).send('Server Error: Could not delete tranche.');
    }
};

// --- Module 1.4: Cap Table Management ---
// @desc    Add an entry to the cap table
// @route   POST /api/horizon/fundraising/captable
// @access  Private
exports.addCapTableEntry = async (req, res) => {
    const {
        shareholderName, shareholderType, numberOfShares,
        percentageOwnership, securityType, investmentAmount, grantDate, notes
    } = req.body;
    try {
        if (!shareholderName || !shareholderType || !securityType) {
            return res.status(400).json({ msg: 'Shareholder name, type, and security type are required.' });
        }
        const newEntry = new CapTableEntry({
            shareholderName, shareholderType, numberOfShares,
            percentageOwnership, securityType, investmentAmount, grantDate, notes
        });
        const entry = await newEntry.save();
        res.status(201).json(entry);
    } catch (err) {
        console.error('Error adding cap table entry:', err.message);
        res.status(500).send('Server Error: Could not add cap table entry.');
    }
};

// @desc    Get all cap table entries (summary or full list for MVP)
// @route   GET /api/horizon/fundraising/captable
// @access  Private
exports.getCapTableSummary = async (req, res) => {
    try {
        const entries = await CapTableEntry.find().sort({ shareholderType: 1, createdAt: 1 });
        // For a true summary, you might aggregate percentages by shareholderType
        res.json(entries);
    } catch (err) {
        console.error('Error fetching cap table entries:', err.message);
        res.status(500).send('Server Error: Could not fetch cap table.');
    }
};

// @desc    Get a specific cap table entry by ID
// @route   GET /api/horizon/fundraising/captable/:id
// @access  Private
exports.getCapTableEntryById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Cap Table Entry ID format' });
        }
        const entry = await CapTableEntry.findById(req.params.id);
        if (!entry) return res.status(404).json({ msg: 'Cap table entry not found' });
        res.json(entry);
    } catch (err) {
        console.error('Error fetching cap table entry by ID:', err.message);
        res.status(500).send('Server Error: Could not fetch cap table entry.');
    }
};

// @desc    Update a cap table entry
// @route   PUT /api/horizon/fundraising/captable/:id
// @access  Private
exports.updateCapTableEntry = async (req, res) => {
    const {
        shareholderName, shareholderType, numberOfShares,
        percentageOwnership, securityType, investmentAmount, grantDate, notes
    } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Cap Table Entry ID format' });
        }
        let entry = await CapTableEntry.findById(req.params.id);
        if (!entry) return res.status(404).json({ msg: 'Cap table entry not found' });

        const entryFields = { updatedAt: Date.now() };
        if (shareholderName !== undefined) entryFields.shareholderName = shareholderName;
        if (shareholderType !== undefined) entryFields.shareholderType = shareholderType;
        if (numberOfShares !== undefined) entryFields.numberOfShares = numberOfShares;
        if (percentageOwnership !== undefined) entryFields.percentageOwnership = percentageOwnership;
        if (securityType !== undefined) entryFields.securityType = securityType;
        if (investmentAmount !== undefined) entryFields.investmentAmount = investmentAmount;
        if (grantDate !== undefined) entryFields.grantDate = grantDate;
        if (notes !== undefined) entryFields.notes = notes;

        entry = await CapTableEntry.findByIdAndUpdate(req.params.id, { $set: entryFields }, { new: true });
        res.json(entry);
    } catch (err) {
        console.error('Error updating cap table entry:', err.message);
        res.status(500).send('Server Error: Could not update cap table entry.');
    }
};

// @desc    Delete a cap table entry
// @route   DELETE /api/horizon/fundraising/captable/:id
// @access  Private
exports.deleteCapTableEntry = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Cap Table Entry ID format' });
        }
        const entry = await CapTableEntry.findById(req.params.id);
        if (!entry) return res.status(404).json({ msg: 'Cap table entry not found' });
        
        await CapTableEntry.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Cap table entry removed' });
    } catch (err) {
        console.error('Error deleting cap table entry:', err.message);
        res.status(500).send('Server Error: Could not delete cap table entry.');
    }
};
