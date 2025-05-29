// models/membershipModel.js
const mongoose = require('mongoose');

// Simplified roles for MVP as per feedback.
const validRoles = ['owner', 'member'];
// Statuses adjusted for admin-driven setup for subsequent users
const membershipStatuses = [
    'active', // User has completed setup and is an active member
    'pending_user_setup', // Admin has provisioned, user needs to complete setup via link
    'revoked' // Admin has revoked access before user setup or after
];

const membershipSchema = new mongoose.Schema(
    {
        user: { // This will be linked to the pre-provisioned HorizonUser
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser', // References the 'HorizonUser' model
            required: [true, 'User ID is a required field for membership.'],
        },
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization',
            required: [true, 'Organization ID is a required field for membership.'],
        },
        role: {
            type: String,
            enum: {
                values: validRoles,
                message: 'Role {VALUE} is not supported. Must be one of: ' + validRoles.join(', '),
            },
            required: [true, 'Membership role is a required field.'],
        },
        status: {
            type: String,
            enum: {
                values: membershipStatuses,
                message: 'Status {VALUE} is not supported. Must be one of: ' + membershipStatuses.join(', '),
            },
            default: 'pending_user_setup', // Default when admin provisions a new member
            required: [true, 'Membership status is a required field.'],
        },
        // invitedBy is still relevant to know which admin added this member
        invitedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HorizonUser', // The admin who provisioned this user
            required: true,
        },
        // invitationToken and invitationTokenExpiresAt are removed from here;
        // the equivalent accountSetupToken will be on the HorizonUser model.
    },
    {
        timestamps: true, // createdAt will indicate when admin provisioned, updatedAt for status changes
        collection: 'memberships',
    }
);

// Ensure a user can only have one active/pending_user_setup membership per organization.
membershipSchema.index({ user: 1, organization: 1 }, { unique: true });

// Index for querying memberships by organization and status
membershipSchema.index({ organization: 1, status: 1 });
membershipSchema.index({ user: 1, status: 1 }); // For finding all orgs for a user by status

const Membership = mongoose.model('Membership', membershipSchema);

module.exports = Membership;
module.exports.validRoles = validRoles;
module.exports.membershipStatuses = membershipStatuses;