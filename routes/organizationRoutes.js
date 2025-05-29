// routes/organizationRoutes.js
const express = require('express');
const router = express.Router();
const {
    getActiveOrganizationDetails,
    updateActiveOrganizationDetails,
    provisionNewMember,
    listOrganizationMembers,
    updateMemberRole,
    removeMemberFromOrganization
} = require('../controllers/organizationController'); // Adjust path if needed

const {
    protect,
    requireActiveOrganization,
    authorizeOrganizationRole
} = require('../middleware/authMiddleware'); // Adjust path if needed

// All routes in this file will first be protected and require an active organization context.
router.use(protect, requireActiveOrganization);

// --- Routes for Managing the Logged-in User's Active Organization ---
router.route('/my')
    .get(authorizeOrganizationRole(['owner', 'member']), getActiveOrganizationDetails) // Owners and members can view
    .put(authorizeOrganizationRole(['owner']), updateActiveOrganizationDetails);      // Only owners can update

// --- Routes for Managing Members within the Active Organization ---
router.route('/my/members')
    .get(authorizeOrganizationRole(['owner', 'member']), listOrganizationMembers); // Owners and members can list

router.post(
    '/my/members/provision',
    authorizeOrganizationRole(['owner']), // Only owners can provision new members
    provisionNewMember
);

router.put(
    '/my/members/:memberUserId/role',
    authorizeOrganizationRole(['owner']), // Only owners can change roles
    updateMemberRole
);

router.delete(
    '/my/members/:memberUserId',
    authorizeOrganizationRole(['owner']), // Only owners can remove members
    removeMemberFromOrganization
);

module.exports = router;
