// controllers/kpiController.js
const ManualKpiSnapshot = require('../models/manualKpiSnapshotModel');
const mongoose = require('mongoose');

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

// @desc    Create or Update a manual KPI snapshot for a specific date
// @route   POST /api/horizon/kpis/snapshots
// @access  Private
exports.createManualKpiSnapshot = async (req, res) => {
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
        // Normalize date to midnight UTC to ensure consistent querying
        const normalizedSnapshotDate = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));


        // Check if a snapshot for this date already exists to decide on create vs update
        // For simplicity in POST, let's assume we create new, or use PUT for updates.
        // Or, findOneAndUpdate with upsert: true
        const snapshotData = {
            snapshotDate: normalizedSnapshotDate,
            totalRegisteredUsers,
            newUsersToday,
            dau,
            mau,
            featureUsage,
            retentionCohorts,
            notes,
            enteredBy: req.horizonUser.id // From authMiddleware
        };
        
        // Using findOneAndUpdate with upsert to create if not exists, or update if exists for that date
        const snapshot = await ManualKpiSnapshot.findOneAndUpdate(
            { snapshotDate: normalizedSnapshotDate },
            snapshotData,
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );

        res.status(201).json(snapshot);
    } catch (err) {
        console.error('Error creating/updating manual KPI snapshot:', err.message);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error', errors: err.errors });
        }
        res.status(500).send('Server Error');
    }
};

// @desc    Get a manual KPI snapshot for a specific date
// @route   GET /api/horizon/kpis/snapshots/:date (date in YYYY-MM-DD format)
// @access  Private
exports.getManualKpiSnapshotByDate = async (req, res) => {
    try {
        const dateParam = req.params.date;
        const dateObj = new Date(dateParam);
         if (isNaN(dateObj.getTime())) {
            return res.status(400).json({ msg: 'Invalid date format. Please use YYYY-MM-DD.' });
        }
        const normalizedSnapshotDate = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));

        const snapshot = await ManualKpiSnapshot.findOne({ snapshotDate: normalizedSnapshotDate }).populate('enteredBy', 'name email');
        if (!snapshot) {
            return res.status(404).json({ msg: `No KPI snapshot found for date ${dateParam}` });
        }
        res.json(snapshot);
    } catch (err) {
        console.error('Error fetching manual KPI snapshot by date:', err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get all manual KPI snapshots (paginated)
// @route   GET /api/horizon/kpis/snapshots
// @access  Private
exports.getAllManualKpiSnapshots = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30; // Default to 30 snapshots (e.g., a month)
        const skip = (page - 1) * limit;

        const snapshots = await ManualKpiSnapshot.find()
            .populate('enteredBy', 'name email')
            .sort({ snapshotDate: -1 })
            .skip(skip)
            .limit(limit);
        
        const totalSnapshots = await ManualKpiSnapshot.countDocuments();

        res.json({
            snapshots,
            currentPage: page,
            totalPages: Math.ceil(totalSnapshots / limit),
            totalSnapshots
        });
    } catch (err) {
        console.error('Error fetching all manual KPI snapshots:', err.message);
        res.status(500).send('Server Error');
    }
};


// @desc    Update an existing manual KPI snapshot by its ID
// @route   PUT /api/horizon/kpis/snapshots/:id
// @access  Private
exports.updateManualKpiSnapshot = async (req, res) => {
    const {
        snapshotDate, totalRegisteredUsers, newUsersToday, dau, mau,
        featureUsage, retentionCohorts, notes
    } = req.body;
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Snapshot ID format' });
        }
        let snapshot = await ManualKpiSnapshot.findById(req.params.id);
        if (!snapshot) {
            return res.status(404).json({ msg: 'KPI Snapshot not found' });
        }

        // Prepare fields to update
        if (snapshotDate) {
            const dateObj = new Date(snapshotDate);
            snapshot.snapshotDate = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
        }
        if (totalRegisteredUsers !== undefined) snapshot.totalRegisteredUsers = totalRegisteredUsers;
        if (newUsersToday !== undefined) snapshot.newUsersToday = newUsersToday;
        if (dau !== undefined) snapshot.dau = dau;
        if (mau !== undefined) snapshot.mau = mau;
        if (featureUsage) snapshot.featureUsage = { ...snapshot.featureUsage, ...featureUsage };
        if (retentionCohorts) snapshot.retentionCohorts = retentionCohorts; // Overwrites entire array
        if (notes !== undefined) snapshot.notes = notes;
        snapshot.enteredBy = req.horizonUser.id; // Update who last edited it

        const updatedSnapshot = await snapshot.save();
        res.json(updatedSnapshot);
    } catch (err) {
        console.error('Error updating manual KPI snapshot:', err.message);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error', errors: err.errors });
        }
        res.status(500).send('Server Error');
    }
};

// @desc    Delete a manual KPI snapshot by its ID
// @route   DELETE /api/horizon/kpis/snapshots/:id
// @access  Private
exports.deleteManualKpiSnapshot = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid Snapshot ID format' });
        }
        const snapshot = await ManualKpiSnapshot.findById(req.params.id);
        if (!snapshot) {
            return res.status(404).json({ msg: 'KPI Snapshot not found' });
        }
        await ManualKpiSnapshot.findByIdAndDelete(req.params.id);
        res.json({ msg: 'KPI Snapshot removed' });
    } catch (err) {
        console.error('Error deleting manual KPI snapshot:', err.message);
        res.status(500).send('Server Error');
    }
};


// --- Derived KPI Endpoints (Now using ManualKpiSnapshotModel) ---

// @desc    Get user growth metrics from the latest snapshot
// @access  Private
exports.getUserGrowthMetrics = async (req, res) => {
    try {
        const latestSnapshot = await ManualKpiSnapshot.findOne().sort({ snapshotDate: -1 });

        if (!latestSnapshot) {
            return res.status(404).json({ msg: 'No KPI data available yet. Please add a snapshot.' });
        }

        const data = {
            snapshotDate: latestSnapshot.snapshotDate,
            totalRegisteredUsers: latestSnapshot.totalRegisteredUsers,
            newUsersToday: latestSnapshot.newUsersToday, // Or for the period of the snapshot
            dau: latestSnapshot.dau,
            mau: latestSnapshot.mau,
            dauMauRatio: latestSnapshot.mau ? ((latestSnapshot.dau / latestSnapshot.mau) * 100).toFixed(2) + '%' : 'N/A',
            lastUpdated: latestSnapshot.updatedAt
        };
        res.json(data);
    } catch (err) {
        console.error('Error fetching user growth metrics:', err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get historical DAU and MAU data for charts from snapshots
// @access  Private
exports.getDauMauHistory = async (req, res) => {
    try {
        const historyLimit = parseInt(req.query.days) || 30; // Default to last 30 days of snapshots
        const snapshots = await ManualKpiSnapshot.find()
            .sort({ snapshotDate: -1 })
            .limit(historyLimit)
            .select('snapshotDate dau mau'); // Select only necessary fields

        if (!snapshots || snapshots.length === 0) {
            return res.status(404).json({ msg: 'No historical KPI data available.' });
        }
        // Reverse to show oldest first for charting
        const history = snapshots.reverse().map(s => ({
            date: s.snapshotDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
            dau: s.dau,
            mau: s.mau
        }));
        res.json(history);
    } catch (err) {
        console.error('Error fetching DAU/MAU history:', err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get usage statistics for key features from latest snapshot
// @access  Private
exports.getFeatureUsageStats = async (req, res) => {
    try {
        const latestSnapshot = await ManualKpiSnapshot.findOne().sort({ snapshotDate: -1 });
        if (!latestSnapshot || !latestSnapshot.featureUsage) {
            return res.status(404).json({ msg: 'No feature usage data available in the latest snapshot.' });
        }
        res.json({
            snapshotDate: latestSnapshot.snapshotDate,
            period: `Data for ${latestSnapshot.snapshotDate.toISOString().split('T')[0]}`, // Or a defined period
            ...latestSnapshot.featureUsage.toObject(), // Spread the featureUsage fields
            lastUpdated: latestSnapshot.updatedAt
        });
    } catch (err) {
        console.error('Error fetching feature usage stats:', err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get basic user retention metrics from latest snapshot
// @access  Private
exports.getRetentionMetrics = async (req, res) => {
    try {
        const latestSnapshot = await ManualKpiSnapshot.findOne().sort({ snapshotDate: -1 });
        if (!latestSnapshot || !latestSnapshot.retentionCohorts || latestSnapshot.retentionCohorts.length === 0) {
            return res.status(404).json({ msg: 'No retention data available in the latest snapshot.' });
        }
        res.json({
            snapshotDate: latestSnapshot.snapshotDate,
            cohortAnalysis: latestSnapshot.retentionCohorts,
            lastUpdated: latestSnapshot.updatedAt
        });
    } catch (err) {
        console.error('Error fetching retention metrics:', err.message);
        res.status(500).send('Server Error');
    }
};
