// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController'); // Ensure this path is correct
const { protect } = require('../middleware/authMiddleware'); // Import 'protect' middleware

// @route   POST /api/horizon/auth/register-owner
// @desc    Register the first user (owner) and create their organization.
// @access  Public
router.post('/register-owner', authController.registerOrganizationOwner);

// @route   POST /api/horizon/auth/complete-setup/:setupToken
// @desc    Complete account setup for a user provisioned by an admin via a setup link.
// @access  Public
router.post('/complete-setup/:setupToken', authController.completeAccountSetup);

// @route   POST /api/horizon/auth/login
// @desc    Login a user and get JWT with organization context.
// @access  Public
router.post('/login', authController.loginUser); // Uses the updated loginUser controller

// @route   POST /api/horizon/auth/set-active-organization
// @desc    Allows a logged-in user to switch their active organization context.
// @access  Private (Requires JWT)
router.post('/set-active-organization', protect, authController.setActiveOrganization);

// @route   GET /api/horizon/auth/me
// @desc    Get current logged-in user's profile, active org, and memberships.
// @access  Private (Requires JWT)
router.get('/me', protect, authController.getMe);

// @route   POST /api/horizon/auth/forgot-password
// @desc    Initiate password reset process.
// @access  Public
//router.post('/forgot-password', authController.forgotPassword);

// @route   POST /api/horizon/auth/reset-password/:resetToken
// @desc    Reset user's password using a valid reset token.
// @access  Public
//router.post('/reset-password/:resetToken', authController.resetPassword);

// Note: The old '/register' route (authController.registerUser) is replaced by '/register-owner'.
// If you had other specific user registration logic not tied to organization creation,
// you might need a different route or controller method.

module.exports = router;
