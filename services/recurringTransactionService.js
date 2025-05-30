// services/recurringTransactionService.js
const moment = require('moment-business-days');
const cron = require('node-cron');
const mongoose = require('mongoose');

// We'll need to ensure models have organization field
const Expense = require('../models/expenseModel');
const Revenue = require('../models/revenueModel');
const RecurringTransaction = require('../models/recurringTransactionModel');


class RecurringTransactionService {
    constructor() {
        this.cronJobs = new Map();
        this.initializeCronJobs();
    }

    initializeCronJobs() {
        // Run every day at 00:30 to process recurring transactions for ALL organizations
        this.cronJobs.set('daily-processor', cron.schedule('30 0 * * *', async () => {
            console.log('Processing recurring transactions for all organizations...');
            await this.processAllDueTransactionsForAllOrganizations();
        }));

        // Run every hour to send notifications for ALL organizations
        this.cronJobs.set('notification-sender', cron.schedule('0 * * * *', async () => {
            console.log('Sending recurring transaction notifications for all organizations...');
            await this.sendDueNotificationsForAllOrganizations();
        }));
    }

    // Create a new recurring transaction - NOW WITH ORGANIZATION
    async createRecurringTransaction(data, userId, organizationId) {
        try {
            // Calculate next due date based on start date and frequency
            const nextDueDate = this.calculateNextDueDate(
                data.startDate,
                data.frequency,
                data.customFrequency,
                data
            );

            const recurring = new RecurringTransaction({
                ...data,
                organization: organizationId,
                nextDueDate,
                createdBy: userId,
                lastModifiedBy: userId
            });

            await recurring.save();

            // If daysInAdvance > 0 and the transaction is due soon, create it
            if (data.autoCreate && data.daysInAdvance > 0) {
                const dueThreshold = moment().add(data.daysInAdvance, 'days');
                if (moment(nextDueDate).isSameOrBefore(dueThreshold)) {
                    await this.createTransactionFromRecurring(recurring);
                }
            }

            return recurring;
        } catch (error) {
            throw error;
        }
    }

    // Calculate next due date (no changes needed - pure date calculation)
    calculateNextDueDate(fromDate, frequency, customFrequency, scheduleData) {
        let nextDate = moment(fromDate);
        
        switch (frequency) {
            case 'daily':
                nextDate.add(1, 'day');
                break;
                
            case 'weekly':
                if (scheduleData.dayOfWeek !== undefined) {
                    nextDate = nextDate.day(scheduleData.dayOfWeek);
                    if (nextDate.isSameOrBefore(fromDate)) {
                        nextDate.add(1, 'week');
                    }
                } else {
                    nextDate.add(1, 'week');
                }
                break;
                
            case 'biweekly':
                nextDate.add(2, 'weeks');
                if (scheduleData.dayOfWeek !== undefined) {
                    nextDate = nextDate.day(scheduleData.dayOfWeek);
                }
                break;
                
            case 'monthly':
                if (scheduleData.dayOfMonth) {
                    nextDate = nextDate.date(scheduleData.dayOfMonth);
                    if (nextDate.isSameOrBefore(fromDate)) {
                        nextDate.add(1, 'month').date(scheduleData.dayOfMonth);
                    }
                    // Handle months with fewer days
                    if (nextDate.date() !== scheduleData.dayOfMonth) {
                        nextDate = nextDate.endOf('month');
                    }
                } else if (scheduleData.weekOfMonth && scheduleData.dayOfWeek !== undefined) {
                    // e.g., 2nd Tuesday of month
                    nextDate = this.getNthWeekdayOfMonth(
                        nextDate,
                        scheduleData.weekOfMonth,
                        scheduleData.dayOfWeek
                    );
                    if (nextDate.isSameOrBefore(fromDate)) {
                        nextDate = this.getNthWeekdayOfMonth(
                            moment(fromDate).add(1, 'month'),
                            scheduleData.weekOfMonth,
                            scheduleData.dayOfWeek
                        );
                    }
                } else {
                    nextDate.add(1, 'month');
                }
                break;
                
            case 'quarterly':
                nextDate.add(3, 'months');
                if (scheduleData.dayOfMonth) {
                    nextDate = nextDate.date(scheduleData.dayOfMonth);
                    // Handle months with fewer days
                    if (nextDate.date() !== scheduleData.dayOfMonth) {
                        nextDate = nextDate.endOf('month');
                    }
                }
                break;
                
            case 'annually':
                nextDate.add(1, 'year');
                if (scheduleData.monthOfYear && scheduleData.dayOfMonth) {
                    nextDate = nextDate.month(scheduleData.monthOfYear - 1).date(scheduleData.dayOfMonth);
                }
                break;
                
            case 'custom':
                if (customFrequency) {
                    nextDate.add(customFrequency.interval, customFrequency.unit);
                }
                break;
        }

        // Apply business day adjustment if needed
        if (scheduleData.adjustmentRule !== 'exact') {
            nextDate = this.adjustForBusinessDay(nextDate, scheduleData.adjustmentRule);
        }

        return nextDate.toDate();
    }

    // Get Nth weekday of month (no changes needed)
    getNthWeekdayOfMonth(date, weekNumber, dayOfWeek) {
        const firstDay = moment(date).startOf('month');
        let targetDay = firstDay.day(dayOfWeek);
        
        if (targetDay.date() > 7) {
            targetDay.add(7, 'days');
        }
        
        targetDay.add((weekNumber - 1) * 7, 'days');
        
        // If we've gone past the month, get the last occurrence
        if (targetDay.month() !== firstDay.month()) {
            targetDay.subtract(7, 'days');
        }
        
        return targetDay;
    }

    // Adjust for business days (no changes needed)
    adjustForBusinessDay(date, rule) {
        moment.updateLocale('en', {
            workingWeekdays: [1, 2, 3, 4, 5] // Monday to Friday
        });

        if (!date.isBusinessDay()) {
            switch (rule) {
                case 'next_business_day':
                    return date.nextBusinessDay();
                case 'previous_business_day':
                    return date.prevBusinessDay();
                case 'closest_business_day':
                    const next = date.clone().nextBusinessDay();
                    const prev = date.clone().prevBusinessDay();
                    const diffNext = next.diff(date, 'days');
                    const diffPrev = date.diff(prev, 'days');
                    return diffNext <= diffPrev ? next : prev;
            }
        }
        
        return date;
    }

    // Process all due transactions FOR ALL ORGANIZATIONS
    async processAllDueTransactionsForAllOrganizations() {
        try {
            // Get all active organizations
            const Organization = mongoose.model('Organization');
            const activeOrganizations = await Organization.find({ isActive: true });
            
            let totalProcessed = 0;
            
            for (const org of activeOrganizations) {
                try {
                    const result = await this.processAllDueTransactions(org._id);
                    totalProcessed += result.processed;
                } catch (error) {
                    console.error(`Error processing recurring transactions for organization ${org._id}:`, error);
                }
            }
            
            console.log(`Processed ${totalProcessed} recurring transactions across all organizations`);
            
            return {
                processed: totalProcessed,
                success: true
            };
        } catch (error) {
            console.error('Error in processAllDueTransactionsForAllOrganizations:', error);
            throw error;
        }
    }

    // Process all due transactions FOR A SPECIFIC ORGANIZATION
    async processAllDueTransactions(organizationId) {
        try {
            const today = moment().endOf('day').toDate();
            
            const dueTransactions = await RecurringTransaction.find({
                organization: organizationId,
                isActive: true,
                isPaused: false,
                nextDueDate: { $lte: today },
                $or: [
                    { endDate: null },
                    { endDate: { $gte: today } }
                ]
            });

            console.log(`Found ${dueTransactions.length} due recurring transactions for organization ${organizationId}`);

            for (const recurring of dueTransactions) {
                try {
                    await this.processRecurringTransaction(recurring);
                } catch (error) {
                    console.error(`Error processing recurring transaction ${recurring._id}:`, error);
                    recurring.missedOccurrences++;
                    await recurring.save();
                }
            }

            return {
                processed: dueTransactions.length,
                success: true
            };
        } catch (error) {
            console.error('Error in processAllDueTransactions:', error);
            throw error;
        }
    }

    // Process a single recurring transaction (minimal changes)
    async processRecurringTransaction(recurring) {
        try {
            // Check if we should create the transaction
            const shouldCreate = recurring.autoCreate && !recurring.requiresApproval;
            const needsApproval = recurring.requiresApproval || 
                (recurring.approvalThreshold && recurring.amount > recurring.approvalThreshold);

            if (shouldCreate && !needsApproval) {
                // Create the transaction
                await this.createTransactionFromRecurring(recurring);
            } else {
                // Add to approval queue
                console.log(`Recurring transaction ${recurring.name} requires approval`);
                // In production, this would create a notification/task for approval
            }

            // Update recurring transaction
            recurring.lastProcessedDate = new Date();
            recurring.totalOccurrences++;
            
            // Calculate next due date
            recurring.nextDueDate = this.calculateNextDueDate(
                recurring.nextDueDate,
                recurring.frequency,
                recurring.customFrequency,
                recurring
            );

            // Check if we've reached the end date
            if (recurring.endDate && moment(recurring.nextDueDate).isAfter(recurring.endDate)) {
                recurring.isActive = false;
                console.log(`Recurring transaction ${recurring.name} has reached its end date`);
            }

            await recurring.save();
        } catch (error) {
            throw error;
        }
    }

    // Create actual transaction from recurring - UPDATED WITH ORGANIZATION
    async createTransactionFromRecurring(recurring) {
        try {
            // Calculate actual amount (handle variable amounts)
            let amount = recurring.amount;
            
            if (recurring.isVariableAmount && recurring.amountVariation) {
                if (recurring.amountVariation.type === 'percentage') {
                    const variation = recurring.amountVariation.value / 100;
                    const randomVariation = (Math.random() * 2 - 1) * variation; // -variation to +variation
                    amount = amount * (1 + randomVariation);
                } else if (recurring.amountVariation.type === 'range') {
                    amount = Math.random() * 
                        (recurring.amountVariation.max - recurring.amountVariation.min) + 
                        recurring.amountVariation.min;
                }
            }

            let transaction;
            
            if (recurring.type === 'expense') {
                transaction = new Expense({
                    organization: recurring.organization, // ADD ORGANIZATION
                    date: new Date(),
                    amount: Math.round(amount * 100) / 100, // Round to 2 decimal places
                    category: recurring.category,
                    vendor: recurring.vendor,
                    description: recurring.description || `${recurring.name} (Recurring)`,
                    paymentMethod: recurring.paymentMethod,
                    notes: `Auto-created from recurring transaction: ${recurring.name}`,
                    recurringTransactionId: recurring._id,
                    createdBy: recurring.createdBy // Maintain who created the recurring transaction
                });
                
                await transaction.save();
            } else if (recurring.type === 'revenue') {
                transaction = new Revenue({
                    organization: recurring.organization, // ADD ORGANIZATION
                    date: new Date(),
                    amount: Math.round(amount * 100) / 100,
                    source: recurring.source || recurring.category,
                    description: recurring.description || `${recurring.name} (Recurring)`,
                    status: 'Received',
                    notes: `Auto-created from recurring transaction: ${recurring.name}`,
                    recurringTransactionId: recurring._id,
                    createdBy: recurring.createdBy // Maintain who created the recurring transaction
                });
                
                await transaction.save();
            }

            // Record the created transaction
            recurring.createdTransactions.push({
                transactionId: transaction._id,
                transactionType: recurring.type === 'expense' ? 'Expense' : 'Revenue',
                date: new Date(),
                amount: transaction.amount,
                status: 'created'
            });

            // Keep only last 100 transaction records
            if (recurring.createdTransactions.length > 100) {
                recurring.createdTransactions = recurring.createdTransactions.slice(-100);
            }

            console.log(`Created ${recurring.type} transaction for ${recurring.name}: ₹${transaction.amount}`);
            
            return transaction;
        } catch (error) {
            throw error;
        }
    }

    // Send due notifications FOR ALL ORGANIZATIONS
    async sendDueNotificationsForAllOrganizations() {
        try {
            // Get all active organizations
            const Organization = mongoose.model('Organization');
            const activeOrganizations = await Organization.find({ isActive: true });
            
            for (const org of activeOrganizations) {
                try {
                    await this.sendDueNotifications(org._id);
                } catch (error) {
                    console.error(`Error sending notifications for organization ${org._id}:`, error);
                }
            }
        } catch (error) {
            console.error('Error in sendDueNotificationsForAllOrganizations:', error);
        }
    }

    // Send due notifications FOR A SPECIFIC ORGANIZATION
    async sendDueNotifications(organizationId) {
        try {
            const notificationThreshold = moment().add(3, 'days').toDate();
            
            const upcomingTransactions = await RecurringTransaction.find({
                organization: organizationId,
                isActive: true,
                isPaused: false,
                'notifications.enabled': true,
                nextDueDate: { $lte: notificationThreshold },
                $or: [
                    { 'notifications.notificationsSent.date': { $ne: moment().format('YYYY-MM-DD') } },
                    { 'notifications.notificationsSent': { $size: 0 } }
                ]
            });

            for (const recurring of upcomingTransactions) {
                const daysUntilDue = moment(recurring.nextDueDate).diff(moment(), 'days');
                
                if (daysUntilDue <= recurring.notifications.daysBefore) {
                    // Send notification
                    console.log(`Notification: ${recurring.name} is due in ${daysUntilDue} days`);
                    
                    // In production, this would send email/push notification to relevant users in the organization
                    // You might want to notify all admins or specific roles
                    
                    // Record notification sent
                    recurring.notifications.notificationsSent.push({
                        date: new Date(),
                        type: 'due_reminder'
                    });
                    
                    // Keep only last 10 notifications
                    if (recurring.notifications.notificationsSent.length > 10) {
                        recurring.notifications.notificationsSent = 
                            recurring.notifications.notificationsSent.slice(-10);
                    }
                    
                    await recurring.save();
                }
            }
        } catch (error) {
            console.error('Error sending notifications:', error);
        }
    }

    // Get upcoming transactions - NOW FOR ORGANIZATION
    async getUpcomingTransactions(organizationId, days = 30) {
        const endDate = moment().add(days, 'days').toDate();
        
        const upcoming = await RecurringTransaction.find({
            organization: organizationId,
            isActive: true,
            isPaused: false,
            nextDueDate: { $lte: endDate }
        }).sort({ nextDueDate: 1 });

        // Calculate what the transactions will look like
        const projectedTransactions = upcoming.map(recurring => ({
            recurringId: recurring._id,
            name: recurring.name,
            type: recurring.type,
            amount: recurring.amount,
            category: recurring.category,
            dueDate: recurring.nextDueDate,
            frequency: recurring.frequency,
            isVariable: recurring.isVariableAmount,
            requiresApproval: recurring.requiresApproval || 
                (recurring.approvalThreshold && recurring.amount > recurring.approvalThreshold)
        }));

        // Group by date
        const byDate = {};
        projectedTransactions.forEach(tx => {
            const dateKey = moment(tx.dueDate).format('YYYY-MM-DD');
            if (!byDate[dateKey]) {
                byDate[dateKey] = {
                    date: dateKey,
                    transactions: [],
                    totalExpenses: 0,
                    totalRevenue: 0
                };
            }
            
            byDate[dateKey].transactions.push(tx);
            if (tx.type === 'expense') {
                byDate[dateKey].totalExpenses += tx.amount;
            } else {
                byDate[dateKey].totalRevenue += tx.amount;
            }
        });

        return {
            upcoming: Object.values(byDate).sort((a, b) => 
                moment(a.date).diff(moment(b.date))
            ),
            summary: {
                totalUpcoming: projectedTransactions.length,
                totalExpenses: projectedTransactions
                    .filter(tx => tx.type === 'expense')
                    .reduce((sum, tx) => sum + tx.amount, 0),
                totalRevenue: projectedTransactions
                    .filter(tx => tx.type === 'revenue')
                    .reduce((sum, tx) => sum + tx.amount, 0),
                requiresApproval: projectedTransactions
                    .filter(tx => tx.requiresApproval).length
            }
        };
    }

    // Pause/Resume recurring transaction - UPDATED WITH ORGANIZATION CHECK
    async pauseRecurringTransaction(id, userId, organizationId) {
        const recurring = await RecurringTransaction.findOne({
            _id: id,
            organization: organizationId
        });
        
        if (!recurring) {
            throw new Error('Recurring transaction not found or unauthorized');
        }
        
        recurring.isPaused = true;
        recurring.lastModifiedBy = userId;
        await recurring.save();
        
        return recurring;
    }

    async resumeRecurringTransaction(id, userId, organizationId) {
        const recurring = await RecurringTransaction.findOne({
            _id: id,
            organization: organizationId
        });
        
        if (!recurring) {
            throw new Error('Recurring transaction not found or unauthorized');
        }
        
        recurring.isPaused = false;
        recurring.lastModifiedBy = userId;
        
        // Recalculate next due date from today if it's in the past
        if (moment(recurring.nextDueDate).isBefore(moment())) {
            recurring.nextDueDate = this.calculateNextDueDate(
                new Date(),
                recurring.frequency,
                recurring.customFrequency,
                recurring
            );
        }
        
        await recurring.save();
        
        return recurring;
    }

    // Get recurring transactions summary - NOW FOR ORGANIZATION
    async getRecurringSummary(organizationId) {
        const allRecurring = await RecurringTransaction.find({
            organization: organizationId,
            isActive: true
        });

        const summary = {
            total: allRecurring.length,
            active: allRecurring.filter(r => !r.isPaused).length,
            paused: allRecurring.filter(r => r.isPaused).length,
            byType: {
                expense: allRecurring.filter(r => r.type === 'expense').length,
                revenue: allRecurring.filter(r => r.type === 'revenue').length
            },
            monthlyImpact: {
                expenses: 0,
                revenue: 0
            },
            byCategory: {},
            upcomingThisWeek: 0
        };

        const weekEnd = moment().endOf('week').toDate();

        allRecurring.forEach(recurring => {
            // Calculate monthly impact
            let monthlyAmount = 0;
            switch (recurring.frequency) {
                case 'daily':
                    monthlyAmount = recurring.amount * 30;
                    break;
                case 'weekly':
                    monthlyAmount = recurring.amount * 4.33;
                    break;
                case 'biweekly':
                    monthlyAmount = recurring.amount * 2.17;
                    break;
                case 'monthly':
                    monthlyAmount = recurring.amount;
                    break;
                case 'quarterly':
                    monthlyAmount = recurring.amount / 3;
                    break;
                case 'annually':
                    monthlyAmount = recurring.amount / 12;
                    break;
            }

            if (recurring.type === 'expense') {
                summary.monthlyImpact.expenses += monthlyAmount;
            } else {
                summary.monthlyImpact.revenue += monthlyAmount;
            }

            // By category
            if (!summary.byCategory[recurring.category]) {
                summary.byCategory[recurring.category] = {
                    count: 0,
                    monthlyAmount: 0
                };
            }
            summary.byCategory[recurring.category].count++;
            summary.byCategory[recurring.category].monthlyAmount += monthlyAmount;

            // Upcoming this week
            if (recurring.nextDueDate <= weekEnd && !recurring.isPaused) {
                summary.upcomingThisWeek++;
            }
        });

        return summary;
    }

    // Get all recurring transactions - NEW METHOD
    async getRecurringTransactions(organizationId, options = {}) {
        const query = {
            organization: organizationId
        };

        if (options.isActive !== undefined) {
            query.isActive = options.isActive;
        }

        if (options.type) {
            query.type = options.type;
        }

        if (options.category) {
            query.category = options.category;
        }

        const recurring = await RecurringTransaction.find(query)
            .sort({ nextDueDate: 1 })
            .populate('createdBy', 'name email')
            .populate('lastModifiedBy', 'name email');

        return recurring;
    }

    // Update recurring transaction - NEW METHOD
    async updateRecurringTransaction(id, updates, userId, organizationId) {
        const recurring = await RecurringTransaction.findOne({
            _id: id,
            organization: organizationId
        });

        if (!recurring) {
            throw new Error('Recurring transaction not found or unauthorized');
        }

        // Update allowed fields
        const allowedUpdates = [
            'name', 'description', 'amount', 'category', 'vendor', 'source',
            'paymentMethod', 'tags', 'notes', 'isVariableAmount', 'amountVariation',
            'endDate', 'requiresApproval', 'approvalThreshold', 'notifications',
            'daysInAdvance', 'autoCreate'
        ];

        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                recurring[field] = updates[field];
            }
        });

        recurring.lastModifiedBy = userId;
        await recurring.save();

        return recurring;
    }

    // Delete recurring transaction - NEW METHOD
    async deleteRecurringTransaction(id, organizationId) {
        const result = await RecurringTransaction.deleteOne({
            _id: id,
            organization: organizationId
        });

        if (result.deletedCount === 0) {
            throw new Error('Recurring transaction not found or unauthorized');
        }

        return { success: true };
    }
}

// Singleton instance
let serviceInstance = null;

module.exports = {
    getRecurringTransactionService: () => {
        if (!serviceInstance) {
            serviceInstance = new RecurringTransactionService();
        }
        return serviceInstance;
    },
    RecurringTransaction
};