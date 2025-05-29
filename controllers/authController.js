// controllers/authController.js
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // For password reset and account setup tokens

// Phase 1 Models (ensure paths are correct)
const HorizonUser = require('../models/userModel');
const Organization = require('../models/organizationModel');
const Membership = require('../models/membershipModel');

// Email service for password resets (ensure path is correct)
// We'll assume emailService.js exists and has sendPasswordResetEmail function
//const emailService = require('../services/emailService');

// --- Helper Functions ---

/**
 * Generates a JWT token for the user.
 * Payload includes user ID and active organization ID.
 * @param {string} userId - The ID of the user.
 * @param {string|null} activeOrganizationId - The ID of the user's active organization, if any.
 * @returns {string} The generated JWT.
 */
const generateToken = (userId, activeOrganizationId = null) => {
    const payload = {
        user: { id: userId }, // Matches your previous JWT structure [cite: uploaded:scaleupapp-nirpeksh/scaleup-horizon-backend/scaleup-horizon-backend-fdf1198898eb693204a25adb48e93d7160daab22/controllers/authController.js]
        activeOrganizationId: activeOrganizationId,
    };
    return jwt.sign(
        payload,
        process.env.HORIZON_JWT_SECRET || 'yourHorizonSecret_fallback_super_secret', // Use environment variable [cite: uploaded:scaleupapp-nirpeksh/scaleup-horizon-backend/scaleup-horizon-backend-fdf1198898eb693204a25adb48e93d7160daab22/controllers/authController.js]
        { expiresIn: process.env.JWT_EXPIRES_IN || '5h' } // Use environment variable [cite: uploaded:scaleupapp-nirpeksh/scaleup-horizon-backend/scaleup-horizon-backend-fdf1198898eb693204a25adb48e93d7160daab22/controllers/authController.js]
    );
};

// --- Authentication Controllers ---

/**
 * @desc    Register the first user (owner) and create their organization.
 * This user's account is active immediately.
 * @route   POST /api/auth/register-organization-owner
 * @access  Public
 */
exports.registerOrganizationOwner = async (req, res) => {
    const { name, email, password, organizationName } = req.body;

    if (!name || !email || !password || !organizationName) {
        return res.status(400).json({ msg: 'Please provide your name, email, password, and an organization name.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ msg: 'Password must be at least 8 characters long.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let user = await HorizonUser.findOne({ email }).session(session);
        if (user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ msg: 'A user with this email already exists. Please login or use forgot password.' });
        }

        // Create User (Owner)
        user = new HorizonUser({
            name,
            email,
            password, // Will be hashed by pre-save hook
            isAccountActive: true, // Owner's account is active immediately
        });
        await user.save({ session });

        // Create Organization
        const organization = new Organization({
            name: organizationName,
            owner: user._id,
            // currency and timezone will use defaults (INR, Asia/Kolkata) from organizationModel.js
        });
        await organization.save({ session });

        // Create Membership for the Owner
        const membership = new Membership({
            user: user._id,
            organization: organization._id,
            role: 'owner', // This first user is the owner
            status: 'active',
            invitedBy: user._id, // Self-invited/created
        });
        await membership.save({ session });

        // Update user's active and default organization
        user.activeOrganization = organization._id;
        user.defaultOrganization = organization._id;
        await user.save({ session });

        await session.commitTransaction();

        // Login the user by generating a token
        const token = generateToken(user._id, organization._id);

        res.status(201).json({
            msg: 'Organization owner registered and organization created successfully.',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAccountActive: user.isAccountActive,
            },
            activeOrganization: {
                id: organization._id,
                name: organization.name,
                role: membership.role,
            },
            memberships: [{ // Initial membership list for the owner
                organizationId: organization._id,
                organizationName: organization.name,
                role: membership.role,
            }]
        });

    } catch (err) {
        await session.abortTransaction();
        console.error('Owner Registration Error:', err.message, err.stack);
        if (err.code === 11000 || (err.message && err.message.includes('duplicate key error'))) {
             return res.status(400).json({ msg: 'An account with this email already exists.' });
        }
        res.status(500).send('Server Error during owner registration.');
    } finally {
        session.endSession();
    }
};

/**
 * @desc    Complete account setup for a user provisioned by an admin via a setup link.
 * @route   POST /api/auth/complete-setup/:setupToken
 * @access  Public
 */
exports.completeAccountSetup = async (req, res) => {
    const { setupToken } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
        return res.status(400).json({ msg: 'Password is required and must be at least 8 characters long.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await HorizonUser.findOne({
            accountSetupToken: setupToken,
            accountSetupTokenExpiresAt: { $gt: Date.now() },
        }).session(session);

        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ msg: 'Invalid or expired account setup link. Please contact your organization admin.' });
        }

        if (user.isAccountActive) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ msg: 'Account has already been set up. Please login.' });
        }

        user.password = password; // Will be hashed by pre-save hook
        user.isAccountActive = true;
        user.accountSetupToken = null; // Clear token after use
        user.accountSetupTokenExpiresAt = null;
        // User's activeOrganization and defaultOrganization should have been set when admin provisioned them.
        // If not, or if logic changes, ensure it's set here or upon first login.
        await user.save({ session });

        // Find the corresponding membership and set it to active
        // (It should be 'pending_user_setup' and linked to this user)
        const membership = await Membership.findOneAndUpdate(
            { user: user._id, status: 'pending_user_setup' }, // Assuming only one such pending membership
            { $set: { status: 'active' } },
            { new: true, session }
        ).populate('organization', 'name currency timezone');

        if (!membership || !membership.organization) {
            // This case should ideally not happen if provisioning was correct
            await session.abortTransaction();
            session.endSession();
            console.error(`Setup Completion Error: No pending membership found for user ${user._id} or organization details missing.`);
            return res.status(500).json({ msg: 'Error activating membership. Please contact support.' });
        }

        // Ensure user's active/default organization is set from this membership if not already
        if (!user.activeOrganization) user.activeOrganization = membership.organization._id;
        if (!user.defaultOrganization) user.defaultOrganization = membership.organization._id;
        await user.save({ session });


        await session.commitTransaction();

        // Login the user by generating a token
        const token = generateToken(user._id, user.activeOrganization);

        res.status(200).json({
            msg: 'Account setup completed successfully. You are now logged in.',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAccountActive: user.isAccountActive,
            },
            activeOrganization: {
                id: membership.organization._id,
                name: membership.organization.name,
                role: membership.role,
                currency: membership.organization.currency,
                timezone: membership.organization.timezone,
            },
             memberships: [{ // Initial membership list for this user
                organizationId: membership.organization._id,
                organizationName: membership.organization.name,
                role: membership.role,
            }]
        });

    } catch (err) {
        await session.abortTransaction();
        console.error('Account Setup Completion Error:', err.message, err.stack);
        res.status(500).send('Server Error during account setup.');
    } finally {
        session.endSession();
    }
};


/**
 * @desc    Authenticate user & get token, loading organization context.
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ msg: 'Please provide both email and password.' });
    }

    try {
        const user = await HorizonUser.findOne({ email });
        if (!user) {
            return res.status(401).json({ msg: 'Invalid credentials. User not found.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ msg: 'Invalid credentials. Password incorrect.' });
        }

        if (!user.isAccountActive) {
            // This means the user was provisioned by an admin but hasn't completed setup.
            return res.status(403).json({
                msg: 'Account setup is not complete. Please use the setup link provided by your organization admin.',
                actionRequired: 'COMPLETE_ACCOUNT_SETUP',
                // Optionally, if you store the email of the admin who invited them, you could suggest contacting them.
            });
        }

        // Fetch user's active memberships
        const memberships = await Membership.find({ user: user._id, status: 'active' })
            .populate('organization', 'name currency timezone'); // Populate necessary org details

        let activeOrganizationForSession = null;
        let currentActiveOrgDetails = null;

        if (memberships.length > 0) {
            let targetOrgMembership = null;
            // 1. Try user's persisted activeOrganization
            if (user.activeOrganization) {
                targetOrgMembership = memberships.find(mem => mem.organization._id.equals(user.activeOrganization));
            }
            // 2. Try user's persisted defaultOrganization if active one wasn't found or invalid
            if (!targetOrgMembership && user.defaultOrganization) {
                targetOrgMembership = memberships.find(mem => mem.organization._id.equals(user.defaultOrganization));
            }
            // 3. Fallback to the first membership if none of the above are set or valid
            if (!targetOrgMembership) {
                targetOrgMembership = memberships[0];
            }

            if (targetOrgMembership && targetOrgMembership.organization) {
                activeOrganizationForSession = targetOrgMembership.organization._id;
                currentActiveOrgDetails = {
                    id: targetOrgMembership.organization._id,
                    name: targetOrgMembership.organization.name,
                    role: targetOrgMembership.role,
                    currency: targetOrgMembership.organization.currency,
                    timezone: targetOrgMembership.organization.timezone,
                };
                // Update user's activeOrganization in DB if it changed or wasn't set correctly
                if (!user.activeOrganization || !user.activeOrganization.equals(activeOrganizationForSession)) {
                    user.activeOrganization = activeOrganizationForSession;
                }
            }
        } else {
            // User has no active memberships, clear their active org preference if set
            if (user.activeOrganization) user.activeOrganization = null;
        }

        user.lastLoginAt = Date.now();
        await user.save(); // Save lastLoginAt and potentially updated activeOrganization

        const token = generateToken(user._id, activeOrganizationForSession);

        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAccountActive: user.isAccountActive,
                isPlatformAdmin: user.isPlatformAdmin,
            },
            activeOrganization: currentActiveOrgDetails, // Can be null if no active memberships
            memberships: memberships.map(mem => ({
                organizationId: mem.organization._id,
                organizationName: mem.organization.name,
                role: mem.role,
            })),
        });

    } catch (err) {
        console.error('Login Error:', err.message, err.stack);
        res.status(500).send('Server Error during login.');
    }
};

/**
 * @desc    Allows a logged-in user to switch their active organization context.
 * @route   POST /api/auth/set-active-organization
 * @access  Private (Requires JWT & active account)
 */
exports.setActiveOrganization = async (req, res) => {
    const { organizationId } = req.body;
    const userId = req.user.id; // req.user is populated by 'protect' middleware

    if (!organizationId) {
        return res.status(400).json({ msg: 'Organization ID is required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(organizationId)) {
        return res.status(400).json({ msg: 'Invalid Organization ID format.'});
    }


    try {
        // req.user is the Mongoose document from the 'protect' middleware
        if (!req.user.isAccountActive) {
            return res.status(403).json({ msg: 'Account setup not complete. Cannot switch organizations.' });
        }

        const membership = await Membership.findOne({
            user: userId,
            organization: organizationId,
            status: 'active', // Ensure they are an active member
        }).populate('organization', 'name currency timezone');

        if (!membership || !membership.organization) {
            return res.status(403).json({ msg: 'You are not an active member of the specified organization or organization not found.' });
        }

        req.user.activeOrganization = organizationId;
        await req.user.save();

        // Issue a new token with the updated activeOrganizationId in its payload
        const newToken = generateToken(userId, organizationId);

        res.status(200).json({
            msg: 'Active organization updated successfully.',
            token: newToken, // Client should use this new token for subsequent requests
            activeOrganization: {
                id: membership.organization._id,
                name: membership.organization.name,
                role: membership.role,
                currency: membership.organization.currency,
                timezone: membership.organization.timezone,
            },
        });

    } catch (err) {
        console.error('Set Active Organization Error:', err.message, err.stack);
        res.status(500).send('Server Error.');
    }
};

/**
 * @desc    Get current logged-in user's profile including active org and memberships.
 * @route   GET /api/auth/me
 * @access  Private (Requires JWT)
 */
exports.getMe = async (req, res) => {
    // req.user, req.organization, req.organizationRole are populated by 'protect' middleware
    if (!req.user) { // Should be caught by protect, but as a safeguard
        return res.status(401).json({ msg: "Not authorized, user data unavailable." });
    }

    let activeOrgDetails = null;
    if (req.organization && req.organizationRole) { // Populated by 'protect' if active org is valid
        activeOrgDetails = {
            id: req.organization._id,
            name: req.organization.name,
            role: req.organizationRole,
            currency: req.organization.currency,
            timezone: req.organization.timezone,
        };
    }
    
    // Fetch all active memberships for the user to display in UI (e.g., org switcher)
     const memberships = await Membership.find({ user: req.user._id, status: 'active' })
            .populate('organization', 'name'); // Populate only name for brevity, or more if needed


    res.status(200).json({
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            isAccountActive: req.user.isAccountActive,
            isPlatformAdmin: req.user.isPlatformAdmin,
            // preferences: req.user.preferences, // If needed by client
        },
        activeOrganization: activeOrgDetails,
        memberships: memberships.map(mem => ({
            organizationId: mem.organization._id,
            organizationName: mem.organization.name,
            role: mem.role,
        })),
    });
};

/**
 * @desc    Initiate password reset process. Sends a reset link to the user's email.
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */

/*
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ msg: 'Email address is required.' });
    }

    try {
        const user = await HorizonUser.findOne({ email });
        if (!user) {
            // Important: Do not reveal if an email exists or not for security reasons.
            // Send a generic success message regardless.
            console.warn(`Password reset attempt for non-existent email: ${email}`);
            return res.status(200).json({ msg: 'If an account with this email exists, a password reset link has been sent.' });
        }

        // Generate a password reset token using the instance method from userModel.js
        const resetToken = user.generatePasswordResetToken();
        await user.save(); // This saves the token and its expiry to the user document

        // Send the email using emailService
        // The emailService should handle the actual sending (e.g., via SendGrid, Nodemailer)
        try {
            await emailService.sendPasswordResetEmail(user.email, user.name, resetToken);
            res.status(200).json({ msg: 'If an account with this email exists, a password reset link has been sent.' });
        } catch (emailError) {
            console.error("Forgot Password - Email Sending Error:", emailError.message, emailError.stack);
            // Even if email fails, don't reveal user existence.
            // Log the error internally. For the user, it appears the same.
            res.status(200).json({ msg: 'If an account with this email exists, a password reset link has been sent. (Email dispatch may have issues)' });
        }

    } catch (err) {
        console.error("Forgot Password - General Error:", err.message, err.stack);
        // Generic error for safety, actual error logged.
        res.status(500).send('An error occurred. Please try again later.');
    }
};
*/
/**
 * @desc    Reset user's password using a valid reset token.
 * @route   POST /api/auth/reset-password/:resetToken
 * @access  Public
 */

/*
exports.resetPassword = async (req, res) => {
    const { resetToken } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
        return res.status(400).json({ msg: 'New password is required and must be at least 8 characters long.' });
    }

    try {
        // Find user by the plain resetToken (as stored in this example) and check expiry
        const user = await HorizonUser.findOne({
            passwordResetToken: resetToken,
            passwordResetTokenExpiresAt: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ msg: 'Invalid or expired password reset link. Please try again.' });
        }

        user.password = password; // Password will be hashed by pre-save hook
        user.passwordResetToken = null; // Clear the token
        user.passwordResetTokenExpiresAt = null;
        if (!user.isAccountActive) { // If account was pending setup, activating it now.
            user.isAccountActive = true;
        }
        await user.save();

        // Optionally, log the user in by issuing a token, or just confirm success.
        // For simplicity, just confirm success. User can login separately.
        // const token = generateToken(user._id, user.activeOrganization);

        res.status(200).json({ msg: 'Password has been reset successfully. You can now login with your new password.' });

    } catch (err) {
        console.error("Reset Password Error:", err.message, err.stack);
        res.status(500).send('Server Error during password reset.');
    }
};
*/