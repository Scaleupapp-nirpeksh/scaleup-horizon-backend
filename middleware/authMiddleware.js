// middleware/authMiddleware.js
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const HorizonUser = require('../models/userModel'); // Phase 1 Updated Model
const Organization = require('../models/organizationModel'); // Phase 1 Model
const Membership = require('../models/membershipModel'); // Phase 1 Model

/**
 * @desc    Protect routes: Verify JWT, load user, and active organization context.
 * Populates req.user, req.organization, and req.organizationRole if applicable.
 */
const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            // The JWT payload is expected to be { user: { id: userId }, activeOrganizationId: orgId }
            const decoded = jwt.verify(token, process.env.HORIZON_JWT_SECRET || 'yourHorizonSecret_fallback_super_secret'); // [cite: uploaded:scaleupapp-nirpeksh/scaleup-horizon-backend/scaleup-horizon-backend-fdf1198898eb693204a25adb48e93d7160daab22/middleware/authMiddleware.js]

            // Get user from the token
            req.user = await HorizonUser.findById(decoded.user.id).select('-password');

            if (!req.user) {
                return res.status(401).json({ msg: 'Not authorized, user not found for this token.' });
            }

            // Check if account is active (setup completed)
            // Allow access to GET /api/auth/me even if not active, so frontend can check status.
            // Other specific routes for account activation (like complete-setup) will not use this 'protect' middleware.
            if (!req.user.isAccountActive && !(req.originalUrl === '/api/auth/me' && req.method === 'GET')) {
                 return res.status(403).json({
                    msg: 'Account is not active. Please complete your account setup or contact your administrator.',
                    actionRequired: 'COMPLETE_ACCOUNT_SETUP'
                });
            }

            const activeOrganizationIdFromToken = decoded.activeOrganizationId;

            if (activeOrganizationIdFromToken && mongoose.Types.ObjectId.isValid(activeOrganizationIdFromToken)) {
                const membership = await Membership.findOne({
                    user: req.user._id,
                    organization: activeOrganizationIdFromToken,
                    status: 'active', // Crucial: ensure membership is active
                }).populate('organization'); // Populate the full organization document

                if (membership && membership.organization) {
                    // Successfully found active membership and organization
                    req.activeMembership = membership;
                    req.organization = membership.organization; // The Organization document
                    req.organizationRole = membership.role;   // User's role ('owner' or 'member') in this org
                } else {
                    // User has an activeOrganizationId in token, but no valid/active membership found.
                    // This could happen if they were removed, or org was deleted, or membership status changed.
                    // Log this situation. For now, proceed without org context.
                    // Routes requiring org context will fail via `requireActiveOrganization`.
                    console.warn(
                        `AuthMiddleware: User ${req.user._id} has activeOrgId ${activeOrganizationIdFromToken} in token, but no valid active membership or organization found.`
                    );
                    // Optionally, clear the potentially stale activeOrganization from user document if it matches token,
                    // but this write operation in middleware needs careful thought about side effects.
                    // if (req.user.activeOrganization && req.user.activeOrganization.equals(activeOrganizationIdFromToken)) {
                    //     req.user.activeOrganization = null;
                    //     await req.user.save(); // Be cautious with saves in middleware
                    // }
                }
            }
            // If no activeOrganizationIdFromToken, or if it was invalid,
            // req.organization and req.organizationRole will remain undefined.
            // Routes that strictly require an organization context must use the `requireActiveOrganization` middleware.

            next();
        } catch (error) {
            console.error('Auth Middleware - Token verification failed:', error.message);
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ msg: 'Not authorized, token is invalid.' });
            }
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ msg: 'Not authorized, token has expired.' });
            }
            // Generic error for other JWT issues
            res.status(401).json({ msg: 'Not authorized, token issue.' });
        }
    }

    if (!token) {
        res.status(401).json({ msg: 'Not authorized, no token provided.' });
    }
};

/**
 * @desc    Middleware to ensure that an active organization context (req.organization)
 * has been successfully loaded by the 'protect' middleware.
 * This should be used for routes that operate within an organization's scope.
 * @usage   router.get('/some-org-specific-data', protect, requireActiveOrganization, someController);
 */
const requireActiveOrganization = (req, res, next) => {
    if (!req.organization || !req.organizationRole) {
        // This implies that either:
        // 1. The JWT did not contain an activeOrganizationId.
        // 2. The activeOrganizationId in the JWT was invalid (no active membership/org found).
        // 3. The user has no active memberships at all.
        return res.status(403).json({
            msg: 'Access denied. An active organization context is required for this operation. Please select an organization or ensure your membership is active.',
            actionRequired: 'SELECT_ORGANIZATION' // Hint for the frontend
        });
    }
    next();
};

/**
 * @desc    Authorize user based on their role within the active organization.
 * Must be used AFTER 'protect' and 'requireActiveOrganization' middleware.
 * @param   {string[]} roles - Array of allowed roles (e.g., ['owner', 'member']).
 * @usage   router.post('/create-something', protect, requireActiveOrganization, authorizeOrganizationRole(['owner', 'member']), createController);
 */
const authorizeOrganizationRole = (allowedRoles = []) => {
    return (req, res, next) => {
        // requireActiveOrganization should have ensured req.organizationRole is set.
        // This is an additional safeguard.
        if (!req.organizationRole) {
            console.warn("authorizeOrganizationRole: req.organizationRole not set. This middleware might be used without requireActiveOrganization or protect.");
            return res.status(403).json({ msg: 'Forbidden. No organization role identified for the user in the active context.' });
        }

        const rolesToCheck = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

        if (rolesToCheck.length && !rolesToCheck.includes(req.organizationRole)) {
            return res.status(403).json({
                msg: `Access denied. Your role ('${req.organizationRole}') within the organization '${req.organization.name}' is not authorized for this resource. Required roles: ${rolesToCheck.join(' or ')}.`,
            });
        }
        next(); // User has one of the allowed roles
    };
};

module.exports = { protect, requireActiveOrganization, authorizeOrganizationRole };
