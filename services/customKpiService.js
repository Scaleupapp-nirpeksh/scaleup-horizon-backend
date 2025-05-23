// services/customKpiService.js
const math = require('mathjs');
const moment = require('moment');
const mongoose = require('mongoose');

// Assume CustomKPI is your Mongoose model. If it's defined elsewhere, ensure it's correctly required.
// For this example, let's assume it might be defined and used like this:
// const CustomKPI = mongoose.model('CustomKPI', new mongoose.Schema({ /* ... schema ... */ }));
// If CustomKPI is not a model but something else, the logic using it (new CustomKPI, CustomKPI.findById) needs to align.
// The error is not directly related to CustomKPI model, but it's used throughout the service.
let CustomKPI;
try {
    CustomKPI = mongoose.model('CustomKPI');
} catch (error) {
    // Define a dummy model if not already defined, to prevent further errors in this snippet
    // In a real scenario, ensure your CustomKPI model is properly defined and registered.
    const kpiSchema = new mongoose.Schema({
        name: String,
        displayName: String,
        category: String,
        formula: String,
        formulaVariables: Array,
        displayFormat: Object,
        createdBy: mongoose.Schema.Types.ObjectId,
        lastModifiedBy: mongoose.Schema.Types.ObjectId,
        cache: {
            currentValue: Number,
            previousValue: Number,
            lastCalculated: Date,
            trend: Number,
            historicalValues: Array
        },
        targets: Array,
        alerts: Array,
        isActive: { type: Boolean, default: true },
        isPinned: { type: Boolean, default: false },
        visualization: Object,
    }, { timestamps: true });
    CustomKPI = mongoose.model('CustomKPI', kpiSchema);
}


class CustomKPIService {
    constructor() {
        this.mathParser = math.parser();
        // Changed: Call the renamed method to get static KPI definitions
        this.builtInKPIs = this.getBuiltInKPIDefinitions();
    }

    // Renamed: This method now solely returns the static definitions
    getBuiltInKPIDefinitions() {
        return [
            {
                name: 'gross_margin',
                displayName: 'Gross Margin',
                category: 'Financial',
                formula: '((revenue - direct_costs) / revenue) * 100',
                formulaVariables: [
                    {
                        variable: 'revenue',
                        source: 'revenue',
                        aggregation: 'sum',
                        timeframe: 'current_month'
                    },
                    {
                        variable: 'direct_costs',
                        source: 'expense',
                        filter: {
                            field: 'category',
                            operator: 'in',
                            value: ['Tech Infrastructure', 'Software & Subscriptions']
                        },
                        aggregation: 'sum',
                        timeframe: 'current_month'
                    }
                ],
                displayFormat: { type: 'percentage', decimals: 2 }
            },
            {
                name: 'burn_rate',
                displayName: 'Monthly Burn Rate',
                category: 'Financial',
                formula: 'total_expenses / months_count',
                formulaVariables: [
                    {
                        variable: 'total_expenses',
                        source: 'expense',
                        aggregation: 'sum',
                        timeframe: 'last_90_days'
                    },
                    {
                        variable: 'months_count',
                        source: 'constant',
                        value: 3
                    }
                ],
                displayFormat: { type: 'currency', prefix: '₹', decimals: 0 }
            },
            {
                name: 'runway_months',
                displayName: 'Runway (Months)',
                category: 'Financial',
                formula: 'cash_balance / monthly_burn',
                formulaVariables: [
                    {
                        variable: 'cash_balance',
                        source: 'bank_balance',
                        aggregation: 'sum',
                        timeframe: 'latest'
                    },
                    {
                        variable: 'monthly_burn',
                        source: 'custom_metric',
                        value: 'burn_rate' // Reference to another KPI
                    }
                ],
                displayFormat: { type: 'number', decimals: 1, suffix: ' months' }
            },
            {
                name: 'revenue_growth_rate',
                displayName: 'Revenue Growth Rate',
                category: 'Growth',
                formula: '((current_revenue - previous_revenue) / previous_revenue) * 100',
                formulaVariables: [
                    {
                        variable: 'current_revenue',
                        source: 'revenue',
                        aggregation: 'sum',
                        timeframe: 'current_month'
                    },
                    {
                        variable: 'previous_revenue',
                        source: 'revenue',
                        aggregation: 'sum',
                        timeframe: 'last_month'
                    }
                ],
                displayFormat: { type: 'percentage', decimals: 2 }
            },
            {
                name: 'ltv_cac_ratio',
                displayName: 'LTV:CAC Ratio',
                category: 'Sales',
                formula: 'ltv / cac',
                formulaVariables: [
                    {
                        variable: 'ltv',
                        source: 'custom_metric',
                        value: 'average_ltv' // From cohort analysis
                    },
                    {
                        variable: 'cac',
                        source: 'expense',
                        filter: {
                            field: 'category',
                            operator: 'equals',
                            value: 'Marketing & Sales'
                        },
                        aggregation: 'sum',
                        timeframe: 'last_90_days'
                    }
                ],
                displayFormat: { type: 'ratio', decimals: 2 }
            }
        ];
    }

    // Create a new custom KPI
    async createKPI(kpiData, userId) {
        try {
            // Validate formula
            const validation = await this.validateFormula(kpiData.formula, kpiData.formulaVariables);
            if (!validation.isValid) {
                throw new Error(`Invalid formula: ${validation.error}`);
            }

            // Create KPI
            const kpi = new CustomKPI({
                ...kpiData,
                createdBy: userId,
                lastModifiedBy: userId
            });

            await kpi.save();

            // Calculate initial value
            await this.calculateKPIValue(kpi._id);

            return kpi;
        } catch (error) {
            console.error('Error in createKPI:', error.message);
            throw error;
        }
    }

    // Validate formula
    async validateFormula(formula, variables) {
        try {
            // Check if all variables in formula are defined
            const formulaVars = this.extractVariablesFromFormula(formula);
            const definedVars = variables.map(v => v.variable);
            
            const undefinedVars = formulaVars.filter(v => !definedVars.includes(v));
            if (undefinedVars.length > 0) {
                return {
                    isValid: false,
                    error: `Undefined variables: ${undefinedVars.join(', ')}`
                };
            }

            // Test formula with dummy values
            const scope = {};
            formulaVars.forEach(v => scope[v] = 1); // Assign a default non-zero value
            
            try {
                const evaluationResult = math.evaluate(formula, scope);
                if (typeof evaluationResult !== 'number' || isNaN(evaluationResult) || !isFinite(evaluationResult)) {
                     // console.warn(`Formula evaluation with dummy values resulted in: ${evaluationResult}`);
                     // Depending on strictness, this could be an error or a warning.
                     // For now, let's assume it's acceptable if math.evaluate doesn't throw.
                }
            } catch (mathError) {
                return {
                    isValid: false,
                    error: `Invalid mathematical expression: ${mathError.message}`
                };
            }

            return { isValid: true };
        } catch (error) {
            return {
                isValid: false,
                error: error.message
            };
        }
    }

    // Extract variables from formula
    extractVariablesFromFormula(formula) {
        // Improved regex to handle multi-character variable names and avoid splitting them
        // Remove numbers, operators, parentheses, commas, and known math functions
        let cleaned = formula;
        // Remove math functions like sin(x), log(y, base)
        cleaned = cleaned.replace(/\b(sin|cos|tan|log|sqrt|abs|min|max|round|floor|ceil)\b\s*\([^)]*\)/g, ' ');
        // Remove numbers (integers and decimals)
        cleaned = cleaned.replace(/\b\d+(\.\d+)?\b/g, ' ');
        // Remove operators and parentheses
        cleaned = cleaned.replace(/[\s+\-*/().,]/g, ' ');
        
        // Extract unique variable names (words)
        const variables = cleaned.split(/\s+/)
            .filter(v => v.length > 0 && isNaN(v)) // Ensure it's not a number remnant
            .filter((v, i, arr) => arr.indexOf(v) === i); // Unique
        
        return variables;
    }

    // Calculate KPI value
    async calculateKPIValue(kpiId, targetDate = new Date()) {
        try {
            const kpi = await CustomKPI.findById(kpiId);
            if (!kpi) throw new Error('KPI not found');

            // Get values for all variables
            const scope = {};
            
            for (const variable of kpi.formulaVariables) {
                try {
                    const value = await this.getVariableValue(variable, targetDate);
                    scope[variable.variable] = value;
                } catch (varError) {
                    console.error(`Error getting value for variable ${variable.variable} in KPI ${kpi.name}:`, varError.message);
                    // Decide handling: throw error, or use a default (e.g., 0 or null), or mark KPI as uncalculable
                    scope[variable.variable] = 0; // Default to 0 if a variable fetch fails
                    // Or: throw new Error(`Failed to get value for variable ${variable.variable}: ${varError.message}`);
                }
            }

            // Calculate result
            let result;
            try {
                result = math.evaluate(kpi.formula, scope);
                if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
                    console.warn(`Formula evaluation for KPI ${kpi.name} resulted in non-numeric value: ${result}. Scope:`, scope);
                    result = 0; // Default to 0 for non-numeric results (e.g. division by zero -> Infinity)
                }
            } catch (error) {
                console.error(`Formula evaluation error for KPI ${kpi.name}: ${error.message}. Scope:`, scope);
                throw new Error(`Formula evaluation failed: ${error.message}`);
            }

            // Update cache
            const previousValue = kpi.cache.currentValue; // Can be null or undefined initially
            kpi.cache.previousValue = (previousValue !== null && previousValue !== undefined) ? previousValue : null;
            kpi.cache.currentValue = result;
            kpi.cache.lastCalculated = new Date();
            
            // Calculate trend
            if (kpi.cache.previousValue !== null && kpi.cache.previousValue !== 0) {
                kpi.cache.trend = ((result - kpi.cache.previousValue) / Math.abs(kpi.cache.previousValue)) * 100;
            } else if (kpi.cache.previousValue === 0 && result !== 0) {
                kpi.cache.trend = Infinity; // Or some other indicator of change from zero
            } else {
                kpi.cache.trend = 0; // No change or previous value was null/zero
            }


            // Add to historical values
            kpi.cache.historicalValues = kpi.cache.historicalValues || [];
            kpi.cache.historicalValues.push({
                date: targetDate,
                value: result,
                target: this.getCurrentTarget(kpi, targetDate)
            });

            // Keep only last 365 days of history
            const cutoffDate = moment().subtract(365, 'days').toDate();
            kpi.cache.historicalValues = kpi.cache.historicalValues
                .filter(h => h.date > cutoffDate)
                .sort((a, b) => new Date(a.date) - new Date(b.date)); // Ensure date comparison is correct

            await kpi.save();

            // Check alerts
            await this.checkAlerts(kpi);

            return {
                kpiId: kpi._id,
                name: kpi.name,
                value: result,
                previousValue: kpi.cache.previousValue,
                trend: kpi.cache.trend,
                formattedValue: this.formatValue(result, kpi.displayFormat)
            };
        } catch (error) {
            console.error(`KPI calculation error for kpiId ${kpiId}:`, error.message);
            throw error;
        }
    }

    // Get variable value from data source
    async getVariableValue(variable, targetDate) {
        const timeRange = this.getTimeRange(variable.timeframe, variable.customTimeframe, targetDate);
        
        // Ensure Mongoose models are available. This is a common pattern if models are not globally registered or passed.
        const Revenue = mongoose.models.Revenue || mongoose.model('Revenue', new mongoose.Schema({ amount: Number, date: Date, category: String }));
        const Expense = mongoose.models.Expense || mongoose.model('Expense', new mongoose.Schema({ amount: Number, date: Date, category: String, vendor: String }));
        const BankAccount = mongoose.models.BankAccount || mongoose.model('BankAccount', new mongoose.Schema({ currentBalance: Number }));
        const ManualKpiSnapshot = mongoose.models.ManualKpiSnapshot || mongoose.model('ManualKpiSnapshot', new mongoose.Schema({ snapshotDate: Date, totalRegisteredUsers: Number }));
        const RevenueCohort = mongoose.models.RevenueCohort || mongoose.model('RevenueCohort', new mongoose.Schema({ projectedLTV: Number }));


        switch (variable.source) {
            case 'revenue':
                return await this.getRevenueValue(variable, timeRange, Revenue);
            
            case 'expense':
                return await this.getExpenseValue(variable, timeRange, Expense);
            
            case 'bank_balance':
                return await this.getBankBalanceValue(variable, BankAccount);
            
            case 'user_count':
                return await this.getUserCountValue(variable, timeRange, ManualKpiSnapshot);
            
            case 'custom_metric':
                return await this.getCustomMetricValue(variable.value, CustomKPI, RevenueCohort);
            
            case 'constant':
                return variable.value || 0;
            
            default:
                throw new Error(`Unknown variable source: ${variable.source}`);
        }
    }

    // Get revenue value
    async getRevenueValue(variable, timeRange, RevenueModel) {
        const query = {
            date: { $gte: timeRange.start, $lte: timeRange.end }
        };

        if (variable.filter) {
            this.applyFilter(query, variable.filter);
        }

        const result = await RevenueModel.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    value: { [`$${variable.aggregation}`]: '$amount' }
                }
            }
        ]);

        return result.length > 0 && result[0].value !== null ? result[0].value : 0;
    }

    // Get expense value
    async getExpenseValue(variable, timeRange, ExpenseModel) {
        const query = {
            date: { $gte: timeRange.start, $lte: timeRange.end }
        };

        if (variable.filter) {
            this.applyFilter(query, variable.filter);
        }

        const result = await ExpenseModel.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    value: { [`$${variable.aggregation}`]: '$amount' }
                }
            }
        ]);

        return result.length > 0 && result[0].value !== null ? result[0].value : 0;
    }

    // Get bank balance value
    async getBankBalanceValue(variable, BankAccountModel) {
        if (variable.aggregation === 'latest' || variable.aggregation === 'sum') {
            const accounts = await BankAccountModel.find({});
            return accounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);
        }
        
        const result = await BankAccountModel.aggregate([
            {
                $group: {
                    _id: null,
                    value: { [`$${variable.aggregation}`]: '$currentBalance' }
                }
            }
        ]);

        return result.length > 0 && result[0].value !== null ? result[0].value : 0;
    }

    // Get user count value
    async getUserCountValue(variable, timeRange, ManualKpiSnapshotModel) {
        const snapshots = await ManualKpiSnapshotModel.find({
            snapshotDate: { $gte: timeRange.start, $lte: timeRange.end }
        }).sort({ snapshotDate: -1 });

        if (snapshots.length === 0) return 0;

        switch (variable.aggregation) {
            case 'latest':
                return snapshots[0].totalRegisteredUsers || 0;
            case 'average':
                const sum = snapshots.reduce((s, snap) => s + (snap.totalRegisteredUsers || 0), 0);
                return snapshots.length > 0 ? sum / snapshots.length : 0;
            case 'max':
                return Math.max(0, ...snapshots.map(s => s.totalRegisteredUsers || 0));
            default:
                return snapshots[0].totalRegisteredUsers || 0;
        }
    }

    // Get custom metric value
    async getCustomMetricValue(metricName, CustomKPIModel, RevenueCohortModel) {
        const referencedKpi = await CustomKPIModel.findOne({ name: metricName });
        if (referencedKpi && referencedKpi.cache && referencedKpi.cache.currentValue !== null) {
            return referencedKpi.cache.currentValue;
        }

        if (metricName === 'average_ltv') {
            const cohorts = await RevenueCohortModel.find({ projectedLTV: { $gt: 0 } });
            if (cohorts.length === 0) return 0;
            const sumLTV = cohorts.reduce((sum, c) => sum + (c.projectedLTV || 0), 0);
            return cohorts.length > 0 ? sumLTV / cohorts.length : 0;
        }

        console.warn(`Custom metric ${metricName} not found or has no cached value.`);
        return 0; // Default if not found or no value
    }


    // Apply filter to query
    applyFilter(query, filter) {
        const field = filter.field;
        const operator = filter.operator;
        let value = filter.value;

        // Ensure value is appropriate for the operator
        switch (operator) {
            case 'equals':
                query[field] = value;
                break;
            case 'contains': // Case-insensitive regex search
                query[field] = { $regex: value, $options: 'i' };
                break;
            case 'in': // Value should be an array
                query[field] = { $in: Array.isArray(value) ? value : [value] };
                break;
            case 'between': // Value should be an array of two elements [min, max]
                if (Array.isArray(value) && value.length === 2) {
                    query[field] = { $gte: value[0], $lte: value[1] };
                } else {
                    console.warn(`Invalid value for 'between' operator on field ${field}:`, value);
                }
                break;
            case 'greater_than':
                query[field] = { $gt: value };
                break;
            case 'less_than':
                query[field] = { $lt: value };
                break;
            default:
                console.warn(`Unknown filter operator: ${operator}`);
        }
    }

    // Get time range
    getTimeRange(timeframe, customTimeframe, targetDate = new Date()) {
        const target = moment(targetDate).utcOffset(0, true); // Work with UTC dates to avoid timezone issues
        let start, end;

        switch (timeframe) {
            case 'current_month':
                start = target.clone().startOf('month');
                end = target.clone().endOf('month');
                break;
            case 'last_month':
                start = target.clone().subtract(1, 'month').startOf('month');
                end = target.clone().subtract(1, 'month').endOf('month');
                break;
            case 'current_quarter':
                start = target.clone().startOf('quarter');
                end = target.clone().endOf('quarter');
                break;
            case 'last_quarter':
                start = target.clone().subtract(1, 'quarter').startOf('quarter');
                end = target.clone().subtract(1, 'quarter').endOf('quarter');
                break;
            case 'current_year':
                start = target.clone().startOf('year');
                end = target.clone().endOf('year');
                break;
            case 'last_30_days':
                end = target.clone().endOf('day'); // Ensure end of today
                start = target.clone().subtract(29, 'days').startOf('day'); // 30 days including today
                break;
            case 'last_90_days':
                end = target.clone().endOf('day');
                start = target.clone().subtract(89, 'days').startOf('day');
                break;
            case 'all_time':
                start = moment('2000-01-01').utcOffset(0, true); // A reasonable earliest date
                end = target.clone().endOf('day');
                break;
            case 'custom':
                if (customTimeframe && customTimeframe.start && customTimeframe.end) {
                    start = moment(customTimeframe.start).utcOffset(0, true).startOf('day');
                    end = moment(customTimeframe.end).utcOffset(0, true).endOf('day');
                } else {
                    // Default to current month if custom is invalid
                    console.warn("Invalid custom timeframe, defaulting to current_month:", customTimeframe);
                    start = target.clone().startOf('month');
                    end = target.clone().endOf('month');
                }
                break;
            case 'latest': // Not a range, but used for single point data like bank balance
                 return { singlePoint: true, date: target.toDate() };
            default: // Default to current month
                start = target.clone().startOf('month');
                end = target.clone().endOf('month');
        }
        return { start: start.toDate(), end: end.toDate() };
    }

    // Format value for display
    formatValue(value, format) {
        if (value === null || value === undefined || (typeof value === 'number' && !isFinite(value))) {
            return 'N/A'; // Handle null, undefined, Infinity, NaN
        }


        let formatted;
        const decimals = (format && typeof format.decimals === 'number') ? format.decimals : 2; // Default decimals
        
        switch (format.type) {
            case 'percentage':
                formatted = value.toFixed(decimals) + '%';
                break;
            case 'currency':
                const prefix = (format && format.prefix) ? format.prefix : '₹';
                formatted = prefix + this.formatNumber(value, decimals) + (format.suffix || '');
                break;
            case 'ratio':
                formatted = value.toFixed(decimals) + ':1';
                break;
            default: // 'number' or unspecified
                formatted = this.formatNumber(value, decimals) + (format.suffix || '');
        }

        return formatted;
    }

    formatNumber(value, decimals = 0) {
        // Ensure value is a number before formatting
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
            return 'N/A';
        }
        
        // Indian numbering system (Lakhs, Crores)
        if (Math.abs(value) >= 10000000) { // 1 Crore
            return (value / 10000000).toFixed(Math.max(0, decimals - 1)) + 'Cr'; // Adjust decimals for abbreviation
        } else if (Math.abs(value) >= 100000) { // 1 Lakh
            return (value / 100000).toFixed(Math.max(0, decimals - 1)) + 'L';
        }
        // Standard K, M, B for international, or just plain number
        // For this example, sticking to L, Cr and then plain.
        // else if (Math.abs(value) >= 1000) {
        //     return (value / 1000).toFixed(1) + 'K';
        // }
        return value.toFixed(decimals);
    }

    // Get current target
    getCurrentTarget(kpi, date) {
        if (!kpi.targets || kpi.targets.length === 0) return null;
        
        const currentPeriodTarget = moment(date).format('YYYY-MM'); // Assuming targets are monthly
        const target = kpi.targets.find(t => t.period === currentPeriodTarget);
        
        // Fallback to a general target if monthly not found
        if (!target) {
            const generalTarget = kpi.targets.find(t => !t.period || t.period.toLowerCase() === 'general');
            return generalTarget ? generalTarget.value : null;
        }
        return target ? target.value : null;
    }

    // Check alerts
    async checkAlerts(kpi) {
        if (!kpi.alerts || kpi.alerts.length === 0) return;

        for (const alert of kpi.alerts) {
            if (!alert.isActive) continue;

            let shouldAlert = false;
            const currentValue = kpi.cache.currentValue;

            if (currentValue === null || currentValue === undefined) continue; // Cannot check alert if no value

            switch (alert.condition) {
                case 'above':
                    shouldAlert = currentValue > alert.threshold;
                    break;
                case 'below':
                    shouldAlert = currentValue < alert.threshold;
                    break;
                case 'equals': // Consider a small tolerance for floating point comparisons
                    shouldAlert = Math.abs(currentValue - alert.threshold) < (alert.tolerance || 0.01);
                    break;
                case 'change_percent': // Absolute percentage change
                    shouldAlert = kpi.cache.trend !== null && Math.abs(kpi.cache.trend) > alert.threshold;
                    break;
                default:
                    console.warn(`Unknown alert condition: ${alert.condition} for KPI ${kpi.name}`);
            }

            if (shouldAlert) {
                await this.triggerAlert(kpi, alert, currentValue);
            }
        }
    }

    // Trigger alert
    async triggerAlert(kpi, alert, currentValue) {
        // In production, this would send emails, create notifications, etc.
        console.log(`ALERT: KPI "${kpi.displayName}" triggered alert. Current value: ${this.formatValue(currentValue, kpi.displayFormat)}, Condition: ${alert.condition} ${alert.threshold}`);
        
        // Log alert to database (assuming AlertLog model exists)
        // const AlertLog = mongoose.models.AlertLog || mongoose.model('AlertLog', new mongoose.Schema({ /* ... */ }));
        // await AlertLog.create({ 
        //     kpiId: kpi._id, 
        //     kpiName: kpi.displayName,
        //     alertName: alert.name || 'Unnamed Alert',
        //     condition: alert.condition,
        //     threshold: alert.threshold,
        //     currentValue: currentValue,
        //     triggeredAt: new Date() 
        // });
    }

    // Bulk calculate all KPIs for a specific user
    async calculateAllKPIsForUser(userId) {
        const kpis = await CustomKPI.find({ 
            createdBy: userId, // Filter by user
            isActive: true 
        });

        const results = [];
        
        for (const kpi of kpis) {
            try {
                const result = await this.calculateKPIValue(kpi._id);
                results.push({ success: true, ...result });
            } catch (error) {
                results.push({
                    success: false,
                    kpiId: kpi._id,
                    name: kpi.name,
                    error: error.message
                });
            }
        }
        return results;
    }

    // Get KPI dashboard data for a specific user
    async getKPIDashboard(userId) {
        const kpis = await CustomKPI.find({
            createdBy: userId, // Filter by user
            isActive: true,
            isPinned: true // Only pinned KPIs for dashboard
        }).sort({ category: 1, displayName: 1 });

        const dashboardData = {
            categories: {},
            summary: {
                total: kpis.length,
                improving: 0,
                declining: 0,
                stable: 0, // Added stable state
                onTarget: 0,
                offTarget: 0
            }
        };

        for (const kpi of kpis) {
            if (!kpi.cache) { // Skip if no cache (might happen for newly created KPIs not yet calculated)
                console.warn(`KPI ${kpi.displayName} has no cache, skipping for dashboard.`);
                continue;
            }

            if (!dashboardData.categories[kpi.category]) {
                dashboardData.categories[kpi.category] = [];
            }

            const kpiData = {
                id: kpi._id,
                name: kpi.displayName,
                value: kpi.cache.currentValue,
                formattedValue: this.formatValue(kpi.cache.currentValue, kpi.displayFormat),
                trend: kpi.cache.trend, // Percentage
                target: this.getCurrentTarget(kpi, new Date()),
                visualization: kpi.visualization || { type: 'number_card' }, // Default visualization
                lastUpdated: kpi.cache.lastCalculated
            };

            // Update summary based on trend
            if (kpi.cache.trend === null || kpi.cache.trend === undefined) {
                 // No trend data, could be first calculation
            } else if (kpi.cache.trend > 1) dashboardData.summary.improving++; // Trend > 1%
            else if (kpi.cache.trend < -1) dashboardData.summary.declining++; // Trend < -1%
            else dashboardData.summary.stable++;


            if (kpiData.target !== null && kpiData.value !== null) {
                const isOnTarget = this.checkIfOnTarget(kpi, kpiData.value, kpiData.target);
                if (isOnTarget) dashboardData.summary.onTarget++;
                else dashboardData.summary.offTarget++;
            }

            dashboardData.categories[kpi.category].push(kpiData);
        }

        return dashboardData;
    }

    checkIfOnTarget(kpi, value, targetValue) {
        if (value === null || targetValue === null) return false; // Cannot determine if values are missing

        // Find target definition, default to 'min' if not specified
        const targetDefinition = kpi.targets 
            ? kpi.targets.find(t => t.value === targetValue || (t.period && t.period === moment().format('YYYY-MM')))
            : null;
        const targetType = (targetDefinition && targetDefinition.type) ? targetDefinition.type : 'min';
        
        switch (targetType) {
            case 'min': // Value should be greater than or equal to target
                return value >= targetValue;
            case 'max': // Value should be less than or equal to target
                return value <= targetValue;
            case 'exact': // Value should be close to target (e.g., within 5%)
                return Math.abs(value - targetValue) / Math.abs(targetValue) < 0.05; 
            default: // Default to 'min' logic
                return value >= targetValue;
        }
    }

    // This method initializes (creates) the built-in KPIs for a *new* user.
    // It now correctly uses `this.builtInKPIs` which is populated by `getBuiltInKPIDefinitions()` in the constructor.
    async initializeBuiltInKPIsForUser(userId) {
        const results = [];
        if (!this.builtInKPIs || this.builtInKPIs.length === 0) {
            console.warn("No built-in KPI definitions found to initialize for user.");
            return results;
        }
        
        for (const kpiTemplate of this.builtInKPIs) {
            try {
                // Check if this KPI already exists for the user to prevent duplicates
                const existingKPI = await CustomKPI.findOne({ name: kpiTemplate.name, createdBy: userId });
                if (existingKPI) {
                    results.push({ success: true, kpi: existingKPI.name, message: 'KPI already exists' });
                    continue;
                }

                const kpi = await this.createKPI({
                    ...kpiTemplate, // Spread the template
                    isPinned: true, // Default to pinned for built-in KPIs
                    // createdBy and lastModifiedBy will be set by createKPI
                }, userId);
                results.push({ success: true, kpi: kpi.name, message: 'KPI created' });
            } catch (error) {
                console.error(`Failed to initialize built-in KPI ${kpiTemplate.name} for user ${userId}:`, error.message);
                results.push({ success: false, kpi: kpiTemplate.name, error: error.message });
            }
        }
        
        return results;
    }
}

module.exports = {
    CustomKPIService,
    customKPIService: new CustomKPIService()
};
