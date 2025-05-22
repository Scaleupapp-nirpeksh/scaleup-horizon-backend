// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const HorizonUser = require('../models/userModel'); // User model for Horizon platform users

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.HORIZON_JWT_SECRET);

            // Get user from the token (excluding password)
            // The payload during login was { horizonUser: { id: user.id, role: user.role } }
            req.horizonUser = await HorizonUser.findById(decoded.horizonUser.id).select('-password');

            if (!req.horizonUser) {
                return res.status(401).json({ msg: 'Not authorized, user not found' });
            }

            next();
        } catch (error) {
            console.error('Token verification failed:', error.message);
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ msg: 'Not authorized, token failed' });
            }
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ msg: 'Not authorized, token expired' });
            }
            res.status(401).json({ msg: 'Not authorized, token invalid' });
        }
    }

    if (!token) {
        res.status(401).json({ msg: 'Not authorized, no token' });
    }
};

// Middleware to restrict access based on role (e.g., only 'admin' role if needed later)
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.horizonUser || !roles.includes(req.horizonUser.role)) {
            return res.status(403).json({ msg: `User role '${req.horizonUser ? req.horizonUser.role : 'none'}' is not authorized to access this route` });
        }
        next();
    };
};


module.exports = { protect, authorize };
