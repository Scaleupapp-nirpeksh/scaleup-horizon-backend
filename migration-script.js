// migration-script.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
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
const DEFAULT_ORG_NAME = 'Default Organization';
const DRY_RUN = process.env.DRY_RUN === 'true' || false; // Set to true to check counts without updating

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

// Migration Steps
const migration = {
  // Step 1: Create default organization
  async createDefaultOrganization() {
    log.info('Creating default organization...');
    
    // Find the first user to set as organization owner
    const firstUser = await HorizonUser.findOne().sort({ createdAt: 1 });
    
    if (!firstUser) {
      log.error('No users found in the database. Cannot create default organization.');
      return null;
    }
    
    // Check if a default organization already exists
    let defaultOrg = await Organization.findOne({ name: DEFAULT_ORG_NAME });
    
    if (defaultOrg) {
      log.warning(`Default organization "${DEFAULT_ORG_NAME}" already exists.`);
      return defaultOrg;
    }
    
    if (DRY_RUN) {
      log.info('[DRY RUN] Would create default organization');
      return { _id: 'dry-run-org-id', owner: firstUser._id };
    }
    
    // Create default organization
    defaultOrg = new Organization({
      name: DEFAULT_ORG_NAME,
      owner: firstUser._id,
      industry: 'Technology',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      settings: {
        dateFormat: 'YYYY-MM-DD',
        financialYearStartMonth: 4,
        financialYearStartDay: 1
      },
      isArchived: false
    });
    
    await defaultOrg.save();
    log.success(`Created default organization: "${DEFAULT_ORG_NAME}"`);
    return defaultOrg;
  },
  
  // Step 2: Update user records to link with the default organization
  async updateUsers(defaultOrg) {
    log.info('Updating user records...');
    
    const users = await HorizonUser.find({});
    log.stats(`Found ${users.length} users to update`);
    
    if (DRY_RUN) {
      log.info('[DRY RUN] Would update user organizations');
      return;
    }
    
    let updatedCount = 0;
    
    for (const user of users) {
      // Update only if not already set
      if (!user.defaultOrganization || !user.activeOrganization) {
        user.defaultOrganization = defaultOrg._id;
        user.activeOrganization = defaultOrg._id;
        await user.save();
        updatedCount++;
      }
      
      // Create membership if it doesn't exist
      const existingMembership = await Membership.findOne({
        user: user._id,
        organization: defaultOrg._id
      });
      
      if (!existingMembership) {
        const membership = new Membership({
          user: user._id,
          organization: defaultOrg._id,
          role: user._id.equals(defaultOrg.owner) ? 'owner' : 'member',
          status: 'active',
          invitedBy: defaultOrg.owner
        });
        
        await membership.save();
        log.info(`Created membership for user: ${user.name || user.email}`);
      }
    }
    
    log.success(`Updated ${updatedCount} users with default organization`);
  },
  
  // Step 3: Migrate all other collections to include organization reference
  async migrateCollection(Model, defaultOrg, options = {}) {
    const modelName = Model.modelName;
    log.info(`Migrating ${modelName} collection...`);
    
    // Find all documents without organization field
    const query = { organization: { $exists: false } };
    const documents = await Model.find(query);
    
    log.stats(`Found ${documents.length} ${modelName} documents to migrate`);
    
    if (documents.length === 0) {
      log.success(`No ${modelName} documents need migration`);
      return;
    }
    
    if (DRY_RUN) {
      log.info(`[DRY RUN] Would update ${documents.length} ${modelName} documents`);
      return;
    }
    
    let updatedCount = 0;
    const errors = [];
    
    for (const doc of documents) {
      try {
        // Determine organization based on creator if available
        let orgId = defaultOrg._id;
        
        if (doc.createdBy && options.useCreatedBy) {
          const creator = await HorizonUser.findById(doc.createdBy);
          if (creator && creator.defaultOrganization) {
            orgId = creator.defaultOrganization;
          }
        }
        
        // Update document with organization ID
        doc.organization = orgId;
        
        // Add user reference if required and missing
        if (options.requiresUser && !doc.user) {
          if (doc.createdBy) {
            doc.user = doc.createdBy;
          } else if (doc.enteredBy) {
            doc.user = doc.enteredBy;
          } else if (doc.uploadedBy) {
            doc.user = doc.uploadedBy;
          } else if (doc.addedBy) {
            doc.user = doc.addedBy;
          } else {
            // Fall back to organization owner
            doc.user = defaultOrg.owner;
          }
        }
        
        // Apply any model-specific transformations
        if (options.transform) {
          options.transform(doc, defaultOrg);
        }
        
        await doc.save();
        updatedCount++;
      } catch (err) {
        errors.push({
          id: doc._id,
          error: err.message
        });
        log.error(`Error updating ${modelName} ${doc._id}: ${err.message}`);
      }
    }
    
    log.success(`Updated ${updatedCount} ${modelName} documents`);
    
    if (errors.length > 0) {
      log.warning(`Failed to update ${errors.length} ${modelName} documents`);
    }
  },
  
  // Run the full migration
  async run() {
    try {
      await connectDB();
      
      log.info('Starting migration to multi-tenancy model...');
      if (DRY_RUN) {
        log.warning('Running in DRY RUN mode - no changes will be saved');
      }
      
      // Step 1: Create default organization
      const defaultOrg = await this.createDefaultOrganization();
      if (!defaultOrg) {
        log.error('Could not create or find default organization. Aborting migration.');
        return;
      }
      
      // Step 2: Update users
      await this.updateUsers(defaultOrg);
      
      // Step 3: Migrate all collections
      // Common configuration for collections that have createdBy
      const standardOpts = { useCreatedBy: true };
      
      // Migrate collections with createdBy field
      await this.migrateCollection(CashFlowForecast, defaultOrg, standardOpts);
      await this.migrateCollection(CustomKPI, defaultOrg, standardOpts);
      await this.migrateCollection(ESOPGrant, defaultOrg, standardOpts);
      await this.migrateCollection(FundraisingPrediction, defaultOrg, standardOpts);
      await this.migrateCollection(InvestorMeeting, defaultOrg, standardOpts);
      await this.migrateCollection(InvestorReport, defaultOrg, standardOpts);
      await this.migrateCollection(ProductMilestone, defaultOrg, standardOpts);
      await this.migrateCollection(RecurringTransaction, defaultOrg, standardOpts);
      await this.migrateCollection(RevenueCohort, defaultOrg, standardOpts);
      await this.migrateCollection(RunwayScenario, defaultOrg, standardOpts);
      await this.migrateCollection(Budget, defaultOrg, standardOpts);
      
      // Collections with special fields for user reference
      await this.migrateCollection(Document, defaultOrg, { 
        useCreatedBy: false,
        transform: (doc) => {
          if (!doc.uploadedBy) {
            doc.uploadedBy = defaultOrg.owner;
          }
        }
      });
      
      await this.migrateCollection(Expense, defaultOrg, { 
        requiresUser: true 
      });
      
      await this.migrateCollection(Revenue, defaultOrg, { 
        requiresUser: true 
      });
      
      await this.migrateCollection(BankAccount, defaultOrg, { 
        requiresUser: true 
      });
      
      await this.migrateCollection(CapTableEntry, defaultOrg, { 
        requiresUser: true 
      });
      
      await this.migrateCollection(Headcount, defaultOrg, standardOpts);
      
      await this.migrateCollection(Investor, defaultOrg, { 
        transform: (doc) => {
          if (!doc.addedBy) {
            doc.addedBy = defaultOrg.owner;
          }
        }
      });
      
      await this.migrateCollection(ManualKpiSnapshot, defaultOrg, {
        transform: (doc) => {
          if (!doc.enteredBy) {
            doc.enteredBy = defaultOrg.owner;
          }
        }
      });
      
      await this.migrateCollection(Round, defaultOrg, {
        transform: (doc) => {
          if (!doc.createdBy) {
            doc.createdBy = defaultOrg.owner;
          }
        }
      });
      
      log.success('Migration completed successfully!');
      
    } catch (err) {
      log.error(`Migration failed: ${err.message}`);
    } finally {
      // Close MongoDB connection
      await mongoose.connection.close();
      log.info('MongoDB connection closed');
    }
  }
};

// Run the migration
migration.run();