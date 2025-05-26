// routes/productMilestoneRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const productMilestoneController = require('../controllers/productMilestoneController');

// Apply authentication to all routes
router.use(protect);

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Product milestone routes working' });
});

// GET routes
router.get('/', productMilestoneController.getMilestones);
router.get('/investor-roadmap', productMilestoneController.getInvestorRoadmap);
router.get('/statistics', productMilestoneController.getMilestoneStatistics);
router.get('/:id', productMilestoneController.getMilestoneById);

// POST routes
router.post('/', productMilestoneController.createMilestone);
router.post('/:id/tasks', productMilestoneController.addTask);

// PUT routes
router.put('/:id', productMilestoneController.updateMilestone);
router.put('/:id/tasks/:taskId', productMilestoneController.updateTask);

// DELETE routes
router.delete('/:id', productMilestoneController.deleteMilestone);
router.delete('/:id/tasks/:taskId', productMilestoneController.deleteTask);

module.exports = router;