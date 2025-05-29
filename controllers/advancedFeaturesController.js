// controllers/advancedFeaturesController.js
const Budget = require('../models/budgetModel'); // Phase 4 updated model
const Document = require('../models/documentModel'); // Phase 4 updated model
const ESOPGrant = require('../models/esopGrantModel'); // Phase 4 updated model
const Expense = require('../models/expenseModel'); // Phase 4 updated model
const BankAccount = require('../models/bankAccountModel'); // Phase 4 updated model
const Revenue = require('../models/revenueModel'); // Phase 4 updated model
const Round = require('../models/roundModel'); // Phase 4 updated model
const Investor = require('../models/investorModel'); // Phase 4 updated model
const CapTableEntry = require('../models/capTableEntryModel'); // Phase 4 updated model
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
    const { name, periodType, periodStartDate, periodEndDate, items, status, notes, currency } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // Standardized to req.user._id

    try {
        if (!name || !periodType || !periodStartDate || !periodEndDate || !items) {
            return res.status(400).json({ msg: 'Name, period type, start/end dates, and items are required for a budget.' });
        }
        const orgCurrency = req.organization.currency || 'INR';

        const newBudget = new Budget({
            organization: organizationId, // Scope to organization
            name,
            periodType,
            periodStartDate,
            periodEndDate,
            items,
            status,
            notes,
            currency: currency || orgCurrency, // Use provided or organization's default
            createdBy: userId // Use standardized req.user._id
        });
        const budget = await newBudget.save();
        res.status(201).json(budget);
    } catch (err) {
        console.error('Error creating budget:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message , errors: err.errors });
        if (err.code === 11000) {
             return res.status(400).json({ msg: 'A budget with this name might already exist for your organization.' });
        }
        res.status(500).send('Server Error: Could not create budget.');
    }
};

exports.getBudgets = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id; // For filtering by createdBy if needed, but usually all org budgets are visible

    try {
        // --- MULTI-TENANCY: Filter by organizationId ---
        // const budgets = await Budget.find({ organization: organizationId, createdBy: userId }) // If only user's created budgets
        const budgets = await Budget.find({ organization: organizationId }) // All budgets for the organization
            .populate('createdBy', 'name email') // Populate with fields from HorizonUser
            .sort({ periodStartDate: -1 });
        res.json(budgets);
    } catch (err) {
        console.error('Error fetching budgets:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch budgets.');
    }
};

exports.getBudgetById = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Budget ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const budget = await Budget.findOne({ _id: req.params.id, organization: organizationId })
            .populate('createdBy', 'name email');
        if (!budget) return res.status(404).json({ msg: 'Budget not found within your organization.' });
        res.json(budget);
    } catch (err) {
        console.error('Error fetching budget by ID:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch budget.');
    }
};

exports.updateBudget = async (req, res) => {
    const { name, periodType, periodStartDate, periodEndDate, items, status, notes, currency } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // For updatedBy

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Budget ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        let budget = await Budget.findOne({ _id: req.params.id, organization: organizationId });
        if (!budget) return res.status(404).json({ msg: 'Budget not found within your organization.' });

        // Authorization check: Original code checked if user created it.
        // With roles, an 'owner' or 'member' with edit rights (as per middleware) can update.
        // The check below is an additional layer for createdBy, if desired.
        // if (budget.createdBy.toString() !== userId ) { // Standardized to req.user._id
        //     return res.status(403).json({ msg: 'User not authorized to update this budget (not creator).' });
        // }

        if (name !== undefined) budget.name = name;
        if (periodType !== undefined) budget.periodType = periodType;
        if (periodStartDate !== undefined) budget.periodStartDate = periodStartDate;
        if (periodEndDate !== undefined) budget.periodEndDate = periodEndDate;
        if (items !== undefined) budget.items = items;
        if (status !== undefined) budget.status = status;
        if (notes !== undefined) budget.notes = notes;
        if (currency !== undefined) budget.currency = currency;
        // budget.updatedBy = userId; // If Budget model has an updatedBy field

        const updatedBudget = await budget.save();
        res.json(updatedBudget);
    } catch (err) {
        console.error('Error updating budget:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message, errors: err.errors });
        if (err.code === 11000) {
             return res.status(400).json({ msg: 'A budget with this name might already exist for your organization.' });
        }
        res.status(500).send('Server Error: Could not update budget.');
    }
};

exports.deleteBudget = async (req, res) => {
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Budget ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const budget = await Budget.findOne({ _id: req.params.id, organization: organizationId });
        if (!budget) return res.status(404).json({ msg: 'Budget not found within your organization.' });

        // Authorization check (original logic)
        // if (budget.createdBy.toString() !== userId ) {
        //     return res.status(403).json({ msg: 'User not authorized to delete this budget (not creator).' });
        // }
        // With role-based access, this check might be redundant if middleware handles it.

        await Budget.findOneAndDelete({ _id: req.params.id, organization: organizationId });
        res.json({ msg: 'Budget removed' });
    } catch (err) {
        console.error('Error deleting budget:', err.message, err.stack);
        res.status(500).send('Server Error: Could not delete budget.');
    }
};

exports.getBudgetVsActualsReport = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    const orgCurrency = req.organization.currency || 'INR';

    try {
        const { budgetId, periodStartDate, periodEndDate } = req.query;
        let budget;
        let startDate, endDate;

        if (budgetId) {
            if (!mongoose.Types.ObjectId.isValid(budgetId)) {
                return res.status(400).json({ msg: 'Invalid Budget ID format' });
            }
            // --- MULTI-TENANCY: Filter by budgetId AND organizationId ---
            budget = await Budget.findOne({ _id: budgetId, organization: organizationId });
            if (!budget) return res.status(404).json({ msg: 'Budget not found within your organization.' });
            startDate = budget.periodStartDate;
            endDate = budget.periodEndDate;
        } else if (periodStartDate && periodEndDate) {
            startDate = new Date(periodStartDate);
            endDate = new Date(periodEndDate);
            // If no budgetId, we might want to aggregate expenses against a "virtual" budget for the period
            // or require a budgetId. For now, assuming if no budgetId, we just show actuals.
        } else {
            return res.status(400).json({ msg: 'BudgetId or both periodStartDate and periodEndDate are required.' });
        }

        // --- MULTI-TENANCY: Filter expenses by organizationId ---
        const actualExpenses = await Expense.aggregate([
            { $match: { organization: organizationId, date: { $gte: startDate, $lte: endDate } } },
            { $group: { _id: "$category", actualSpent: { $sum: "$amount" } } }
        ]);

        const reportItems = [];
        if (budget) {
            budget.items.forEach(item => {
                const actual = actualExpenses.find(exp => exp._id === item.category);
                const actualSpent = actual ? actual.actualSpent : 0;
                const variance = item.budgetedAmount - actualSpent;
                const variancePercentage = item.budgetedAmount !== 0 ? (variance / item.budgetedAmount) * 100 : (actualSpent !== 0 ? -100 : 0);
                reportItems.push({
                    category: item.category,
                    budgetedAmount: item.budgetedAmount,
                    actualSpent,
                    variance,
                    variancePercentage: variancePercentage.toFixed(2) + '%'
                });
            });
            // Add actual expenses for categories not in budget
            actualExpenses.forEach(exp => {
                if (!budget.items.find(item => item.category === exp._id)) {
                    reportItems.push({
                        category: exp._id,
                        budgetedAmount: 0,
                        actualSpent: exp.actualSpent,
                        variance: -exp.actualSpent,
                        variancePercentage: "-100.00%"
                    });
                }
            });

        } else { // No specific budget, just show actuals by category for the period
            actualExpenses.forEach(exp => {
                reportItems.push({
                    category: exp._id,
                    budgetedAmount: 0, // Or "N/A"
                    actualSpent: exp.actualSpent,
                    variance: -exp.actualSpent, // Or "N/A"
                    variancePercentage: "-100.00%" // Or "N/A"
                });
            });
        }


        const totalBudgeted = budget ? budget.totalBudgetedAmount : 0;
        const totalActual = actualExpenses.reduce((sum, exp) => sum + exp.actualSpent, 0);

        res.json({
            budgetName: budget ? budget.name : `Actuals for Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
            periodStartDate: startDate,
            periodEndDate: endDate,
            currency: budget ? budget.currency : orgCurrency,
            reportItems: reportItems.sort((a,b) => (b.actualSpent || 0) - (a.actualSpent || 0)), // Sort by most spent
            totals: {
                totalBudgeted,
                totalActualSpent: totalActual,
                totalVariance: totalBudgeted - totalActual
            }
        });
    } catch (err) {
        console.error('Error generating budget vs actuals report:', err.message, err.stack);
        res.status(500).send('Server Error generating budget vs actuals report.');
    }
};


// --- Document Management ---
exports.uploadDocument = async (req, res) => {
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // Standardized

    try {
        if (!req.file) {
            return res.status(400).json({ msg: 'No file uploaded.' });
        }
        const { description, category, associatedRoundId, associatedInvestorId, tags } = req.body;

        // --- MULTI-TENANCY: Include organizationId in S3 key path for isolation ---
        const fileKey = `documents/${organizationId}/${userId}/${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;

        const params = {
            Bucket: HORIZON_S3_BUCKET_NAME,
            Key: fileKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            // ACL: 'private', // Or 'public-read' if documents are meant to be public via URL
        };

        const s3UploadResponse = await s3.upload(params).promise();

        const newDocument = new Document({
            organization: organizationId, // Scope to organization
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            storageUrl: s3UploadResponse.Location, // URL from S3
            storageKey: fileKey,                  // Key for S3 object
            description,
            category,
            associatedRoundId: associatedRoundId || null,
            associatedInvestorId: associatedInvestorId || null,
            tags: tags ? tags.split(',').map(tag => tag.trim().toLowerCase()) : [], // Standardize tags
            uploadedBy: userId, // Standardized
        });

        const document = await newDocument.save();
        res.status(201).json(document);
    } catch (err) {
        console.error('Error uploading document:', err.message, err.stack);
        res.status(500).send('Server Error: Could not upload document.');
    }
};

exports.getDocuments = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id; // Original query used req.horizonUser.id for uploadedBy

    try {
        // --- MULTI-TENANCY: Base query includes organizationId ---
        const query = { organization: organizationId };
        // query.uploadedBy = userId; // If you want to restrict to only documents uploaded by the current user.
                                  // Otherwise, all docs for the org are shown (role permitting).

        if (req.query.roundId) query.associatedRoundId = req.query.roundId;
        if (req.query.investorId) query.associatedInvestorId = req.query.investorId;
        if (req.query.category) query.category = req.query.category;
        if (req.query.tag) query.tags = { $in: [req.query.tag.toLowerCase()] }; // Match standardized tags

        const documents = await Document.find(query)
            .populate('uploadedBy', 'name email')
            .populate('associatedRoundId', 'name') // Assuming Round model has 'name'
            .populate('associatedInvestorId', 'name') // Assuming Investor model has 'name'
            .sort({ createdAt: -1 });
        res.json(documents);
    } catch (err) {
        console.error('Error fetching documents:', err.message, err.stack);
        res.status(500).send('Server Error: Could not fetch documents.');
    }
};

exports.getDocumentById = async (req, res) => {
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Document ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const document = await Document.findOne({ _id: req.params.id, organization: organizationId })
            .populate('uploadedBy', 'name email')
            .populate('associatedRoundId', 'name')
            .populate('associatedInvestorId', 'name');

        if (!document) { // No need to check uploadedBy here if org scoping is sufficient
            return res.status(404).json({ msg: 'Document not found within your organization.' });
        }
        // Original check: document.uploadedBy._id.toString() !== userId
        // This can be kept if only the uploader can view their own document,
        // but typically members of an org can see org documents. Role middleware handles access.

        res.json(document);
    } catch (err) {
        console.error('Error fetching document by ID:', err.message, err.stack);
        res.status(500).send('Server Error fetching document by ID.');
    }
};

exports.downloadDocument = async (req, res) => {
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Document ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const document = await Document.findOne({ _id: req.params.id, organization: organizationId });

        if (!document) { // No need for uploadedBy check if org scoping is primary
            return res.status(404).json({ msg: 'Document not found within your organization.' });
        }

        const params = {
            Bucket: HORIZON_S3_BUCKET_NAME,
            Key: document.storageKey, // storageKey should be unique and correctly path-scoped
            Expires: 300 // URL expires in 5 minutes (300 seconds)
        };
        const signedUrl = await s3.getSignedUrlPromise('getObject', params);
        res.json({ downloadUrl: signedUrl, fileName: document.fileName });

    } catch (err) {
        console.error('Error generating download link:', err.message, err.stack);
        res.status(500).send('Server Error generating download link.');
    }
};

exports.deleteDocument = async (req, res) => {
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Document ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const document = await Document.findOne({ _id: req.params.id, organization: organizationId });

        if (!document) { // No need for uploadedBy check if org scoping is primary for deletion rights (role handles this)
            return res.status(404).json({ msg: 'Document not found or not authorized to delete within your organization.' });
        }

        const deleteParams = {
            Bucket: HORIZON_S3_BUCKET_NAME,
            Key: document.storageKey,
        };
        await s3.deleteObject(deleteParams).promise();
        await Document.findByIdAndDelete(document._id); // Use found document's ID
        res.json({ msg: 'Document removed successfully.' });
    } catch (err) {
        console.error('Error deleting document:', err.message, err.stack);
        res.status(500).send('Server Error deleting document.');
    }
};


// --- ESOP Grant Management ---
exports.createEsopGrant = async (req, res) => {
    const {
        employeeName, employeeId, numberOfOptionsGranted, strikePrice, grantDate, currency, // Added currency
        vestingScheduleType, vestingPeriodYears, cliffPeriodMonths, vestingFrequency,
        vestingEvents, notes, agreementUrl, status // Added status
    } = req.body;
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // Standardized

    try {
        if (!employeeName || numberOfOptionsGranted === undefined || strikePrice === undefined || !grantDate) {
            return res.status(400).json({ msg: 'Employee name, options granted, strike price, and grant date are required.' });
        }
        const orgCurrency = req.organization.currency || 'INR';

        const newGrant = new ESOPGrant({
            organization: organizationId, // Scope to organization
            employeeName, employeeId, numberOfOptionsGranted, strikePrice, grantDate,
            currency: currency || orgCurrency, // Use provided or org default
            vestingScheduleType, vestingPeriodYears, cliffPeriodMonths, vestingFrequency,
            vestingEvents, notes, agreementUrl, status,
            createdBy: userId // Standardized
        });
        const grant = await newGrant.save();
        res.status(201).json(grant);
    } catch (err) {
        console.error('Error creating ESOP grant:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message, errors: err.errors });
        res.status(500).send('Server Error creating ESOP grant.');
    }
};

exports.getEsopGrants = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id; // Original query used createdBy: req.horizonUser.id

    try {
        // --- MULTI-TENANCY: Filter by organizationId ---
        // const grants = await ESOPGrant.find({ organization: organizationId, createdBy: userId }) // If only user's created grants
        const grants = await ESOPGrant.find({ organization: organizationId }) // All grants for the organization
            .populate('createdBy', 'name email') // Populate with fields from HorizonUser
            .sort({ grantDate: -1 });
        res.json(grants);
    } catch (err) {
        console.error('Error fetching ESOP grants:', err.message, err.stack);
        res.status(500).send('Server Error fetching ESOP grants.');
    }
};

exports.getEsopGrantById = async (req, res) => {
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Grant ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const grant = await ESOPGrant.findOne({ _id: req.params.id, organization: organizationId })
            .populate('createdBy', 'name email');
        if (!grant) { // No need for createdBy check if org scoping is sufficient
            return res.status(404).json({ msg: 'ESOP Grant not found or not authorized within your organization.' });
        }
        res.json(grant);
    } catch (err) {
        console.error('Error fetching ESOP grant by ID:', err.message, err.stack);
        res.status(500).send('Server Error fetching ESOP grant by ID.');
    }
};

exports.updateEsopGrant = async (req, res) => {
    const { /* All fields from ESOPGrant model */ } = req.body; // Destructure all possible fields
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // For updatedBy

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Grant ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        let grant = await ESOPGrant.findOne({ _id: req.params.id, organization: organizationId });
        if (!grant) {
            return res.status(404).json({ msg: 'ESOP Grant not found or not authorized within your organization.' });
        }

        // Selectively update fields that are present in req.body
        const allowedFields = [
            'employeeName', 'employeeId', 'numberOfOptionsGranted', 'strikePrice', 'grantDate', 'currency',
            'vestingScheduleType', 'vestingPeriodYears', 'cliffPeriodMonths', 'vestingFrequency',
            'vestingEvents', 'notes', 'agreementUrl', 'totalOptionsVested', 'totalOptionsExercised', 'status'
        ];

        for (const key of allowedFields) {
            if (req.body[key] !== undefined) {
                grant[key] = req.body[key];
            }
        }
        grant.lastModifiedBy = userId; // Assuming ESOPGrant model has lastModifiedBy

        const updatedGrant = await grant.save();
        res.json(updatedGrant);
    } catch (err) {
        console.error('Error updating ESOP grant:', err.message, err.stack);
        if (err.name === 'ValidationError') return res.status(400).json({ msg: 'Validation Error: ' + err.message, errors: err.errors });
        res.status(500).send('Server Error updating ESOP grant.');
    }
};

exports.deleteEsopGrant = async (req, res) => {
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    // const userId = req.user._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Grant ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const grant = await ESOPGrant.findOneAndDelete({ _id: req.params.id, organization: organizationId });
        if (!grant) {
            return res.status(404).json({ msg: 'ESOP Grant not found or not authorized within your organization.' });
        }
        res.json({ msg: 'ESOP Grant removed.' });
    } catch (err) {
        console.error('Error deleting ESOP grant:', err.message, err.stack);
        res.status(500).send('Server Error deleting ESOP grant.');
    }
};


// --- Advanced KPI & Forecasting (Conceptual Stubs for V2) ---
// These will also need organization scoping when fully implemented.
exports.getAdvancedCohortAnalysis = async (req, res) => {
    // const organizationId = req.organization._id;
    // Logic would involve querying RevenueCohort or other data scoped to organizationId
    res.status(501).json({ msg: "Advanced Cohort Analysis: Not Implemented. Requires deep integration with organization-specific data." });
};

exports.modelRunwayScenario = async (req, res) => {
    // const organizationId = req.organization._id;
    // When creating/fetching RunwayScenario, it must be scoped to organizationId.
    const { currentCash, monthlyBurn, hiringImpact, revenueScenario, scenarioName } = req.body;
    if (currentCash === undefined || monthlyBurn === undefined) {
        return res.status(400).json({msg: "Current cash and monthly burn are required."});
    }
    let projectedBurn = monthlyBurn;
    if (hiringImpact && hiringImpact.monthlyCostIncrease) {
        projectedBurn += hiringImpact.monthlyCostIncrease;
    }
    let runwayMonths = (projectedBurn > 0 && currentCash > 0) ? currentCash / projectedBurn : "N/A";

    res.json({
        organizationId: req.organization._id, // Indicate it's for this org
        scenarioName: scenarioName || "Basic Scenario",
        projectedMonthlyBurn: projectedBurn.toFixed(2),
        estimatedRunwayMonths: isFinite(runwayMonths) ? runwayMonths.toFixed(1) : runwayMonths,
        notes: "This is a very simplified model. Full scenario modeling would use RunwayScenario model."
    });
};
