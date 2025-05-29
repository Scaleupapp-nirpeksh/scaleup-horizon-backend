// routes/productMilestoneRoutes.js
const express = require('express');
const router = express.Router();
// --- MULTI-TENANCY: Import all necessary middleware ---
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware'); // Ensure path is correct
const productMilestoneController = require('../controllers/productMilestoneController'); // Ensure this points to the multi-tenancy updated controller

// --- MULTI-TENANCY: Apply global protection and require an active organization for all routes in this file ---
router.use(protect); // Ensures user is authenticated (already present)
router.use(requireActiveOrganization); // Ensures user has an active organization context

// Test route - also protected and org-scoped now
router.get('/test', authorizeOrganizationRole(['owner', 'member']), (req, res) => {
  res.json({ message: `Product milestone routes working for organization: ${req.organization.name}` });
});

// GET routes
// Assuming 'owner' and 'member' can view milestones and related data
router.get('/', authorizeOrganizationRole(['owner', 'member']), productMilestoneController.getMilestones);
router.get('/investor-roadmap', authorizeOrganizationRole(['owner', 'member']), productMilestoneController.getInvestorRoadmap);
router.get('/statistics', authorizeOrganizationRole(['owner', 'member']), productMilestoneController.getMilestoneStatistics);
router.get('/:id', authorizeOrganizationRole(['owner', 'member']), productMilestoneController.getMilestoneById);

// POST routes
// Assuming 'owner' and 'member' can create milestones and tasks
router.post('/', authorizeOrganizationRole(['owner', 'member']), productMilestoneController.createMilestone);
router.post('/:id/tasks', authorizeOrganizationRole(['owner', 'member']), productMilestoneController.addTask);

// PUT routes
// Assuming 'owner' and 'member' can update milestones and tasks
router.put('/:id', authorizeOrganizationRole(['owner', 'member']), productMilestoneController.updateMilestone);
router.put('/:id/tasks/:taskId', authorizeOrganizationRole(['owner', 'member']), productMilestoneController.updateTask);

// DELETE routes
// Assuming 'owner' and 'member' can delete (or adjust roles if only 'owner' should delete)
router.delete('/:id', authorizeOrganizationRole(['owner', 'member']), productMilestoneController.deleteMilestone);
router.delete('/:id/tasks/:taskId', authorizeOrganizationRole(['owner', 'member']), productMilestoneController.deleteTask);

module.exports = router;
