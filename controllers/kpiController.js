// controllers/kpiController.js
const ManualKpiSnapshot = require('../models/manualKpiSnapshotModel'); // Phase 4 updated model
const mongoose = require('mongoose');

// User's original activeUserDefinition - Preserved
const activeUserDefinition = `A user is considered "active" if they perform at least one of the following key actions within the defined period (day/month):
1. Starts or Completes a Quiz.
2. Creates a piece of Content (post, Learn List).
3. Engages with Content (like, comment, save, share).
4. Sends a Message (1-to-1 chat or Study Group).
5. Joins a Study Group or an Inner Circle.
6. Actively participates in a Learn List (marks an item complete, participates in a discussion).
(Future: Joins/participates in a Webinar.)`;

exports.getActiveUserDefinition = async (req, res) => {
    res.json({ definition: activeUserDefinition });
};

// --- Manual KPI Snapshot CRUD ---

// @desc    Create or Update a manual KPI snapshot for a specific date for the active organization
// @route   POST /api/horizon/kpis/snapshots
// @access  Private
exports.createManualKpiSnapshot = async (req, res) => {
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // Standardized from req.horizonUser.id

    const {
        snapshotDate, // Expect YYYY-MM-DD string
        totalRegisteredUsers,
        newUsersToday,
        dau,
        mau,
        featureUsage, // Object: { quizzesPlayed, contentItemsCreated, ... }
        retentionCohorts, // Array of objects: [{ cohortStartDate, cohortName, week1RetentionPercent, ... }]
        notes
    } = req.body;

    try {
        if (!snapshotDate) {
            return res.status(400).json({ msg: 'Snapshot date is required.' });
        }

        const dateObj = new Date(snapshotDate);
        if (isNaN(dateObj.getTime())) { // Validate date string
            return res.status(400).json({ msg: 'Invalid snapshot date format. Please use YYYY-MM-DD.' });
        }
        // Normalize date to midnight UTC to ensure consistent querying
        const normalizedSnapshotDate = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));

        const snapshotData = {
            organization: organizationId, // Scope to organization
            snapshotDate: normalizedSnapshotDate,
            totalRegisteredUsers,
            newUsersToday,
            dau,
            mau,
            featureUsage,
            retentionCohorts,
            notes,
            enteredBy: userId // Standardized
        };

        // Using findOneAndUpdate with upsert to create if not exists, or update if exists for that date AND organization
        const snapshot = await ManualKpiSnapshot.findOneAndUpdate(
            { organization: organizationId, snapshotDate: normalizedSnapshotDate }, // --- MULTI-TENANCY: Filter includes organizationId ---
            snapshotData,
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );

        res.status(snapshot.isNew ? 201 : 200).json(snapshot); // 201 for created, 200 for updated
    } catch (err) {
        console.error(`Error creating/updating manual KPI snapshot for org ${organizationId}:`, err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error: ' + err.message, errors: err.errors });
        }
        res.status(500).send('Server Error');
    }
};

// @desc    Get a manual KPI snapshot for a specific date for the active organization
// @route   GET /api/horizon/kpis/snapshots/:date (date in YYYY-MM-DD format)
// @access  Private
exports.getManualKpiSnapshotByDate = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;

    try {
        const dateParam = req.params.date;
        const dateObj = new Date(dateParam);
         if (isNaN(dateObj.getTime())) {
            return res.status(400).json({ msg: 'Invalid date format. Please use YYYY-MM-DD.' });
        }
        const normalizedSnapshotDate = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));

        // --- MULTI-TENANCY: Filter by organizationId AND snapshotDate ---
        const snapshot = await ManualKpiSnapshot.findOne({
            organization: organizationId,
            snapshotDate: normalizedSnapshotDate
        }).populate('enteredBy', 'name email');

        if (!snapshot) {
            return res.status(404).json({ msg: `No KPI snapshot found for date ${dateParam} within your organization.` });
        }
        res.json(snapshot);
    } catch (err) {
        console.error(`Error fetching manual KPI snapshot by date for org ${organizationId}:`, err.message, err.stack);
        res.status(500).send('Server Error');
    }
};

// @desc    Get all manual KPI snapshots for the active organization (paginated)
// @route   GET /api/horizon/kpis/snapshots
// @access  Private
exports.getAllManualKpiSnapshots = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;

    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const skip = (page - 1) * limit;

        // --- MULTI-TENANCY: Filter by organizationId ---
        const query = { organization: organizationId };

        const snapshots = await ManualKpiSnapshot.find(query)
            .populate('enteredBy', 'name email')
            .sort({ snapshotDate: -1 })
            .skip(skip)
            .limit(limit);

        const totalSnapshots = await ManualKpiSnapshot.countDocuments(query);

        res.json({
            snapshots,
            currentPage: page,
            totalPages: Math.ceil(totalSnapshots / limit),
            totalSnapshots
        });
    } catch (err) {
        console.error(`Error fetching all manual KPI snapshots for org ${organizationId}:`, err.message, err.stack);
        res.status(500).send('Server Error');
    }
};


// @desc    Update an existing manual KPI snapshot by its ID for the active organization
// @route   PUT /api/horizon/kpis/snapshots/:id
// @access  Private
exports.updateManualKpiSnapshot = async (req, res) => {
    // --- MULTI-TENANCY: Get organization and user from request ---
    const organizationId = req.organization._id;
    const userId = req.user._id; // Standardized

    const {
        snapshotDate, totalRegisteredUsers, newUsersToday, dau, mau,
        featureUsage, retentionCohorts, notes
    } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Snapshot ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        let snapshot = await ManualKpiSnapshot.findOne({ _id: req.params.id, organization: organizationId });
        if (!snapshot) {
            return res.status(404).json({ msg: 'KPI Snapshot not found within your organization.' });
        }

        // Prepare fields to update - User's original logic preserved
        if (snapshotDate) {
            const dateObj = new Date(snapshotDate);
            if (isNaN(dateObj.getTime())) {
                return res.status(400).json({ msg: 'Invalid snapshot date format for update. Please use YYYY-MM-DD.' });
            }
            snapshot.snapshotDate = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
        }
        if (totalRegisteredUsers !== undefined) snapshot.totalRegisteredUsers = totalRegisteredUsers;
        if (newUsersToday !== undefined) snapshot.newUsersToday = newUsersToday;
        if (dau !== undefined) snapshot.dau = dau;
        if (mau !== undefined) snapshot.mau = mau;
        if (featureUsage) snapshot.featureUsage = { ...(snapshot.featureUsage ? snapshot.featureUsage.toObject() : {}), ...featureUsage };
        if (retentionCohorts) snapshot.retentionCohorts = retentionCohorts; // Overwrites entire array
        if (notes !== undefined) snapshot.notes = notes;
        snapshot.enteredBy = userId; // Update who last edited it (standardized)
        // snapshot.updatedAt will be handled by timestamps:true in model

        const updatedSnapshot = await snapshot.save({ runValidators: true }); // Added runValidators
        res.json(updatedSnapshot);
    } catch (err) {
        console.error(`Error updating manual KPI snapshot for org ${organizationId}:`, err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error: ' + err.message, errors: err.errors });
        }
        if (err.code === 11000) { // Handle unique index violation (org + snapshotDate)
            return res.status(400).json({ msg: 'A snapshot for this date already exists for your organization.' });
        }
        res.status(500).send('Server Error');
    }
};

// @desc    Delete a manual KPI snapshot by its ID for the active organization
// @route   DELETE /api/horizon/kpis/snapshots/:id
// @access  Private
exports.deleteManualKpiSnapshot = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;

    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Snapshot ID format' });
        }
        // --- MULTI-TENANCY: Filter by _id AND organizationId ---
        const snapshot = await ManualKpiSnapshot.findOneAndDelete({ _id: req.params.id, organization: organizationId });
        if (!snapshot) {
            return res.status(404).json({ msg: 'KPI Snapshot not found within your organization or already deleted.' });
        }
        res.json({ msg: 'KPI Snapshot removed' });
    } catch (err) {
        console.error(`Error deleting manual KPI snapshot for org ${organizationId}:`, err.message, err.stack);
        res.status(500).send('Server Error');
    }
};


// --- Derived KPI Endpoints (Now using ManualKpiSnapshotModel) ---

// @desc    Get user growth metrics from the latest snapshot for the active organization
// @access  Private
exports.getUserGrowthMetrics = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;

    try {
        // --- MULTI-TENANCY: Filter by organizationId ---
        const latestSnapshot = await ManualKpiSnapshot.findOne({ organization: organizationId }).sort({ snapshotDate: -1 });

        if (!latestSnapshot) {
            return res.status(404).json({ msg: 'No KPI data available yet for your organization. Please add a snapshot.' });
        }

        // User's original data structure - Preserved
        const data = {
            snapshotDate: latestSnapshot.snapshotDate,
            totalRegisteredUsers: latestSnapshot.totalRegisteredUsers,
            newUsersToday: latestSnapshot.newUsersToday,
            dau: latestSnapshot.dau,
            mau: latestSnapshot.mau,
            dauMauRatio: latestSnapshot.mau && latestSnapshot.dau && latestSnapshot.mau > 0 ? ((latestSnapshot.dau / latestSnapshot.mau) * 100).toFixed(2) + '%' : 'N/A',
            lastUpdated: latestSnapshot.updatedAt
        };
        res.json(data);
    } catch (err) {
        console.error(`Error fetching user growth metrics for org ${organizationId}:`, err.message, err.stack);
        res.status(500).send('Server Error');
    }
};

// @desc    Get historical DAU and MAU data for charts from snapshots for the active organization
// @access  Private
exports.getDauMauHistory = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;

    try {
        const historyLimit = parseInt(req.query.days) || 30;
        // --- MULTI-TENANCY: Filter by organizationId ---
        const snapshots = await ManualKpiSnapshot.find({ organization: organizationId })
            .sort({ snapshotDate: -1 })
            .limit(historyLimit)
            .select('snapshotDate dau mau');

        if (!snapshots || snapshots.length === 0) {
            return res.status(404).json({ msg: 'No historical KPI data available for your organization.' });
        }
        // User's original mapping logic - Preserved
        const history = snapshots.reverse().map(s => ({
            date: s.snapshotDate.toISOString().split('T')[0],
            dau: s.dau,
            mau: s.mau
        }));
        res.json(history);
    } catch (err) {
        console.error(`Error fetching DAU/MAU history for org ${organizationId}:`, err.message, err.stack);
        res.status(500).send('Server Error');
    }
};

// @desc    Get usage statistics for key features from latest snapshot for the active organization
// @access  Private
exports.getFeatureUsageStats = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;

    try {
        // --- MULTI-TENANCY: Filter by organizationId ---
        const latestSnapshot = await ManualKpiSnapshot.findOne({ organization: organizationId }).sort({ snapshotDate: -1 });
        if (!latestSnapshot || !latestSnapshot.featureUsage) {
            return res.status(404).json({ msg: 'No feature usage data available in the latest snapshot for your organization.' });
        }
        // User's original response structure - Preserved
        res.json({
            snapshotDate: latestSnapshot.snapshotDate,
            period: `Data for ${latestSnapshot.snapshotDate.toISOString().split('T')[0]}`,
            ...(latestSnapshot.featureUsage.toObject()), // Spread the featureUsage fields
            lastUpdated: latestSnapshot.updatedAt
        });
    } catch (err) {
        console.error(`Error fetching feature usage stats for org ${organizationId}:`, err.message, err.stack);
        res.status(500).send('Server Error');
    }
};

// @desc    Get basic user retention metrics from latest snapshot for the active organization
// @access  Private
exports.getRetentionMetrics = async (req, res) => {
    // --- MULTI-TENANCY: Get organization from request ---
    const organizationId = req.organization._id;

    try {
        // --- MULTI-TENANCY: Filter by organizationId ---
        const latestSnapshot = await ManualKpiSnapshot.findOne({ organization: organizationId }).sort({ snapshotDate: -1 });
        if (!latestSnapshot || !latestSnapshot.retentionCohorts || latestSnapshot.retentionCohorts.length === 0) {
            return res.status(404).json({ msg: 'No retention data available in the latest snapshot for your organization.' });
        }
        // User's original response structure - Preserved
        res.json({
            snapshotDate: latestSnapshot.snapshotDate,
            cohortAnalysis: latestSnapshot.retentionCohorts,
            lastUpdated: latestSnapshot.updatedAt
        });
    } catch (err) {
        console.error(`Error fetching retention metrics for org ${organizationId}:`, err.message, err.stack);
        res.status(500).send('Server Error');
    }
};
