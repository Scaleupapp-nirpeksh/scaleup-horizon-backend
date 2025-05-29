// routes/kpiRoutes.js
const express = require('express');
const router = express.Router();
// --- MULTI-TENANCY: Import all necessary middleware ---
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware'); // Ensure path is correct
const kpiController = require('../controllers/kpiController'); // Ensure this points to the multi-tenancy updated controller

// --- MULTI-TENANCY: Apply global protection and require an active organization for all routes in this file ---
router.use(protect); // Ensures user is authenticated (already present)
router.use(requireActiveOrganization); // Ensures user has an active organization context

// --- Manual KPI Snapshot Management ---
// Assuming 'owner' and 'member' can manage and view KPI snapshots
router.post(
    '/snapshots',
    authorizeOrganizationRole(['owner', 'member']),
    kpiController.createManualKpiSnapshot
);

router.get(
    '/snapshots/:date',
    authorizeOrganizationRole(['owner', 'member']),
    kpiController.getManualKpiSnapshotByDate
);

router.get(
    '/snapshots',
    authorizeOrganizationRole(['owner', 'member']),
    kpiController.getAllManualKpiSnapshots
);

router.put(
    '/snapshots/:id',
    authorizeOrganizationRole(['owner', 'member']),
    kpiController.updateManualKpiSnapshot
);

router.delete(
    '/snapshots/:id',
    authorizeOrganizationRole(['owner', 'member']), // Or restrict to 'owner' if preferred
    kpiController.deleteManualKpiSnapshot
);


// --- Derived KPI Endpoints (will now use ManualKpiSnapshotModel) ---
// Assuming 'owner' and 'member' can view these derived metrics
router.get(
    '/user-growth',
    authorizeOrganizationRole(['owner', 'member']),
    kpiController.getUserGrowthMetrics
);

router.get(
    '/dau-mau-history',
    authorizeOrganizationRole(['owner', 'member']),
    kpiController.getDauMauHistory
);

router.get(
    '/feature-usage',
    authorizeOrganizationRole(['owner', 'member']),
    kpiController.getFeatureUsageStats
);

router.get(
    '/retention',
    authorizeOrganizationRole(['owner', 'member']),
    kpiController.getRetentionMetrics
);

// @route   GET /api/horizon/kpis/active-user-definition
// @desc    Get the current definition of an "active user" (informational)
// @access  Private (Founders - now 'owner' or 'member')
// This route doesn't modify data, so broader access might be fine, but still org-contextual if definition could vary.
// For simplicity, keeping it consistent.
router.get(
    '/active-user-definition',
    authorizeOrganizationRole(['owner', 'member']),
    kpiController.getActiveUserDefinition
);

module.exports = router;
