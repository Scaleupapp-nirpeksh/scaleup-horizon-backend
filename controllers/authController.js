// controllers/authController.js
const HorizonUser = require('../models/userModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registerUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        let user = await HorizonUser.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }
        user = new HorizonUser({ name, email, password, role });
        await user.save();
        // For MVP, maybe don't auto-login or return token on register,
        // or do it if this is the first user setup.
        res.status(201).json({ msg: 'Horizon user registered successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.loginUser = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await HorizonUser.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const payload = { horizonUser: { id: user.id, role: user.role } };
        jwt.sign(
            payload,
            process.env.HORIZON_JWT_SECRET || 'yourHorizonSecret', // Use a specific secret for Horizon
            { expiresIn: '5h' }, // Token expiration
            (err, token) => {
                if (err) throw err;
                res.json({ token, userName: user.name, userRole: user.role });
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// exports.getMe = async (req, res) => { ... } // For later
