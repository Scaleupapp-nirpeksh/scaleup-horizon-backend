// routes/taskRoutes.js
const express = require('express');
const router = express.Router();
const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware');
const taskController = require('../controllers/taskController');

// Apply authentication and organization context middleware to all routes
router.use(protect);
router.use(requireActiveOrganization);

// --- Task CRUD Routes ---

// Get task statistics (place before /:id to avoid route conflicts)
router.get('/stats', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.getTaskStats
);

// Create a new task
router.post('/', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.createTask
);

// Get all tasks with filters
router.get('/', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.getTasks
);

// Get a single task by ID
router.get('/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.getTaskById
);

// Update a task
router.put('/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.updateTask
);

// Archive/Delete a task
router.delete('/:id', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.archiveTask
);

// --- Task Assignment Routes ---

// Assign a task to a user
router.post('/:id/assign', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.assignTask
);

// Add/Remove watchers
router.post('/:id/watchers', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.updateWatchers
);

// --- Task Comment Routes ---

// Get comments for a task
router.get('/:id/comments', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.getTaskComments
);

// Add a comment to a task
router.post('/:id/comments', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.addTaskComment
);

// Update a comment
router.put('/:taskId/comments/:commentId', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.updateTaskComment
);

// Delete a comment
router.delete('/:taskId/comments/:commentId', 
    authorizeOrganizationRole(['owner', 'member']), 
    taskController.deleteTaskComment
);

module.exports = router;