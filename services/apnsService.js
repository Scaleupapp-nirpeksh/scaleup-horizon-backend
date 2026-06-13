// services/apnsService.js
// Apple Push Notification sender over HTTP/2 with a token-based (.p8) auth key.
// No-ops gracefully when not configured so the app runs without push set up.
//
// Required env to activate:
//   APNS_KEY_ID        — the Key ID of the .p8 auth key
//   APNS_TEAM_ID       — Apple Developer Team ID
//   APNS_BUNDLE_ID     — app bundle id (club.scaleupapp.horizon)
//   APNS_KEY           — the .p8 file contents (PEM), newlines as \n
//   APNS_PRODUCTION    — "true" for production gateway, else sandbox
const http2 = require('http2');
const jwt = require('jsonwebtoken');

function configured() {
    return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID && process.env.APNS_KEY);
}

// Provider JWT is valid up to 1h; cache and refresh at ~50 min.
let cachedToken = null;
let cachedAt = 0;

function providerToken() {
    const now = Date.now();
    if (cachedToken && (now - cachedAt) < 50 * 60 * 1000) return cachedToken;
    const key = process.env.APNS_KEY.replace(/\\n/g, '\n');
    cachedToken = jwt.sign(
        { iss: process.env.APNS_TEAM_ID, iat: Math.floor(now / 1000) },
        key,
        { algorithm: 'ES256', header: { alg: 'ES256', kid: process.env.APNS_KEY_ID } }
    );
    cachedAt = now;
    return cachedToken;
}

function gatewayHost(environment) {
    // Per-device environment wins; APNS_PRODUCTION is the default.
    const prod = environment ? environment === 'production' : process.env.APNS_PRODUCTION === 'true';
    return prod ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
}

/**
 * Send one push. Resolves { ok, status, reason?, unregistered? }.
 * unregistered=true means the token is dead and should be deleted.
 */
function sendPush({ token, title, body, badge, data = {}, environment }) {
    return new Promise((resolve) => {
        if (!configured()) return resolve({ ok: false, reason: 'apns-not-configured' });

        let client;
        try {
            client = http2.connect(gatewayHost(environment));
        } catch (err) {
            return resolve({ ok: false, reason: err.message });
        }
        client.on('error', (err) => resolve({ ok: false, reason: err.message }));

        const payload = JSON.stringify({
            aps: {
                alert: { title, body },
                sound: 'default',
                ...(badge !== undefined ? { badge } : {}),
            },
            ...data,
        });

        const req = client.request({
            ':method': 'POST',
            ':path': `/3/device/${token}`,
            'authorization': `bearer ${providerToken()}`,
            'apns-topic': process.env.APNS_BUNDLE_ID,
            'apns-push-type': 'alert',
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
        });

        let status = 0;
        let data2 = '';
        req.on('response', (headers) => { status = headers[':status']; });
        req.on('data', (chunk) => { data2 += chunk; });
        req.on('end', () => {
            client.close();
            if (status === 200) return resolve({ ok: true, status });
            let reason;
            try { reason = JSON.parse(data2).reason; } catch { /* ignore */ }
            const unregistered = reason === 'BadDeviceToken' || reason === 'Unregistered';
            resolve({ ok: false, status, reason, unregistered });
        });
        req.on('error', (err) => { client.close(); resolve({ ok: false, reason: err.message }); });
        req.write(payload);
        req.end();
    });
}

module.exports = { sendPush, configured };
