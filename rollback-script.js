// rollback-script.js
const mongoose = require('mongoose');
require('dotenv').config();

// Import all models
const HorizonUser = require('./models/userModel');
const Organization = require('./models/organizationModel');
const Membership = require('./models/membershipModel');
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
const DEFAULT_ORG_NAME = 'Default Organization';
const DRY_RUN = process.env.DRY_RUN === 'true' || false; // Set to true to check what would be done without executing
const ROLLBACK_DATE = process.env.ROLLBACK_DATE || null; // Optional: rollback to state before this date

// Define all models that need rollback
const MODELS_TO_ROLLBACK = [
  { model: BankAccount, name: 'BankAccount', fields: ['organization', 'user'] },
  { model: Budget, name: 'Budget', fields: ['organization'] },
  { model: CapTableEntry, name: 'CapTableEntry', fields: ['organization', 'user'] },
  { model: CashFlowForecast, name: 'CashFlowForecast', fields: ['organization'] },
  { model: CustomKPI, name: 'CustomKPI', fields: ['organization'] },
  { model: Document, name: 'Document', fields: ['organization'] },
  { model: ESOPGrant, name: 'ESOPGrant', fields: ['organization'] },
  { model: Expense, name: 'Expense', fields: ['organization', 'user'] },
  { model: FundraisingPrediction, name: 'FundraisingPrediction', fields: ['organization'] },
  { model: Headcount, name: 'Headcount', fields: ['organization'] },
  { model: InvestorMeeting, name: 'InvestorMeeting', fields: ['organization'] },
  { model: Investor, name: 'Investor', fields: ['organization', 'addedBy'] },
  { model: InvestorReport, name: 'InvestorReport', fields: ['organization'] },
  { model: ManualKpiSnapshot, name: 'ManualKpiSnapshot', fields: ['organization'] },
  { model: ProductMilestone, name: 'ProductMilestone', fields: ['organization'] },
  { model: RecurringTransaction, name: 'RecurringTransaction', fields: ['organization'] },
  { model: RevenueCohort, name: 'RevenueCohort', fields: ['organization'] },
  { model: Revenue, name: 'Revenue', fields: ['organization', 'user'] },
  { model: Round, name: 'Round', fields: ['organization'] },
  { model: RunwayScenario, name: 'RunwayScenario', fields: ['organization'] }
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

// Rollback process
const rollback = {
  // Roll back organization fields for a collection
  async rollbackCollection(modelInfo) {
    const { model, name, fields } = modelInfo;
    log.info(`Rolling back ${name} collection...`);
    
    // Build update operation to unset fields
    const unsetFields = {};
    fields.forEach(field => {
      unsetFields[field] = 1;
    });
    
    // Prepare query
    let query = {};
    
    // If rollback date is provided, only affect documents updated after that date
    if (ROLLBACK_DATE) {
      const rollbackDateObj = new Date(ROLLBACK_DATE);
      query.updatedAt = { $gte: rollbackDateObj };
      log.info(`Limiting rollback to documents updated on or after ${rollbackDateObj.toISOString()}`);
    }
    
    // Count documents that would be affected
    const count = await model.countDocuments(query);
    log.stats(`Found ${count} ${name} documents to roll back`);
    
    if (count === 0) {
      log.success(`No ${name} documents need rollback`);
      return 0;
    }
    
    if (DRY_RUN) {
      log.info(`[DRY RUN] Would roll back ${count} ${name} documents`);
      return count;
    }
    
    // Perform the update
    try {
      const result = await model.updateMany(
        query,
        { $unset: unsetFields }
      );
      
      log.success(`Rolled back ${result.nModified} ${name} documents`);
      return result.nModified;
    } catch (err) {
      log.error(`Error rolling back ${name} collection: ${err.message}`);
      return 0;
    }
  },
  
  // Roll back user organization associations
  async rollbackUsers() {
    log.info('Rolling back user organization associations...');
    
    // Prepare query
    let query = {};
    
    // If rollback date is provided, only affect users updated after that date
    if (ROLLBACK_DATE) {
      const rollbackDateObj = new Date(ROLLBACK_DATE);
      query.updatedAt = { $gte: rollbackDateObj };
    }
    
    // Find users with organization associations
    const usersToUpdate = await HorizonUser.find({
      ...query,
      $or: [
        { defaultOrganization: { $exists: true } },
        { activeOrganization: { $exists: true } }
      ]
    });
    
    log.stats(`Found ${usersToUpdate.length} users to roll back`);
    
    if (usersToUpdate.length === 0) {
      log.success('No users need rollback');
      return 0;
    }
    
    if (DRY_RUN) {
      log.info(`[DRY RUN] Would roll back ${usersToUpdate.length} users`);
      return usersToUpdate.length;
    }
    
    // Perform the update
    try {
      const result = await HorizonUser.updateMany(
        query,
        { 
          $unset: { 
            defaultOrganization: 1,
            activeOrganization: 1
          } 
        }
      );
      
      log.success(`Rolled back ${result.nModified} users`);
      return result.nModified;
    } catch (err) {
      log.error(`Error rolling back user associations: ${err.message}`);
      return 0;
    }
  },
  
  // Remove memberships and default organization
  async cleanupOrganizationalData() {
    log.info('Cleaning up organizational data...');
    
    if (DRY_RUN) {
      // Count memberships
      const membershipCount = await Membership.countDocuments({});
      log.info(`[DRY RUN] Would remove ${membershipCount} memberships`);
      
      // Count default organization
      const defaultOrgCount = await Organization.countDocuments({ name: DEFAULT_ORG_NAME });
      log.info(`[DRY RUN] Would remove ${defaultOrgCount} default organizations`);
      
      return;
    }
    
    // Remove all memberships
    try {
      const memberships = await Membership.deleteMany({});
      log.success(`Removed ${memberships.deletedCount} memberships`);
    } catch (err) {
      log.error(`Error removing memberships: ${err.message}`);
    }
    
    // Remove default organization(s) created during migration
    try {
      const defaultOrgs = await Organization.deleteMany({ name: DEFAULT_ORG_NAME });
      log.success(`Removed ${defaultOrgs.deletedCount} default organizations`);
    } catch (err) {
      log.error(`Error removing default organizations: ${err.message}`);
    }
  },
  
  // Run the full rollback process
  async run() {
    try {
      await connectDB();
      
      log.info('Starting rollback of multi-tenancy migration...');
      if (DRY_RUN) {
        log.warning('Running in DRY RUN mode - no changes will be made');
      }
      
      if (ROLLBACK_DATE) {
        log.warning(`Rollback limited to changes made on or after: ${ROLLBACK_DATE}`);
      }
      
      // Ask for confirmation unless in dry run
      if (!DRY_RUN) {
        console.log('\n⚠️  WARNING: This will remove organization associations from your data ⚠️');
        console.log('This operation cannot be undone. You will need to run the migration script again.');
        console.log('\nPress Ctrl+C now to cancel or wait 10 seconds to continue...');
        
        // Wait for 10 seconds before proceeding
        await new Promise(resolve => setTimeout(resolve, 10000));
        console.log('\nProceeding with rollback...\n');
      }
      
      // Roll back each collection
      for (const modelInfo of MODELS_TO_ROLLBACK) {
        await this.rollbackCollection(modelInfo);
      }
      
      // Roll back user associations
      await this.rollbackUsers();
      
      // Clean up organizational data
      await this.cleanupOrganizationalData();
      
      log.success('Rollback completed successfully!');
      
    } catch (err) {
      log.error(`Rollback failed: ${err.message}`);
    } finally {
      // Close MongoDB connection
      await mongoose.connection.close();
      log.info('MongoDB connection closed');
    }
  }
};

// Run the rollback
rollback.run();