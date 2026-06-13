// services/otpService.js
// Issue, send and verify one-time passcodes. Codes are 6 digits, hashed in
// the DB, expire in 5 minutes, rate-limited per phone, and allow 5 attempts.
const crypto = require('crypto');
const Otp = require('../models/otpModel');
const { sendSMS, configured } = require('./smsService');

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_PER_HOUR = 6;

function hashCode(phone, code) {
    return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

function generateCode() {
    // 6 digits, no leading-zero loss (100000–999999)
    return String(crypto.randomInt(100000, 1000000));
}

/**
 * Normalize an Indian or international number to E.164.
 * Bare 10-digit numbers are assumed +91 (India).
 */
function normalizePhone(input) {
    if (!input) return null;
    let s = String(input).replace(/[^\d+]/g, '');
    if (s.startsWith('+')) return s;
    s = s.replace(/^0+/, '');
    if (s.length === 10) return `+91${s}`;
    if (s.length === 12 && s.startsWith('91')) return `+${s}`;
    if (s.length > 10) return `+${s}`;
    return null;
}

/**
 * Issue + SMS an OTP. Returns { ok, error?, cooldown?, devCode? }.
 * devCode is only returned when SMS is not configured (local/dev).
 */
async function requestOtp({ phone, purpose, user = null }) {
    const recent = await Otp.find({ phone, purpose, consumedAt: null })
        .sort({ createdAt: -1 }).limit(MAX_PER_HOUR);

    if (recent[0] && (Date.now() - recent[0].createdAt.getTime()) < RESEND_COOLDOWN_MS) {
        return { ok: false, error: 'Please wait a few seconds before requesting another code.' };
    }
    const lastHour = recent.filter(o => (Date.now() - o.createdAt.getTime()) < 60 * 60 * 1000);
    if (lastHour.length >= MAX_PER_HOUR) {
        return { ok: false, error: 'Too many codes requested. Try again later.' };
    }

    const code = generateCode();
    await Otp.create({
        phone,
        purpose,
        user,
        codeHash: hashCode(phone, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });

    const body = `${code} is your ScaleUp Horizon verification code. It expires in 5 minutes.`;
    const result = await sendSMS(phone, body);

    if (!result.sent && configured()) {
        return { ok: false, error: 'Could not send the code. Check the number and try again.' };
    }
    // When Twilio isn't configured (dev), surface the code so flows are testable.
    return { ok: true, devCode: configured() ? undefined : code };
}

/**
 * Verify a code. Returns { ok, error?, otp? }. On success the OTP doc is
 * marked consumed and returned so the caller can read its `user`.
 */
async function verifyOtp({ phone, purpose, code }) {
    const otp = await Otp.findOne({ phone, purpose, consumedAt: null }).sort({ createdAt: -1 });
    if (!otp) return { ok: false, error: 'No active code. Request a new one.' };
    if (otp.expiresAt < new Date()) return { ok: false, error: 'That code expired. Request a new one.' };
    if (otp.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'Too many attempts. Request a new code.' };

    otp.attempts += 1;
    if (otp.codeHash !== hashCode(phone, String(code).trim())) {
        await otp.save();
        return { ok: false, error: 'Incorrect code.' };
    }
    otp.consumedAt = new Date();
    await otp.save();
    return { ok: true, otp };
}

module.exports = { requestOtp, verifyOtp, normalizePhone };
