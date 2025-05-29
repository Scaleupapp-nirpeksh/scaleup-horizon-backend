// routes/advancedFeaturesRoutes.js
const express = require('express');
const router = express.Router();
// --- MULTI-TENANCY: Import all necessary middleware ---
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware'); // Ensure path is correct
const advancedFeaturesController = require('../controllers/advancedFeaturesController'); // Ensure this points to the multi-tenancy updated controller
const multer = require('multer'); // For file uploads

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Example: 10MB file size limit
    // Add file type filters in production if needed:
    // fileFilter: function (req, file, cb) {
    //   if (!file.originalname.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png)$/)) {
    //     return cb(new Error('Please upload an allowed file type.'), false);
    //   }
    //   cb(null, true);
    // }
});

// --- MULTI-TENANCY: Apply global protection and require an active organization for all routes in this file ---
router.use(protect);
router.use(requireActiveOrganization);

// --- Budget Management ---
// Assuming 'owner' and 'member' can manage budgets
router.post('/budgets', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.createBudget);
router.get('/budgets', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.getBudgets);
router.get('/budgets/:id', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.getBudgetById);
router.put('/budgets/:id', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.updateBudget);
router.delete('/budgets/:id', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.deleteBudget); // Or restrict to 'owner' if preferred
router.get('/reports/budget-vs-actuals', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.getBudgetVsActualsReport);

// --- Document Management ---
// Assuming 'owner' and 'member' can manage documents
router.post(
    '/documents/upload',
    authorizeOrganizationRole(['owner', 'member']), // Auth middleware first
    upload.single('documentFile'),                  // Then multer for file processing
    advancedFeaturesController.uploadDocument       // Then the controller
);
router.get('/documents', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.getDocuments);
router.get('/documents/:id', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.getDocumentById);
router.get('/documents/:id/download', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.downloadDocument);
router.delete('/documents/:id', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.deleteDocument); // Or restrict to 'owner'

// --- ESOP Grant Management ---
// Typically an 'owner' or HR/Finance admin function. For now, allowing 'member' as well.
router.post('/esop-grants', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.createEsopGrant);
router.get('/esop-grants', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.getEsopGrants);
router.get('/esop-grants/:id', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.getEsopGrantById);
router.put('/esop-grants/:id', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.updateEsopGrant);
router.delete('/esop-grants/:id', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.deleteEsopGrant); // Or restrict to 'owner'

// --- Advanced KPI & Forecasting (Conceptual Stubs) ---
// Assuming 'owner' and 'member' can access these analytical features
router.get('/kpis/advanced-cohorts', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.getAdvancedCohortAnalysis);
router.post('/forecasting/runway-scenario', authorizeOrganizationRole(['owner', 'member']), advancedFeaturesController.modelRunwayScenario);

module.exports = router;
