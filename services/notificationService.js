// services/notificationService.js
// Creates in-app notifications and (best-effort) sends email copies.
// Email transports, in order of preference:
//   1. SMTP (e.g. Gmail) — set SMTP_HOST / SMTP_USER / SMTP_PASS. Can send
//      to any recipient (no SES sandbox restrictions).
//   2. AWS SES — set NOTIFY_EMAIL_FROM to a SES-verified sender.
// If neither is configured or a send fails, in-app notifications still work.
const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');
const Notification = require('../models/notificationModel');
const HorizonUser = require('../models/userModel');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.scaleuphorizon.com';

let smtpTransport = null;
let ses = null;
let EMAIL_FROM = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    smtpTransport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    EMAIL_FROM = process.env.NOTIFY_EMAIL_FROM || process.env.SMTP_USER;
    console.log(`Notification emails enabled via SMTP ${process.env.SMTP_HOST} (from ${EMAIL_FROM})`);
} else if (process.env.NOTIFY_EMAIL_FROM) {
    EMAIL_FROM = process.env.NOTIFY_EMAIL_FROM;
    ses = new AWS.SES({
        region: process.env.HORIZON_AWS_REGION || 'ap-south-1',
        accessKeyId: process.env.HORIZON_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.HORIZON_AWS_SECRET_ACCESS_KEY,
    });
    console.log(`Notification emails enabled via SES (from ${EMAIL_FROM})`);
} else {
    console.log('No email transport configured — notifications are in-app only');
}

function taskUrl(taskId) {
    return `${FRONTEND_URL}/tasks${taskId ? `?task=${taskId}` : ''}`;
}

async function sendEmail(user, title, message, taskId) {
    if ((!smtpTransport && !ses) || !user.email) return;
    if (user.preferences?.notifications?.emailEnabled === false) return;

    const body = `${message || title}\n\nOpen in ScaleUp Horizon: ${taskUrl(taskId)}\n\n—\nYou are receiving this because of activity on a task you are involved in.`;

    try {
        if (smtpTransport) {
            await smtpTransport.sendMail({
                from: `ScaleUp Horizon <${EMAIL_FROM}>`,
                to: user.email,
                subject: title,
                text: body,
            });
        } else {
            await ses.sendEmail({
                Source: `ScaleUp Horizon <${EMAIL_FROM}>`,
                Destination: { ToAddresses: [user.email] },
                Message: {
                    Subject: { Data: title },
                    Body: { Text: { Data: body } },
                },
            }).promise();
        }
    } catch (err) {
        console.error(`Notification email to ${user.email} failed: ${err.message}`);
    }
}

/**
 * Create in-app notifications (and best-effort emails) for a set of users.
 * The actor (who caused the event) is always excluded.
 *
 * @param {Object} opts
 * @param {ObjectId|string} opts.organizationId
 * @param {Array<ObjectId|string>} opts.recipientIds
 * @param {ObjectId|string|null} opts.actorId
 * @param {string} opts.type - task_assigned | task_comment | comment_mention | task_due | system
 * @param {string} opts.title
 * @param {string} [opts.message]
 * @param {ObjectId|string|null} [opts.taskId]
 * @param {boolean} [opts.email=true] - also send an email copy
 */
async function notifyUsers({ organizationId, recipientIds, actorId, type, title, message, taskId = null, email = true }) {
    try {
        const recipients = [...new Set((recipientIds || []).filter(Boolean).map(String))]
            .filter(id => !actorId || id !== String(actorId));
        if (recipients.length === 0) return [];

        const docs = await Notification.insertMany(recipients.map(recipient => ({
            organization: organizationId,
            recipient,
            type,
            title,
            message,
            relatedTask: taskId,
        })));

        if (email && ses) {
            // Fire-and-forget: never block the API response on email delivery
            HorizonUser.find({ _id: { $in: recipients } })
                .select('email name preferences')
                .then(users => Promise.allSettled(users.map(u => sendEmail(u, title, message, taskId))))
                .catch(err => console.error('Notification email batch failed:', err.message));
        }

        return docs;
    } catch (err) {
        // Notifications must never break the main operation
        console.error('notifyUsers failed:', err.message);
        return [];
    }
}

module.exports = { notifyUsers, taskUrl };
