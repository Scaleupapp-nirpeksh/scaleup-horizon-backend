// routes/advancedFeaturesRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const advancedFeaturesController = require('../controllers/advancedFeaturesController');
const multer = require('multer'); // For file uploads

// Configure multer for memory storage (or disk storage if preferred)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }); // Add file size limits, file type filters in production

router.use(protect); // All routes are protected

// --- Budget Management ---
router.post('/budgets', advancedFeaturesController.createBudget);
router.get('/budgets', advancedFeaturesController.getBudgets);
router.get('/budgets/:id', advancedFeaturesController.getBudgetById);
router.put('/budgets/:id', advancedFeaturesController.updateBudget);
router.delete('/budgets/:id', advancedFeaturesController.deleteBudget);
router.get('/reports/budget-vs-actuals', advancedFeaturesController.getBudgetVsActualsReport);

// --- Document Management ---
// Note: File upload itself is handled by multer middleware on the specific route
router.post('/documents/upload', upload.single('documentFile'), advancedFeaturesController.uploadDocument);
router.get('/documents', advancedFeaturesController.getDocuments); // Add filters: ?roundId=X, ?investorId=Y, ?category=Z
router.get('/documents/:id', advancedFeaturesController.getDocumentById);
router.get('/documents/:id/download', advancedFeaturesController.downloadDocument); // Conceptual: would need S3 signed URL logic
router.delete('/documents/:id', advancedFeaturesController.deleteDocument);

// --- ESOP Grant Management (Sophisticated Cap Table) ---
router.post('/esop-grants', advancedFeaturesController.createEsopGrant);
router.get('/esop-grants', advancedFeaturesController.getEsopGrants);
router.get('/esop-grants/:id', advancedFeaturesController.getEsopGrantById);
router.put('/esop-grants/:id', advancedFeaturesController.updateEsopGrant); // For updating details, vested amounts
router.delete('/esop-grants/:id', advancedFeaturesController.deleteEsopGrant);

// --- Advanced KPI & Forecasting (Conceptual Stubs) ---
router.get('/kpis/advanced-cohorts', advancedFeaturesController.getAdvancedCohortAnalysis);
router.post('/forecasting/runway-scenario', advancedFeaturesController.modelRunwayScenario);

module.exports = router;
