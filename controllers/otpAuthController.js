// controllers/otpAuthController.js
// Phone-OTP login + authenticated phone-change flow. Reuses the same JWT and
// session payload shape as password login so clients are interchangeable.
const jwt = require('jsonwebtoken');
const HorizonUser = require('../models/userModel');
const Membership = require('../models/membershipModel');
const otpService = require('../services/otpService');

const JWT_SECRET = process.env.HORIZON_JWT_SECRET;
const JWT_EXPIRATION = process.env.HORIZON_JWT_EXPIRATION || '30d';

function generateToken(userId, activeOrganizationId = null) {
    return jwt.sign({ id: userId, activeOrganization: activeOrganizationId }, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
}

// Builds the exact same response body as POST /auth/login.
async function buildSessionPayload(user) {
    const memberships = await Membership.find({ user: user._id, status: 'active' })
        .populate('organization', 'name currency timezone');

    let activeOrgId = null;
    let activeOrgDetails = null;

    if (memberships.length > 0) {
        let target = null;
        if (user.activeOrganization) {
            target = memberships.find(m => m.organization._id.equals(user.activeOrganization));
        }
        if (!target && user.defaultOrganization) {
            target = memberships.find(m => m.organization._id.equals(user.defaultOrganization));
        }
        if (!target) target = memberships[0];

        if (target && target.organization) {
            activeOrgId = target.organization._id;
            activeOrgDetails = {
                id: target.organization._id,
                name: target.organization.name,
                role: target.role,
                currency: target.organization.currency,
                timezone: target.organization.timezone,
            };
            if (!user.activeOrganization || !user.activeOrganization.equals(activeOrgId)) {
                user.activeOrganization = activeOrgId;
                await user.save();
            }
        }
    }

    return {
        token: generateToken(user._id, activeOrgId),
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            isAccountActive: user.isAccountActive,
            isPlatformAdmin: user.isPlatformAdmin,
        },
        activeOrganization: activeOrgDetails,
        memberships: memberships.map(m => ({
            organizationId: m.organization._id,
            organizationName: m.organization.name,
            role: m.role,
        })),
    };
}

// ----------------------------------------------------------- login by OTP

/**
 * @desc    Request a login OTP for a phone number
 * @route   POST /api/horizon/auth/otp/request
 * @body    { phone }
 * @access  Public
 */
exports.requestLoginOtp = async (req, res) => {
    try {
        const phone = otpService.normalizePhone(req.body.phone);
        if (!phone) return res.status(400).json({ msg: 'Enter a valid mobile number.' });

        const user = await HorizonUser.findOne({ phone });
        // Privacy: do not reveal whether a number is registered. If no user,
        // pretend success but send nothing.
        if (!user || !user.isAccountActive) {
            return res.json({ msg: 'If that number is registered, a code is on its way.' });
        }

        const result = await otpService.requestOtp({ phone, purpose: 'login' });
        if (!result.ok) return res.status(429).json({ msg: result.error });

        const body = { msg: 'Code sent.' };
        if (result.devCode) body.devCode = result.devCode; // only when SMS unconfigured
        res.json(body);
    } catch (err) {
        console.error('requestLoginOtp error:', err.message);
        res.status(500).send('Server Error: could not send code');
    }
};

/**
 * @desc    Verify a login OTP → returns a session (same shape as /auth/login)
 * @route   POST /api/horizon/auth/otp/verify
 * @body    { phone, code }
 * @access  Public
 */
exports.verifyLoginOtp = async (req, res) => {
    try {
        const phone = otpService.normalizePhone(req.body.phone);
        if (!phone || !req.body.code) return res.status(400).json({ msg: 'Phone and code are required.' });

        const result = await otpService.verifyOtp({ phone, purpose: 'login', code: req.body.code });
        if (!result.ok) return res.status(400).json({ msg: result.error });

        const user = await HorizonUser.findOne({ phone });
        if (!user || !user.isAccountActive) return res.status(404).json({ msg: 'Account not found.' });

        user.lastLoginAt = Date.now();
        if (!user.phoneVerified) user.phoneVerified = true;
        await user.save();

        res.json(await buildSessionPayload(user));
    } catch (err) {
        console.error('verifyLoginOtp error:', err.message);
        res.status(500).send('Server Error: could not verify code');
    }
};

// ------------------------------------------------- change phone (authed)

/**
 * @desc    Request an OTP to a NEW phone number to verify ownership
 * @route   POST /api/horizon/auth/phone/change/request
 * @body    { phone }   (the new number)
 * @access  Private
 */
exports.requestPhoneChange = async (req, res) => {
    try {
        const phone = otpService.normalizePhone(req.body.phone);
        if (!phone) return res.status(400).json({ msg: 'Enter a valid mobile number.' });

        const taken = await HorizonUser.findOne({ phone, _id: { $ne: req.user._id } });
        if (taken) return res.status(409).json({ msg: 'That number is already linked to another account.' });

        const result = await otpService.requestOtp({ phone, purpose: 'change_phone', user: req.user._id });
        if (!result.ok) return res.status(429).json({ msg: result.error });

        const body = { msg: 'Verification code sent to the new number.' };
        if (result.devCode) body.devCode = result.devCode;
        res.json(body);
    } catch (err) {
        console.error('requestPhoneChange error:', err.message);
        res.status(500).send('Server Error: could not send code');
    }
};

/**
 * @desc    Verify the new-number OTP and update the user's phone
 * @route   POST /api/horizon/auth/phone/change/verify
 * @body    { phone, code }
 * @access  Private
 */
exports.verifyPhoneChange = async (req, res) => {
    try {
        const phone = otpService.normalizePhone(req.body.phone);
        if (!phone || !req.body.code) return res.status(400).json({ msg: 'Phone and code are required.' });

        const result = await otpService.verifyOtp({ phone, purpose: 'change_phone', code: req.body.code });
        if (!result.ok) return res.status(400).json({ msg: result.error });

        // The OTP records who initiated the change — must match the caller.
        if (!result.otp.user || !result.otp.user.equals(req.user._id)) {
            return res.status(403).json({ msg: 'This code was not requested by your account.' });
        }
        // Re-check uniqueness at commit time (race safety).
        const taken = await HorizonUser.findOne({ phone, _id: { $ne: req.user._id } });
        if (taken) return res.status(409).json({ msg: 'That number is already linked to another account.' });

        const user = await HorizonUser.findById(req.user._id);
        user.phone = phone;
        user.phoneVerified = true;
        await user.save();

        res.json({ msg: 'Mobile number updated.', phone: user.phone });
    } catch (err) {
        console.error('verifyPhoneChange error:', err.message);
        res.status(500).send('Server Error: could not update number');
    }
};
