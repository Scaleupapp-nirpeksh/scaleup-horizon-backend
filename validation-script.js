// validation-script.js
const mongoose = require('mongoose');
require('dotenv').config();

// Import all models
const HorizonUser = require('./models/userModel');
const Organization = require('./models/organizationModel');
const Membership = require('./models/membershipModel');
const BankAccount = require('./models/bankAccountModel');
const Budget = require('./models/budgetModel');
const CapTableEntry = require('./models/capTableEntryModel');
const CashFlowForecast = require('./models/cashFlowForecastModel');
const CustomKPI = require('./models/customKpiModel');
const Document = require('./models/documentModel');
const ESOPGrant = require('./models/esopGrantModel');
const Expense = require('./models/expenseModel');
const FundraisingPrediction = require('./models/fundraisingPredictionModel');
const Headcount = require('./models/headcountModel');
const InvestorMeeting = require('./models/investorMeetingModel');
const Investor = require('./models/investorModel');
const InvestorReport = require('./models/investorReportModel');
const ManualKpiSnapshot = require('./models/manualKpiSnapshotModel');
const ProductMilestone = require('./models/productMilestoneModel');
const RecurringTransaction = require('./models/recurringTransactionModel');
const RevenueCohort = require('./models/revenueCohortModel');
const Revenue = require('./models/revenueModel');
const Round = require('./models/roundModel');
const RunwayScenario = require('./models/runwayScenarioModel');

// Configuration
const DB_URI = process.env.HORIZON_MONGODB_URI || 'mongodb://localhost:27017/your-database';

// Define all models to check
const ALL_MODELS = [
  { model: HorizonUser, name: 'HorizonUser' },
  { model: Organization, name: 'Organization' },
  { model: Membership, name: 'Membership' },
  { model: BankAccount, name: 'BankAccount', requiresOrg: true, requiresUser: true },
  { model: Budget, name: 'Budget', requiresOrg: true },
  { model: CapTableEntry, name: 'CapTableEntry', requiresOrg: true, requiresUser: true },
  { model: CashFlowForecast, name: 'CashFlowForecast', requiresOrg: true },
  { model: CustomKPI, name: 'CustomKPI', requiresOrg: true },
  { model: Document, name: 'Document', requiresOrg: true },
  { model: ESOPGrant, name: 'ESOPGrant', requiresOrg: true },
  { model: Expense, name: 'Expense', requiresOrg: true, requiresUser: true },
  { model: FundraisingPrediction, name: 'FundraisingPrediction', requiresOrg: true },
  { model: Headcount, name: 'Headcount', requiresOrg: true },
  { model: InvestorMeeting, name: 'InvestorMeeting', requiresOrg: true },
  { model: Investor, name: 'Investor', requiresOrg: true },
  { model: InvestorReport, name: 'InvestorReport', requiresOrg: true },
  { model: ManualKpiSnapshot, name: 'ManualKpiSnapshot', requiresOrg: true },
  { model: ProductMilestone, name: 'ProductMilestone', requiresOrg: true },
  { model: RecurringTransaction, name: 'RecurringTransaction', requiresOrg: true },
  { model: RevenueCohort, name: 'RevenueCohort', requiresOrg: true },
  { model: Revenue, name: 'Revenue', requiresOrg: true, requiresUser: true },
  { model: Round, name: 'Round', requiresOrg: true },
  { model: RunwayScenario, name: 'RunwayScenario', requiresOrg: true }
];

// Logging utilities
const log = {
  info: (msg) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warning: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  stats: (msg) => console.log(`\x1b[36m[STATS]\x1b[0m ${msg}`)
};

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    log.success('Connected to MongoDB');
  } catch (err) {
    log.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
}

// Validation process
async function validateMigration() {
  try {
    await connectDB();
    
    log.info('Starting validation of multi-tenancy migration...');
    
    // Track overall status
    let overallSuccess = true;
    const results = [];
    
    // Check each model
    for (const modelInfo of ALL_MODELS) {
      const { model, name, requiresOrg, requiresUser } = modelInfo;
      
      // Get total document count
      const totalCount = await model.countDocuments({});
      
      let missingOrgCount = 0;
      let missingUserCount = 0;
      
      // Only check for organization field if this model requires it
      if (requiresOrg) {
        missingOrgCount = await model.countDocuments({ organization: { $exists: false } });
      }
      
      // Only check for user field if this model requires it
      if (requiresUser) {
        missingUserCount = await model.countDocuments({ user: { $exists: false } });
      }
      
      // Check if there are any documents missing required fields
      const status = (requiresOrg && missingOrgCount > 0) || (requiresUser && missingUserCount > 0) 
        ? 'FAILED' 
        : 'SUCCESS';
      
      // Update overall status
      if (status === 'FAILED') {
        overallSuccess = false;
      }
      
      // Store the result
      results.push({
        model: name,
        totalCount,
        missingOrgCount: requiresOrg ? missingOrgCount : 'N/A',
        missingUserCount: requiresUser ? missingUserCount : 'N/A',
        status
      });
    }
    
    // Output results in table format
    console.log('\n=== MIGRATION VALIDATION RESULTS ===');
    console.log('-'.repeat(90));
    console.log('| MODEL                 | TOTAL | MISSING ORG | MISSING USER | STATUS  |');
    console.log('-'.repeat(90));
    
    for (const result of results) {
      const modelPadded = result.model.padEnd(22);
      const totalPadded = String(result.totalCount).padEnd(7);
      const missingOrgPadded = String(result.missingOrgCount).padEnd(13);
      const missingUserPadded = String(result.missingUserCount).padEnd(14);
      const statusColor = result.status === 'SUCCESS' 
        ? '\x1b[32m' + result.status.padEnd(8) + '\x1b[0m' 
        : '\x1b[31m' + result.status.padEnd(8) + '\x1b[0m';
      
      console.log(`| ${modelPadded}| ${totalPadded}| ${missingOrgPadded}| ${missingUserPadded}| ${statusColor}|`);
    }
    
    console.log('-'.repeat(90));
    console.log('');
    
    // Check user associations
    log.info('Checking user organization associations...');
    const users = await HorizonUser.find({});
    const usersWithoutOrg = users.filter(u => !u.defaultOrganization || !u.activeOrganization);
    
    if (usersWithoutOrg.length > 0) {
      log.warning(`Found ${usersWithoutOrg.length} users without organization associations`);
      overallSuccess = false;
    } else {
      log.success('All users have organization associations');
    }
    
    // Check memberships
    log.info('Checking user memberships...');
    const memberships = await Membership.find({});
    log.stats(`Found ${memberships.length} membership records`);
    
    if (memberships.length < users.length) {
      log.warning(`Potential issue: ${users.length} users but only ${memberships.length} memberships`);
      overallSuccess = false;
    } else {
      log.success('Membership count matches or exceeds user count');
    }
    
    // Cross-reference check
    log.info('Performing cross-reference integrity checks...');
    
    // Pick a sample organization to check references
    const sampleOrg = await Organization.findOne({});
    if (sampleOrg) {
      // Check for owner existence
      const ownerExists = await HorizonUser.exists({ _id: sampleOrg.owner });
      if (!ownerExists) {
        log.error(`Organization ${sampleOrg._id} has invalid owner reference`);
        overallSuccess = false;
      }
      
      // Sample document references
      const sampleDoc = await Document.findOne({ organization: sampleOrg._id });
      if (sampleDoc) {
        const uploaderExists = await HorizonUser.exists({ _id: sampleDoc.uploadedBy });
        if (!uploaderExists) {
          log.error(`Document ${sampleDoc._id} has invalid uploader reference`);
          overallSuccess = false;
        }
      }
    } else {
      log.warning('No organizations found for cross-reference checks');
      overallSuccess = false;
    }
    
    // Final status
    console.log('\n=== VALIDATION SUMMARY ===');
    if (overallSuccess) {
      log.success('MIGRATION SUCCESSFUL: All checks passed');
    } else {
      log.error('MIGRATION INCOMPLETE: Some checks failed');
      log.info('Please run the migration script again or fix the remaining issues manually');
    }
    
  } catch (err) {
    log.error(`Validation failed: ${err.message}`);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    log.info('MongoDB connection closed');
  }
}

// Run the validation
validateMigration();