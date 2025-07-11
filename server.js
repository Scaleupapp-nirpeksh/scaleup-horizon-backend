// server.js - Updated with all new features
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const connectDB = require('./config/db');

// Import existing routes
const authRoutes = require('./routes/authRoutes');
const organizationRoutes = require('./routes/organizationRoutes'); // Add this line

const fundraisingRoutes = require('./routes/fundraisingRoutes');
const financialRoutes = require('./routes/financialRoutes');
const kpiRoutes = require('./routes/kpiRoutes'); 
const advancedFeaturesRoutes = require('./routes/advancedFeaturesRoutes');
const predictiveAnalyticsRoutes = require('./routes/predictiveAnalyticsRoutes');
const investorReportRoutes = require('./routes/investorReportRoutes');
const taskRoutes = require('./routes/taskRoutes');
// Import new enhanced routes
const enhancedRoutes = require('./routes/enhancedRoutes');
const headcountRoutes = require('./routes/headcountRoutes');
const productMilestoneRoutes = require('./routes/productMilestoneRoutes');
const investorMeetingRoutes = require('./routes/investorMeetingRoutes');
// Import services for initialization
const { getRecurringTransactionService } = require('./services/recurringTransactionService');
const { getAdvancedMLService } = require('./services/advancedMLService');
const { getTransactionCategorizer } = require('./services/transactionCategorizer');

const app = express();
const PORT = process.env.HORIZON_PORT || 5001;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Database Connection
connectDB();

// API Routes
app.use('/api/horizon/auth', authRoutes);
app.use('/api/horizon/fundraising', fundraisingRoutes);
app.use('/api/horizon/financials', financialRoutes);
app.use('/api/horizon/kpis', kpiRoutes);
app.use('/api/horizon/advanced', advancedFeaturesRoutes);
app.use('/api/horizon/analytics', predictiveAnalyticsRoutes);
app.use('/api/horizon/investor-reports', investorReportRoutes);
app.use('/api/horizon/headcount', headcountRoutes);
app.use('/api/horizon/product-milestones', productMilestoneRoutes);
app.use('/api/horizon/investor-meetings', investorMeetingRoutes);
app.use('/api/horizon/organizations', organizationRoutes);
app.use('/api/horizon/tasks', taskRoutes); 

// New enhanced features routes
app.use('/api/horizon/enhanced', enhancedRoutes);

// Health check endpoint
app.get('/api/horizon/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        features: {
            mlCategorization: true,
            bankaSync: true,
            customKPIs: true,
            recurringTransactions: true,
            autoReports: true,
            advancedML: true
        }
    });
});

// Test Route
app.get('/api/horizon', (req, res) => {
    res.send('ScaleUp Horizon Backend v2.0 - Enhanced with ML & Automation!');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(err.status || 500).json({
        msg: err.message || 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ msg: 'Route not found' });
});

// Initialize services and start server
async function startServer() {
    try {
        // Initialize ML services
        console.log('Initializing ML services...');
        const mlService = await getAdvancedMLService();
        await mlService.initialize();
        console.log('ML services initialized successfully');

        // Initialize transaction categorizer
        console.log('Initializing transaction categorizer...');
        const categorizer = await getTransactionCategorizer();
        console.log('Transaction categorizer initialized successfully');

        // Initialize recurring transaction service (starts cron jobs)
        console.log('Initializing recurring transaction service...');
        const recurringService = await getRecurringTransactionService();
        console.log('Recurring transaction service initialized successfully');

        
        // Additional cron jobs
        setupCronJobs();

        // Start server
        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║     ScaleUp Horizon v2.0 Server Running! 🚀        ║
║                                                    ║
║     Port: ${PORT}                                    ║
║     Environment: ${process.env.NODE_ENV || 'development'}              ║
║                                                    ║
║                    ║
║                                                    ║
╚════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Setup additional cron jobs
function setupCronJobs() {
    // Daily KPI calculation (every day at 1 AM)
    cron.schedule('0 1 * * *', async () => {
        console.log('Running daily KPI calculations...');
        try {
            const CustomKPIService = require('./services/customKpiService').CustomKPIService;
            const CustomKPI = require('./services/customKpiService').CustomKPI;
            
            const kpiService = new CustomKPIService();
            const activeKPIs = await CustomKPI.find({ isActive: true });
            
            for (const kpi of activeKPIs) {
                try {
                    await kpiService.calculateKPIValue(kpi._id);
                } catch (error) {
                    console.error(`Failed to calculate KPI ${kpi.name}:`, error);
                }
            }
            
            console.log('Daily KPI calculations completed');
        } catch (error) {
            console.error('Error in daily KPI calculation:', error);
        }
    });

    // Weekly ML model training (every Sunday at 2 AM)
    cron.schedule('0 2 * * 0', async () => {
        console.log('Running weekly ML model training...');
        try {
            const mlService = await getAdvancedMLService();
            
            // Get all users (in production, you'd iterate through active users)
            const User = mongoose.model('HorizonUser');
            const users = await User.find({ isActive: true });
            
            for (const user of users) {
                try {
                    await mlService.trainExpensePredictor(user._id);
                    console.log(`Trained expense predictor for user ${user.email}`);
                } catch (error) {
                    console.error(`Failed to train model for user ${user.email}:`, error);
                }
            }
            
            console.log('Weekly ML model training completed');
        } catch (error) {
            console.error('Error in ML model training:', error);
        }
    });

    // Monthly report generation (first day of month at 9 AM)
    cron.schedule('0 9 1 * *', async () => {
        console.log('Running monthly report generation...');
        try {
            const ReportTemplate = require('./services/reportGeneratorService').ReportTemplate;
            const reportService = new ReportGeneratorService();
            
            const monthlyTemplates = await ReportTemplate.find({
                'schedule.frequency': 'monthly',
                isActive: true
            });
            
            for (const template of monthlyTemplates) {
                try {
                    await reportService.generateReport(template._id, template.createdBy);
                    console.log(`Generated monthly report: ${template.name}`);
                } catch (error) {
                    console.error(`Failed to generate report ${template.name}:`, error);
                }
            }
            
            console.log('Monthly report generation completed');
        } catch (error) {
            console.error('Error in monthly report generation:', error);
        }
    });

    // Anomaly detection (every 6 hours)
    cron.schedule('0 */6 * * *', async () => {
        console.log('Running anomaly detection...');
        try {
            const mlService = await getAdvancedMLService();
            const Expense = mongoose.model('Expense');
            const Revenue = mongoose.model('Revenue');
            
            // Get recent transactions
            const recentExpenses = await Expense.find({
                date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            });
            
            const recentRevenues = await Revenue.find({
                date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            });
            
            if (recentExpenses.length > 0) {
                const expenseAnomalies = await mlService.detectAnomalies(recentExpenses, 'expense');
                if (expenseAnomalies.length > 0) {
                    console.log(`Detected ${expenseAnomalies.length} expense anomalies`);
                    // In production, send notifications
                }
            }
            
            if (recentRevenues.length > 0) {
                const revenueAnomalies = await mlService.detectAnomalies(recentRevenues, 'revenue');
                if (revenueAnomalies.length > 0) {
                    console.log(`Detected ${revenueAnomalies.length} revenue anomalies`);
                    // In production, send notifications
                }
            }
            
            console.log('Anomaly detection completed');
        } catch (error) {
            console.error('Error in anomaly detection:', error);
        }
    });

    // Task reminder notifications (every day at 8 AM)
    cron.schedule('0 8 * * *', async () => {
        console.log('Running daily task reminder check...');
        try {
            const Task = require('./models/taskModel');
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(23, 59, 59, 999);
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Find tasks due today or tomorrow
            const upcomingTasks = await Task.find({
                dueDate: {
                    $gte: today,
                    $lte: tomorrow
                },
                status: { $nin: ['completed', 'cancelled'] },
                assignee: { $exists: true, $ne: null }
            }).populate('assignee', 'email name')
              .populate('organization', 'name');
            
            // In production, you would send email notifications here
            console.log(`Found ${upcomingTasks.length} tasks with upcoming due dates`);
            
            // Group by assignee for batch notifications
            const tasksByAssignee = {};
            upcomingTasks.forEach(task => {
                const assigneeId = task.assignee._id.toString();
                if (!tasksByAssignee[assigneeId]) {
                    tasksByAssignee[assigneeId] = {
                        assignee: task.assignee,
                        tasks: []
                    };
                }
                tasksByAssignee[assigneeId].tasks.push(task);
            });
            
            // Send notifications (implement your notification service)
            for (const assigneeId in tasksByAssignee) {
                const { assignee, tasks } = tasksByAssignee[assigneeId];
                console.log(`Reminder: ${assignee.name} has ${tasks.length} upcoming tasks`);
                // await notificationService.sendTaskReminder(assignee, tasks);
            }
            
            console.log('Daily task reminder check completed');
        } catch (error) {
            console.error('Error in task reminder check:', error);
        }
    });

    console.log('Cron jobs configured successfully');
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    app.close(() => {
        console.log('HTTP server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});

// Start the server
startServer();