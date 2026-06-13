// controllers/deviceController.js
// Register/unregister push devices for the authenticated user.
const Device = require('../models/deviceModel');

/**
 * @desc    Register (upsert) this device's push token
 * @route   POST /api/horizon/devices
 * @body    { token, platform?, environment?, appVersion? }
 * @access  Private
 */
exports.registerDevice = async (req, res) => {
    try {
        const { token, platform, environment, appVersion } = req.body;
        if (!token || !String(token).trim()) {
            return res.status(400).json({ msg: 'Device token is required' });
        }
        const device = await Device.findOneAndUpdate(
            { token: String(token).trim() },
            {
                $set: {
                    user: req.user._id,
                    platform: platform || 'ios',
                    environment: environment || 'production',
                    appVersion,
                    lastSeenAt: new Date(),
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.status(201).json({ msg: 'Device registered', deviceId: device._id });
    } catch (err) {
        console.error('registerDevice error:', err.message);
        res.status(500).send('Server Error: could not register device');
    }
};

/**
 * @desc    Unregister a token (on sign-out)
 * @route   DELETE /api/horizon/devices/:token
 * @access  Private
 */
exports.unregisterDevice = async (req, res) => {
    try {
        await Device.deleteOne({ token: req.params.token, user: req.user._id });
        res.json({ msg: 'Device unregistered' });
    } catch (err) {
        console.error('unregisterDevice error:', err.message);
        res.status(500).send('Server Error: could not unregister device');
    }
};
