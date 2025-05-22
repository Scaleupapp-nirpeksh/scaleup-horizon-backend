// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
// const authMiddleware = require('../middleware/authMiddleware'); // We'll add this later

// @route   POST /api/horizon/auth/register
// @desc    Register a Horizon platform user (founder)
// @access  Public (or protected for initial setup)
router.post('/register', authController.registerUser);

// @route   POST /api/horizon/auth/login
// @desc    Login a Horizon platform user (founder)
// @access  Public
router.post('/login', authController.loginUser);

// @route   GET /api/horizon/auth/me
// @desc    Get current logged-in Horizon user
// @access  Private (needs authMiddleware)
// router.get('/me', authMiddleware, authController.getMe);

module.exports = router;