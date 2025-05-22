// models/investorReportModel.js
const mongoose = require('mongoose');

const investorReportSchema = new mongoose.Schema({
    reportTitle: { type: String, required: true, default: () => `Investor Update - ${new Date().toLocaleString()}` },
    periodStartDate: { type: Date }, // Optional: For reports covering a specific period
    periodEndDate: { type: Date },   // Optional
    narrativeSummary: { // Founder's commentary
        type: String,
        required: true,
        trim: true
    },
    keyAchievements: [{ type: String, trim: true }],
    challengesFaced: [{ type: String, trim: true }],
    nextStepsFocus: [{ type: String, trim: true }],
    
    // Snapshot of key data at the time of report generation (optional, if not purely live)
    // This could be populated by the controller when a "report" is "generated"
    snapshotData: {
        totalFundsRaisedThisRound: Number,
        currentBankBalance: Number,
        monthlyBurnRate: Number,
        estimatedRunwayMonths: Number,
        dau: Number,
        mau: Number,
        newUserGrowth: Number,
        // Add other key KPIs you want to snapshot
    },
    
    sharedWithInvestorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Investor' }], // Track who it was shared with
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser', required: true },
    createdAt: { type: Date, default: Date.now },
});

// Check if the model already exists before compiling it
module.exports = mongoose.models.InvestorReport || mongoose.model('InvestorReport', investorReportSchema);
