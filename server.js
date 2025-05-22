// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const fundraisingRoutes = require('./routes/fundraisingRoutes');
const financialRoutes = require('./routes/financialRoutes');
// const kpiRoutes = require('./routes/kpiRoutes'); // For future

const app = express();
const PORT = process.env.HORIZON_PORT || 5001; // Different port from main app

// Middleware
app.use(cors()); // Basic CORS for now, refine as needed
app.use(express.json()); // To parse JSON bodies

// Database Connection
connectDB();
// API Routes
app.use('/api/horizon/auth', authRoutes);
app.use('/api/horizon/fundraising', fundraisingRoutes);
app.use('/api/horizon/financials', financialRoutes);
// app.use('/api/horizon/kpis', kpiRoutes);

// Test Route
app.get('/api/horizon', (req, res) => {
    res.send('ScaleUp Horizon Backend Running!');
});

app.listen(PORT, () => {
    console.log(`ScaleUp Horizon server running on port ${PORT}`);
});
