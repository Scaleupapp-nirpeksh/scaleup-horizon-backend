// controllers/advancedFeaturesController.js
const Budget = require('../models/budgetModel');
const Document = require('../models/documentModel');
const ESOPGrant = require('../models/esopGrantModel');
const Expense = require('../models/expenseModel'); // Corrected: Import directly
// const { BankAccount, Revenue } = require('../models/financialModels'); // Removed this line if BankAccount and Revenue are also separate
const BankAccount = require('../models/bankAccountModel'); // Assuming separate file
const Revenue = require('../models/revenueModel');       // Assuming separate file
const Round = require('../models/roundModel'); 
const Investor = require('../models/investorModel'); 
const CapTableEntry = require('../models/capTableEntryModel'); 
const mongoose = require('mongoose');
const AWS = require('aws-sdk');

// S3 Configuration (ensure these are in .env)
const s3 = new AWS.S3({
    accessKeyId: process.env.HORIZON_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.HORIZON_AWS_SECRET_ACCESS_KEY,
    region: process.env.HORIZON_AWS_REGION || 'ap-south-1'
});
const HORIZON_S3_BUCKET_NAME = process.env.HORIZON_S3_BUCKET_NAME || 'scaleup-horizon-documents';


// --- Budget Management ---
exports.createBudget = async (req, res) => {
    const { name, periodType, periodStartDate, periodEndDate, items, status, notes } = req.body;
    try {
        if (!name || !periodType || !periodStartDate || !periodEndDate || !items) {
            return res.status(400).json({ msg: 'Name, period type, start/end dates, and items are required for a budget.' });
        }
        const newBudget = new Budget({
            name, periodType, periodStartDate, periodEndDate, items, status, notes,
            createdBy: req.horizonUser.id
        });
        const budget = await newBudget.save();
        res.status(201).json(budget);
    } catch (err) {
        console.error('Error creating budget:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error', errors: err.errors });
        res.status(500).send('Server Error: Could not create budget.');
    }
};

exports.getBudgets = async (req, res) => {
    try {
        const budgets = await Budget.find({ createdBy: req.horizonUser.id })
            .populate('createdBy', 'name')
            .sort({ periodStartDate: -1 });
        res.json(budgets);
    } catch (err) {
        console.error('Error fetching budgets:', err.message);
        res.status(500).send('Server Error: Could not fetch budgets.');
    }
};

exports.getBudgetById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Budget ID format' });
        }
        const budget = await Budget.findById(req.params.id).populate('createdBy', 'name');
        if (!budget) return res.status(404).json({ msg: 'Budget not found' });
        res.json(budget);
    } catch (err) {
        console.error('Error fetching budget by ID:', err.message);
        res.status(500).send('Server Error: Could not fetch budget.');
    }
};

exports.updateBudget = async (req, res) => {
    const { name, periodType, periodStartDate, periodEndDate, items, status, notes } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Budget ID format' });
        }
        let budget = await Budget.findById(req.params.id);
        if (!budget) return res.status(404).json({ msg: 'Budget not found' });

        if (budget.createdBy.toString() !== req.horizonUser.id ) {
            return res.status(403).json({ msg: 'User not authorized to update this budget.' });
        }

        if (name !== undefined) budget.name = name;
        if (periodType !== undefined) budget.periodType = periodType;
        if (periodStartDate !== undefined) budget.periodStartDate = periodStartDate;
        if (periodEndDate !== undefined) budget.periodEndDate = periodEndDate;
        if (items !== undefined) budget.items = items;
        if (status !== undefined) budget.status = status;
        if (notes !== undefined) budget.notes = notes;
        
        const updatedBudget = await budget.save();
        res.json(updatedBudget);
    } catch (err) {
        console.error('Error updating budget:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error', errors: err.errors });
        res.status(500).send('Server Error: Could not update budget.');
    }
};

exports.deleteBudget = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Budget ID format' });
        }
        const budget = await Budget.findById(req.params.id);
        if (!budget) return res.status(404).json({ msg: 'Budget not found' });

        if (budget.createdBy.toString() !== req.horizonUser.id ) {
            return res.status(403).json({ msg: 'User not authorized to delete this budget.' });
        }
        await Budget.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Budget removed' });
    } catch (err) {
        console.error('Error deleting budget:', err.message);
        res.status(500).send('Server Error: Could not delete budget.');
    }
};

exports.getBudgetVsActualsReport = async (req, res) => {
    try {
        const { budgetId, periodStartDate, periodEndDate } = req.query;
        let budget;
        let startDate, endDate;

        if (budgetId) {
            if (!mongoose.Types.ObjectId.isValid(budgetId)) {
                return res.status(400).json({ msg: 'Invalid Budget ID format' });
            }
            budget = await Budget.findById(budgetId);
            if (!budget) return res.status(404).json({ msg: 'Budget not found' });
            startDate = budget.periodStartDate;
            endDate = budget.periodEndDate;
        } else if (periodStartDate && periodEndDate) {
            startDate = new Date(periodStartDate);
            endDate = new Date(periodEndDate);
        } else {
            return res.status(400).json({ msg: 'BudgetId or both periodStartDate and periodEndDate are required.' });
        }

        const actualExpenses = await Expense.aggregate([
            { $match: { date: { $gte: startDate, $lte: endDate } } },
            { $group: { _id: "$category", actualSpent: { $sum: "$amount" } } }
        ]);

        const report = budget ? budget.items.map(item => {
            const actual = actualExpenses.find(exp => exp._id === item.category);
            const actualSpent = actual ? actual.actualSpent : 0;
            const variance = item.budgetedAmount - actualSpent;
            const variancePercentage = item.budgetedAmount !== 0 ? (variance / item.budgetedAmount) * 100 : 0;
            return {
                category: item.category,
                budgetedAmount: item.budgetedAmount,
                actualSpent,
                variance,
                variancePercentage: variancePercentage.toFixed(2) + '%'
            };
        }) : actualExpenses.map(exp => ({
            category: exp._id,
            budgetedAmount: 0,
            actualSpent: exp.actualSpent,
            variance: -exp.actualSpent,
            variancePercentage: "-100.00%"
        }));
        
        const totalBudgeted = budget ? budget.totalBudgetedAmount : 0;
        const totalActual = actualExpenses.reduce((sum, exp) => sum + exp.actualSpent, 0);

        res.json({
            budgetName: budget ? budget.name : `Custom Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
            periodStartDate: startDate,
            periodEndDate: endDate,
            reportItems: report,
            totals: {
                totalBudgeted,
                totalActualSpent: totalActual,
                totalVariance: totalBudgeted - totalActual
            }
        });
    } catch (err) {
        console.error('Error generating budget vs actuals report:', err.message);
        res.status(500).send('Server Error.');
    }
};


// --- Document Management ---
exports.uploadDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ msg: 'No file uploaded.' });
        }
        const { description, category, associatedRoundId, associatedInvestorId, tags } = req.body;

        const fileKey = `documents/${req.horizonUser.id}/${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;

        const params = {
            Bucket: HORIZON_S3_BUCKET_NAME,
            Key: fileKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        const s3UploadResponse = await s3.upload(params).promise();

        const newDocument = new Document({
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            storageUrl: s3UploadResponse.Location,
            storageKey: fileKey,
            description,
            category,
            associatedRoundId: associatedRoundId || null,
            associatedInvestorId: associatedInvestorId || null,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            uploadedBy: req.horizonUser.id,
        });

        const document = await newDocument.save();
        res.status(201).json(document);
    } catch (err) {
        console.error('Error uploading document:', err.message);
        res.status(500).send('Server Error: Could not upload document.');
    }
};

exports.getDocuments = async (req, res) => {
    try {
        const query = { uploadedBy: req.horizonUser.id };
        
        if (req.query.roundId) query.associatedRoundId = req.query.roundId;
        if (req.query.investorId) query.associatedInvestorId = req.query.investorId;
        if (req.query.category) query.category = req.query.category;
        if (req.query.tag) query.tags = { $in: [req.query.tag] };

        const documents = await Document.find(query)
            .populate('uploadedBy', 'name')
            .populate('associatedRoundId', 'name')
            .populate('associatedInvestorId', 'name')
            .sort({ createdAt: -1 });
        res.json(documents);
    } catch (err) {
        console.error('Error fetching documents:', err.message);
        res.status(500).send('Server Error: Could not fetch documents.');
    }
};

exports.getDocumentById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Document ID format' });
        }
        const document = await Document.findById(req.params.id)
            .populate('uploadedBy', 'name')
            .populate('associatedRoundId', 'name')
            .populate('associatedInvestorId', 'name');

        if (!document || document.uploadedBy._id.toString() !== req.horizonUser.id ) {
            return res.status(404).json({ msg: 'Document not found or not authorized.' });
        }
        res.json(document);
    } catch (err) {
        console.error('Error fetching document by ID:', err.message);
        res.status(500).send('Server Error.');
    }
};

exports.downloadDocument = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Document ID format' });
        }
        const document = await Document.findById(req.params.id);
        if (!document || document.uploadedBy._id.toString() !== req.horizonUser.id ) {
            return res.status(404).json({ msg: 'Document not found or not authorized.' });
        }

        const params = {
            Bucket: HORIZON_S3_BUCKET_NAME,
            Key: document.storageKey,
            Expires: 60 * 5 
        };
        const signedUrl = await s3.getSignedUrlPromise('getObject', params);
        res.json({ downloadUrl: signedUrl, fileName: document.fileName });

    } catch (err) {
        console.error('Error generating download link:', err.message);
        res.status(500).send('Server Error.');
    }
};

exports.deleteDocument = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Document ID format' });
        }
        const document = await Document.findById(req.params.id);
        if (!document || document.uploadedBy._id.toString() !== req.horizonUser.id ) {
            return res.status(404).json({ msg: 'Document not found or not authorized to delete.' });
        }

        const deleteParams = {
            Bucket: HORIZON_S3_BUCKET_NAME,
            Key: document.storageKey,
        };
        await s3.deleteObject(deleteParams).promise();
        await Document.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Document removed successfully.' });
    } catch (err) {
        console.error('Error deleting document:', err.message);
        res.status(500).send('Server Error.');
    }
};


// --- ESOP Grant Management ---
exports.createEsopGrant = async (req, res) => {
    const {
        employeeName, employeeId, numberOfOptionsGranted, strikePrice, grantDate,
        vestingScheduleType, vestingPeriodYears, cliffPeriodMonths, vestingFrequency,
        vestingEvents, notes, agreementUrl
    } = req.body;
    try {
        if (!employeeName || !numberOfOptionsGranted || !strikePrice || !grantDate) {
            return res.status(400).json({ msg: 'Employee name, options granted, strike price, and grant date are required.' });
        }
        const newGrant = new ESOPGrant({
            employeeName, employeeId, numberOfOptionsGranted, strikePrice, grantDate,
            vestingScheduleType, vestingPeriodYears, cliffPeriodMonths, vestingFrequency,
            vestingEvents, notes, agreementUrl,
            createdBy: req.horizonUser.id
        });
        const grant = await newGrant.save(); // Pre-save hook will calculate initial vested if events are past
        res.status(201).json(grant);
    } catch (err) {
        console.error('Error creating ESOP grant:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error', errors: err.errors });
        res.status(500).send('Server Error.');
    }
};

exports.getEsopGrants = async (req, res) => {
    try {
        const grants = await ESOPGrant.find({ createdBy: req.horizonUser.id })
            .populate('createdBy', 'name')
            .sort({ grantDate: -1 });
        res.json(grants);
    } catch (err) {
        console.error('Error fetching ESOP grants:', err.message);
        res.status(500).send('Server Error.');
    }
};

exports.getEsopGrantById = async (req, res) => {
     try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Grant ID format' });
        }
        const grant = await ESOPGrant.findById(req.params.id).populate('createdBy', 'name');
        if (!grant || grant.createdBy.toString() !== req.horizonUser.id ) {
            return res.status(404).json({ msg: 'ESOP Grant not found or not authorized.' });
        }
        res.json(grant);
    } catch (err) {
        console.error('Error fetching ESOP grant by ID:', err.message);
        res.status(500).send('Server Error.');
    }
};

exports.updateEsopGrant = async (req, res) => {
    const {
        employeeName, employeeId, numberOfOptionsGranted, strikePrice, grantDate,
        vestingScheduleType, vestingPeriodYears, cliffPeriodMonths, vestingFrequency,
        vestingEvents, notes, agreementUrl, totalOptionsVested, totalOptionsExercised // Allow manual override/update of vested/exercised
    } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Grant ID format' });
        }
        let grant = await ESOPGrant.findById(req.params.id);
        if (!grant || grant.createdBy.toString() !== req.horizonUser.id ) {
            return res.status(404).json({ msg: 'ESOP Grant not found or not authorized.' });
        }

        // Update fields if provided
        if (employeeName !== undefined) grant.employeeName = employeeName;
        if (employeeId !== undefined) grant.employeeId = employeeId;
        if (numberOfOptionsGranted !== undefined) grant.numberOfOptionsGranted = numberOfOptionsGranted;
        if (strikePrice !== undefined) grant.strikePrice = strikePrice;
        if (grantDate !== undefined) grant.grantDate = grantDate;
        if (vestingScheduleType !== undefined) grant.vestingScheduleType = vestingScheduleType;
        if (vestingPeriodYears !== undefined) grant.vestingPeriodYears = vestingPeriodYears;
        if (cliffPeriodMonths !== undefined) grant.cliffPeriodMonths = cliffPeriodMonths;
        if (vestingFrequency !== undefined) grant.vestingFrequency = vestingFrequency;
        if (vestingEvents !== undefined) grant.vestingEvents = vestingEvents; // Full array replacement
        if (notes !== undefined) grant.notes = notes;
        if (agreementUrl !== undefined) grant.agreementUrl = agreementUrl;
        if (totalOptionsVested !== undefined) grant.totalOptionsVested = totalOptionsVested; // Allow manual update
        if (totalOptionsExercised !== undefined) grant.totalOptionsExercised = totalOptionsExercised;
        
        const updatedGrant = await grant.save(); // Pre-save hook will re-calculate vested based on events if events changed
        res.json(updatedGrant);
    } catch (err) {
        console.error('Error updating ESOP grant:', err.message);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error', errors: err.errors });
        res.status(500).send('Server Error.');
    }
};

exports.deleteEsopGrant = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Grant ID format' });
        }
        const grant = await ESOPGrant.findById(req.params.id);
        if (!grant || grant.createdBy.toString() !== req.horizonUser.id ) {
            return res.status(404).json({ msg: 'ESOP Grant not found or not authorized.' });
        }
        await ESOPGrant.findByIdAndDelete(req.params.id);
        res.json({ msg: 'ESOP Grant removed.' });
    } catch (err) {
        console.error('Error deleting ESOP grant:', err.message);
        res.status(500).send('Server Error.');
    }
};

// --- Cap Table Logic for Equity Rounds (Conceptual - integrated with fundraisingController) ---
// This section is more about how data flows into CapTableEntry from Round/Investor data
// See fundraisingController.js for addCapTableEntry, getCapTableSummary etc.

// Helper function (conceptual) that might be called when an equity investment is finalized
// This would live in fundraisingController or a dedicated capTableService.js
/*
async function createCapTableEntryForEquityInvestor(investorId, roundId, sharesIssued, investmentAmount) {
    const investor = await Investor.findById(investorId);
    const round = await Round.findById(roundId); // To get valuation context if needed

    if (!investor || !round) throw new Error('Investor or Round not found');

    const newEntry = new CapTableEntry({
        shareholderName: investor.name,
        shareholderType: 'Investor',
        numberOfShares: sharesIssued,
        securityType: 'Preferred Stock', // Or Common, depending on round terms
        investmentAmount: investmentAmount,
        grantDate: new Date(), // Date shares are issued
        notes: `Equity investment in ${round.name} round.`
    });
    await newEntry.save();
    // Further logic to update overall cap table percentages would be needed
}
*/

// --- Advanced KPI & Forecasting (Conceptual Stubs for V2) ---
exports.getAdvancedCohortAnalysis = async (req, res) => {
    res.status(501).json({ msg: "Advanced Cohort Analysis: Not Implemented. Requires deep integration with ScaleUp app data." });
};

exports.modelRunwayScenario = async (req, res) => {
    const { currentCash, monthlyBurn, hiringImpact, revenueScenario } = req.body;
    if (currentCash === undefined || monthlyBurn === undefined) {
        return res.status(400).json({msg: "Current cash and monthly burn are required."});
    }
    let projectedBurn = monthlyBurn;
    if (hiringImpact && hiringImpact.monthlyCostIncrease) {
        projectedBurn += hiringImpact.monthlyCostIncrease;
    }
    let runwayMonths = currentCash / projectedBurn;

    res.json({ 
        scenarioName: req.body.scenarioName || "Basic Scenario",
        projectedMonthlyBurn: projectedBurn.toFixed(2),
        estimatedRunwayMonths: isFinite(runwayMonths) ? runwayMonths.toFixed(1) : "N/A (check inputs)",
        notes: "This is a very simplified model. Revenue impact and dynamic changes not fully modeled."
    });
};
