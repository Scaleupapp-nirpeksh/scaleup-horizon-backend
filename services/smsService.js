// services/smsService.js
// Thin Twilio SMS sender over the REST API (no SDK dependency). Sends from
// TWILIO_PHONE_NUMBER. If credentials are absent the service is a no-op that
// returns { sent:false } so non-SMS environments degrade gracefully.
const https = require('https');
const { URLSearchParams } = require('url');

function configured() {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

/**
 * Send an SMS. Resolves { sent, sid?, error? } — never throws, so OTP flows
 * can decide how to surface failures without crashing the request.
 */
function sendSMS(to, body) {
    return new Promise((resolve) => {
        if (!configured()) {
            console.warn('SMS not sent — Twilio not configured.');
            return resolve({ sent: false, error: 'SMS not configured' });
        }
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
        const payload = new URLSearchParams({
            To: to,
            From: process.env.TWILIO_PHONE_NUMBER,
            Body: body,
        }).toString();

        const req = https.request({
            method: 'POST',
            hostname: 'api.twilio.com',
            path: `/2010-04-01/Accounts/${sid}/Messages.json`,
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    let sidOut;
                    try { sidOut = JSON.parse(data).sid; } catch { /* ignore */ }
                    resolve({ sent: true, sid: sidOut });
                } else {
                    let msg = data;
                    try { msg = JSON.parse(data).message; } catch { /* ignore */ }
                    console.error('Twilio send failed:', res.statusCode, msg);
                    resolve({ sent: false, error: msg || `Twilio ${res.statusCode}` });
                }
            });
        });
        req.on('error', (err) => {
            console.error('Twilio request error:', err.message);
            resolve({ sent: false, error: err.message });
        });
        req.write(payload);
        req.end();
    });
}

module.exports = { sendSMS, configured };
