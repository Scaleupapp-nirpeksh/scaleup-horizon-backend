// controllers/organizationController.js
const mongoose = require('mongoose');
const HorizonUser = require('../models/userModel'); // Phase 1 Model
const Organization = require('../models/organizationModel'); // Phase 1 Model
const Membership = require('../models/membershipModel'); // Phase 1 Model
const crypto = require('crypto'); // For generating tokens if needed, though userModel handles it

// --- Organization Management Controllers ---

/**
 * @desc    Get details of the user's active organization.
 * Relies on req.organization being populated by authMiddleware.
 * @route   GET /api/organizations/my
 * @access  Private (requires active organization, accessible by 'owner' or 'member')
 */
exports.getActiveOrganizationDetails = async (req, res) => {
    // req.organization and req.organizationRole are populated by authMiddleware
    // The 'requireActiveOrganization' middleware ensures req.organization exists.
    res.status(200).json({
        id: req.organization._id,
        name: req.organization.name,
        owner: req.organization.owner, // Original creator
        industry: req.organization.industry,
        timezone: req.organization.timezone,
        currency: req.organization.currency,
        settings: req.organization.settings,
        createdAt: req.organization.createdAt,
        yourRole: req.organizationRole, // User's role in this specific organization
    });
};

/**
 * @desc    Update details of the user's active organization.
 * @route   PUT /api/organizations/my
 * @access  Private (requires 'owner' role in the active organization)
 */
exports.updateActiveOrganizationDetails = async (req, res) => {
    const { name, industry, timezone, currency, settings } = req.body;
    // req.organization is the Mongoose document of the active organization, populated by authMiddleware.

    try {
        if (name) req.organization.name = name;
        if (industry) req.organization.industry = industry;
        if (timezone) req.organization.timezone = timezone; // TODO: Validate timezone string
        if (currency) req.organization.currency = currency; // TODO: Validate against enum or list
        if (settings) {
            req.organization.settings = { ...req.organization.settings, ...settings };
        }

        const updatedOrganization = await req.organization.save();
        res.status(200).json(updatedOrganization);

    } catch (err) {
        console.error('Update Organization Error:', err.message, err.stack);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error: ' + err.message });
        }
        res.status(500).send('Server Error updating organization.');
    }
};


// --- Member Management Controllers ---

/**
 * @desc    Provision a new member for the active organization and generate setup link.
 * This is initiated by an 'owner' of the organization.
 * @route   POST /api/organizations/my/members/provision
 * @access  Private (requires 'owner' role)
 */
exports.provisionNewMember = async (req, res) => {
    const { email, name, role } = req.body; // Role for the new member (e.g., 'member')
    const inviter = req.user; // The admin/owner performing this action
    const activeOrganization = req.organization; // The organization they are inviting to

    if (!email || !name || !role) {
        return res.status(400).json({ msg: 'Please provide email, name, and role for the new member.' });
    }

    if (!Membership.validRoles.includes(role)) {
        return res.status(400).json({ msg: `Invalid role. Must be one of: ${Membership.validRoles.join(', ')}` });
    }
    if (role === 'owner' && req.organizationRole !== 'owner') { // Only owners can assign owner role
         return res.status(403).json({ msg: 'Only an existing owner can assign the owner role.'});
    }


    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let newOrExistingUser = await HorizonUser.findOne({ email }).session(session);
        let accountSetupToken;

        if (newOrExistingUser) {
            // User with this email already exists
            if (newOrExistingUser.isAccountActive) {
                // Check if already a member of this specific organization
                const existingMembership = await Membership.findOne({
                    user: newOrExistingUser._id,
                    organization: activeOrganization._id,
                }).session(session);

                if (existingMembership && existingMembership.status === 'active') {
                    await session.abortTransaction(); session.endSession();
                    return res.status(400).json({ msg: 'This user is already an active member of this organization.' });
                }
                if (existingMembership && existingMembership.status === 'pending_user_setup') {
                     await session.abortTransaction(); session.endSession();
                    return res.status(400).json({ msg: 'This user already has a pending setup for this organization. They need to complete it.' });
                }
                // If user exists, is active, but not a member of THIS org, we can create a new 'active' membership directly.
                // This flow is more like "add existing platform user to my org" rather than "provision new".
                // For now, to keep it simple with the setup link flow, we'll focus on new users or inactive existing users.
                // We will require a separate flow or clear distinction for adding *already active platform users* to an org.
                // For this "provision" endpoint, let's assume it's for users who need to go through a setup or are new.
                 await session.abortTransaction(); session.endSession();
                 return res.status(400).json({ msg: 'A user with this email already exists and is active. To add them, please use a different flow (e.g., "Add Existing User" - future feature).' });
            } else {
                // User exists but is not active (e.g., from a previous incomplete setup)
                // We can re-use this user record and generate a new setup token for them for THIS organization.
                accountSetupToken = newOrExistingUser.generateAccountSetupToken();
                newOrExistingUser.name = name; // Update name if admin provided a different one
                // Ensure their default/active org is not this one yet if they are being re-setup.
                // This will be set upon successful setup completion.
            }
        } else {
            // User does not exist, create a new one
            newOrExistingUser = new HorizonUser({
                email,
                name,
                // Password will be set by the user during setup
                isAccountActive: false,
            });
            accountSetupToken = newOrExistingUser.generateAccountSetupToken();
        }

        await newOrExistingUser.save({ session });

        // Create Membership record
        const newMembership = new Membership({
            user: newOrExistingUser._id,
            organization: activeOrganization._id,
            role,
            status: 'pending_user_setup',
            invitedBy: inviter._id,
        });
        await newMembership.save({ session });

        await session.commitTransaction();

        // IMPORTANT: The admin (inviter) is responsible for securely sharing this setup link.
        // The link should ideally point to a frontend route.
        const setupLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/complete-setup/${accountSetupToken}`;

        res.status(201).json({
            msg: `User ${name} (${email}) has been provisioned for ${activeOrganization.name}.`,
            userId: newOrExistingUser._id,
            membershipId: newMembership._id,
            role: newMembership.role,
            status: newMembership.status,
            accountSetupToken: accountSetupToken, // For admin to construct link or for API testing
            setupLink: setupLink, // Provide the full link for convenience
            instructions: "Please securely share the setupLink with the new member. They will use it to set their password and activate their account."
        });

    } catch (err) {
        await session.abortTransaction();
        console.error('Provision New Member Error:', err.message, err.stack);
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'A user with this email might already exist or another unique constraint was violated.' });
        }
        res.status(500).send('Server Error provisioning new member.');
    } finally {
        session.endSession();
    }
};

/**
 * @desc    List all members of the active organization.
 * @route   GET /api/organizations/my/members
 * @access  Private (accessible by 'owner' or 'member' of active organization)
 */
exports.listOrganizationMembers = async (req, res) => {
    const activeOrganizationId = req.organization._id;

    try {
        const memberships = await Membership.find({
            organization: activeOrganizationId,
            // Optionally filter by status, e.g., status: { $in: ['active', 'pending_user_setup'] }
        })
        .populate('user', 'name email isAccountActive lastLoginAt createdAt') // Select fields from HorizonUser
        .sort({ createdAt: -1 }); // Sort by when they were added/provisioned

        res.status(200).json(memberships.map(mem => ({
            membershipId: mem._id,
            userId: mem.user ? mem.user._id : null,
            name: mem.user ? mem.user.name : 'N/A (User record missing)',
            email: mem.user ? mem.user.email : 'N/A',
            role: mem.role,
            status: mem.status,
            isAccountActive: mem.user ? mem.user.isAccountActive : false,
            joinedAt: mem.createdAt, // When membership was created
            lastLoginAt: mem.user ? mem.user.lastLoginAt : null,
        })));

    } catch (err) {
        console.error('List Members Error:', err.message, err.stack);
        res.status(500).send('Server Error listing organization members.');
    }
};

/**
 * @desc    Update a member's role in the active organization.
 * @route   PUT /api/organizations/my/members/:memberUserId/role
 * @access  Private (requires 'owner' role)
 */
exports.updateMemberRole = async (req, res) => {
    const { memberUserId } = req.params;
    const { newRole } = req.body;
    const activeOrganizationId = req.organization._id;
    const performingUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(memberUserId)) {
        return res.status(400).json({ msg: 'Invalid member user ID.' });
    }
    if (!newRole || !Membership.validRoles.includes(newRole)) {
        return res.status(400).json({ msg: `Invalid new role. Must be one of: ${Membership.validRoles.join(', ')}` });
    }

    try {
        const membershipToUpdate = await Membership.findOne({
            user: memberUserId,
            organization: activeOrganizationId,
        });

        if (!membershipToUpdate) {
            return res.status(404).json({ msg: 'Membership not found for this user in your organization.' });
        }

        // Safeguard: Prevent owner from demoting themselves if they are the sole owner
        if (membershipToUpdate.user.equals(performingUserId) &&
            membershipToUpdate.role === 'owner' &&
            newRole !== 'owner') {
            const ownerCount = await Membership.countDocuments({
                organization: activeOrganizationId,
                role: 'owner',
                status: 'active', // Count only active owners
            });
            if (ownerCount <= 1) {
                return res.status(400).json({ msg: 'Cannot change role of the sole owner. To change roles, first assign another user as an owner.' });
            }
        }
         if (newRole === 'owner' && req.organizationRole !== 'owner') { // Only owners can assign owner role
             return res.status(403).json({ msg: 'Only an existing owner can assign the owner role.'});
         }


        membershipToUpdate.role = newRole;
        await membershipToUpdate.save();

        res.status(200).json({
            msg: `Role for user ${memberUserId} updated to ${newRole}.`,
            membership: membershipToUpdate,
        });

    } catch (err) {
        console.error('Update Member Role Error:', err.message, err.stack);
        res.status(500).send('Server Error updating member role.');
    }
};

/**
 * @desc    Remove a member from the active organization.
 * @route   DELETE /api/organizations/my/members/:memberUserId
 * @access  Private (requires 'owner' role)
 */
exports.removeMemberFromOrganization = async (req, res) => {
    const { memberUserId } = req.params;
    const activeOrganizationId = req.organization._id;
    const performingUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(memberUserId)) {
        return res.status(400).json({ msg: 'Invalid member user ID.' });
    }

    try {
        const membershipToRemove = await Membership.findOne({
            user: memberUserId,
            organization: activeOrganizationId,
        });

        if (!membershipToRemove) {
            return res.status(404).json({ msg: 'Membership not found for this user in your organization.' });
        }

        // Safeguard: Prevent owner from removing themselves if they are the sole owner
        if (membershipToRemove.user.equals(performingUserId) && membershipToRemove.role === 'owner') {
            const ownerCount = await Membership.countDocuments({
                organization: activeOrganizationId,
                role: 'owner',
                status: 'active', // Count only active owners
            });
            if (ownerCount <= 1) {
                return res.status(400).json({ msg: 'Cannot remove the sole owner. To leave the organization, you must first transfer ownership or delete the organization (future feature).' });
            }
        }

        // Use deleteOne() instead of remove() - remove() is deprecated in newer Mongoose versions
        await membershipToRemove.deleteOne();

        // Optional: If the removed user had this organization as their active/default, clear it.
        const removedUser = await HorizonUser.findById(memberUserId);
        if (removedUser) {
            let changed = false;
            if (removedUser.activeOrganization && removedUser.activeOrganization.equals(activeOrganizationId)) {
                removedUser.activeOrganization = null;
                changed = true;
            }
            if (removedUser.defaultOrganization && removedUser.defaultOrganization.equals(activeOrganizationId)) {
                removedUser.defaultOrganization = null; // Or set to another org if they have one
                changed = true;
            }
            if (changed && !removedUser.activeOrganization && !removedUser.defaultOrganization) {
                // If they have no other orgs, find another one to set as active/default
                const anyOtherMembership = await Membership.findOne({ user: removedUser._id, status: 'active' });
                if (anyOtherMembership) {
                    removedUser.activeOrganization = anyOtherMembership.organization;
                    removedUser.defaultOrganization = anyOtherMembership.organization;
                }
            }
            if (changed) await removedUser.save();
        }

        res.status(200).json({ msg: `User ${memberUserId} has been removed from organization ${activeOrganizationId}.` });

    } catch (err) {
        console.error('Remove Member Error:', err.message, err.stack);
        res.status(500).send('Server Error removing member.');
    }
};
