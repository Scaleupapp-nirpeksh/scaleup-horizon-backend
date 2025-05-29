// services/customKpiService.js
const math = require('mathjs');
const moment = require('moment');
const mongoose = require('mongoose');

// Updated CustomKPI model definition with multi-tenancy
let CustomKPI;
try {
    CustomKPI = mongoose.model('CustomKPI');
} catch (error) {
    const kpiSchema = new mongoose.Schema({
        // Multi-tenancy field
        organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
        
        name: String,
        displayName: String,
        category: String,
        formula: String,
        formulaVariables: Array,
        displayFormat: Object,
        
        // Track who created/modified within the organization
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
        
        // Organization-level settings
        visibility: {
            type: String,
            enum: ['all', 'admins', 'custom'],
            default: 'all'
        },
        allowedRoles: [{ type: String }], // If visibility is 'custom'
    }, { timestamps: true });
    
    // Indexes for performance
    kpiSchema.index({ organization: 1, name: 1 }, { unique: true });
    kpiSchema.index({ organization: 1, isActive: 1, isPinned: 1 });
    kpiSchema.index({ organization: 1, category: 1 });
    
    CustomKPI = mongoose.model('CustomKPI', kpiSchema);
}


class CustomKPIService {
    constructor() {
        this.mathParser = math.parser();
        this.builtInKPIs = this.getBuiltInKPIDefinitions();
    }

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
                        value: 'burn_rate'
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
                        value: 'average_ltv'
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

    // Create a new custom KPI - NOW ORGANIZATION-BASED
    async createKPI(kpiData, userId, organizationId) {
        try {
            // Check if KPI with same name already exists in organization
            const existingKPI = await CustomKPI.findOne({
                organization: organizationId,
                name: kpiData.name
            });
            
            if (existingKPI) {
                throw new Error(`KPI with name "${kpiData.name}" already exists in this organization`);
            }
            
            // Validate formula
            const validation = await this.validateFormula(kpiData.formula, kpiData.formulaVariables);
            if (!validation.isValid) {
                throw new Error(`Invalid formula: ${validation.error}`);
            }

            // Create KPI
            const kpi = new CustomKPI({
                ...kpiData,
                organization: organizationId,
                createdBy: userId,
                lastModifiedBy: userId
            });

            await kpi.save();

            // Calculate initial value
            await this.calculateKPIValue(kpi._id, organizationId);

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
            formulaVars.forEach(v => scope[v] = 1);
            
            try {
                const evaluationResult = math.evaluate(formula, scope);
                if (typeof evaluationResult !== 'number' || isNaN(evaluationResult) || !isFinite(evaluationResult)) {
                     // Acceptable if math.evaluate doesn't throw
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
        let cleaned = formula;
        // Remove math functions
        cleaned = cleaned.replace(/\b(sin|cos|tan|log|sqrt|abs|min|max|round|floor|ceil)\b\s*\([^)]*\)/g, ' ');
        // Remove numbers
        cleaned = cleaned.replace(/\b\d+(\.\d+)?\b/g, ' ');
        // Remove operators and parentheses
        cleaned = cleaned.replace(/[\s+\-*/().,]/g, ' ');
        
        // Extract unique variable names
        const variables = cleaned.split(/\s+/)
            .filter(v => v.length > 0 && isNaN(v))
            .filter((v, i, arr) => arr.indexOf(v) === i);
        
        return variables;
    }

    // Calculate KPI value - NOW WITH ORGANIZATION CONTEXT
    async calculateKPIValue(kpiId, organizationId, targetDate = new Date()) {
        try {
            const kpi = await CustomKPI.findOne({
                _id: kpiId,
                organization: organizationId
            });
            
            if (!kpi) throw new Error('KPI not found or unauthorized');

            // Get values for all variables with organization context
            const scope = {};
            
            for (const variable of kpi.formulaVariables) {
                try {
                    const value = await this.getVariableValue(variable, organizationId, targetDate);
                    scope[variable.variable] = value;
                } catch (varError) {
                    console.error(`Error getting value for variable ${variable.variable} in KPI ${kpi.name}:`, varError.message);
                    scope[variable.variable] = 0;
                }
            }

            // Calculate result
            let result;
            try {
                result = math.evaluate(kpi.formula, scope);
                if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
                    console.warn(`Formula evaluation for KPI ${kpi.name} resulted in non-numeric value: ${result}. Scope:`, scope);
                    result = 0;
                }
            } catch (error) {
                console.error(`Formula evaluation error for KPI ${kpi.name}: ${error.message}. Scope:`, scope);
                throw new Error(`Formula evaluation failed: ${error.message}`);
            }

            // Update cache
            const previousValue = kpi.cache.currentValue;
            kpi.cache.previousValue = (previousValue !== null && previousValue !== undefined) ? previousValue : null;
            kpi.cache.currentValue = result;
            kpi.cache.lastCalculated = new Date();
            
            // Calculate trend
            if (kpi.cache.previousValue !== null && kpi.cache.previousValue !== 0) {
                kpi.cache.trend = ((result - kpi.cache.previousValue) / Math.abs(kpi.cache.previousValue)) * 100;
            } else if (kpi.cache.previousValue === 0 && result !== 0) {
                kpi.cache.trend = Infinity;
            } else {
                kpi.cache.trend = 0;
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
                .sort((a, b) => new Date(a.date) - new Date(b.date));

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

    // Get variable value from data source - NOW WITH ORGANIZATION CONTEXT
    async getVariableValue(variable, organizationId, targetDate) {
        const timeRange = this.getTimeRange(variable.timeframe, variable.customTimeframe, targetDate);
        
        // Ensure models are available
        const Revenue = mongoose.models.Revenue || mongoose.model('Revenue');
        const Expense = mongoose.models.Expense || mongoose.model('Expense');
        const BankAccount = mongoose.models.BankAccount || mongoose.model('BankAccount');
        const ManualKpiSnapshot = mongoose.models.ManualKpiSnapshot || mongoose.model('ManualKpiSnapshot');
        const RevenueCohort = mongoose.models.RevenueCohort || mongoose.model('RevenueCohort');

        switch (variable.source) {
            case 'revenue':
                return await this.getRevenueValue(variable, timeRange, organizationId, Revenue);
            
            case 'expense':
                return await this.getExpenseValue(variable, timeRange, organizationId, Expense);
            
            case 'bank_balance':
                return await this.getBankBalanceValue(variable, organizationId, BankAccount);
            
            case 'user_count':
                return await this.getUserCountValue(variable, timeRange, organizationId, ManualKpiSnapshot);
            
            case 'custom_metric':
                return await this.getCustomMetricValue(variable.value, organizationId, CustomKPI, RevenueCohort);
            
            case 'constant':
                return variable.value || 0;
            
            default:
                throw new Error(`Unknown variable source: ${variable.source}`);
        }
    }

    // Get revenue value - WITH ORGANIZATION FILTER
    async getRevenueValue(variable, timeRange, organizationId, RevenueModel) {
        const query = {
            organization: organizationId,
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

    // Get expense value - WITH ORGANIZATION FILTER
    async getExpenseValue(variable, timeRange, organizationId, ExpenseModel) {
        const query = {
            organization: organizationId,
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

    // Get bank balance value - WITH ORGANIZATION FILTER
    async getBankBalanceValue(variable, organizationId, BankAccountModel) {
        if (variable.aggregation === 'latest' || variable.aggregation === 'sum') {
            const accounts = await BankAccountModel.find({ organization: organizationId });
            return accounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);
        }
        
        const result = await BankAccountModel.aggregate([
            { $match: { organization: organizationId } },
            {
                $group: {
                    _id: null,
                    value: { [`$${variable.aggregation}`]: '$currentBalance' }
                }
            }
        ]);

        return result.length > 0 && result[0].value !== null ? result[0].value : 0;
    }

    // Get user count value - WITH ORGANIZATION FILTER
    async getUserCountValue(variable, timeRange, organizationId, ManualKpiSnapshotModel) {
        const snapshots = await ManualKpiSnapshotModel.find({
            organization: organizationId,
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

    // Get custom metric value - WITH ORGANIZATION FILTER
    async getCustomMetricValue(metricName, organizationId, CustomKPIModel, RevenueCohortModel) {
        const referencedKpi = await CustomKPIModel.findOne({
            organization: organizationId,
            name: metricName
        });
        
        if (referencedKpi && referencedKpi.cache && referencedKpi.cache.currentValue !== null) {
            return referencedKpi.cache.currentValue;
        }

        if (metricName === 'average_ltv') {
            const cohorts = await RevenueCohortModel.find({
                organization: organizationId,
                projectedLTV: { $gt: 0 }
            });
            if (cohorts.length === 0) return 0;
            const sumLTV = cohorts.reduce((sum, c) => sum + (c.projectedLTV || 0), 0);
            return cohorts.length > 0 ? sumLTV / cohorts.length : 0;
        }

        console.warn(`Custom metric ${metricName} not found or has no cached value for organization ${organizationId}`);
        return 0;
    }

    // Apply filter to query
    applyFilter(query, filter) {
        const field = filter.field;
        const operator = filter.operator;
        let value = filter.value;

        switch (operator) {
            case 'equals':
                query[field] = value;
                break;
            case 'contains':
                query[field] = { $regex: value, $options: 'i' };
                break;
            case 'in':
                query[field] = { $in: Array.isArray(value) ? value : [value] };
                break;
            case 'between':
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
        const target = moment(targetDate).utcOffset(0, true);
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
                end = target.clone().endOf('day');
                start = target.clone().subtract(29, 'days').startOf('day');
                break;
            case 'last_90_days':
                end = target.clone().endOf('day');
                start = target.clone().subtract(89, 'days').startOf('day');
                break;
            case 'all_time':
                start = moment('2000-01-01').utcOffset(0, true);
                end = target.clone().endOf('day');
                break;
            case 'custom':
                if (customTimeframe && customTimeframe.start && customTimeframe.end) {
                    start = moment(customTimeframe.start).utcOffset(0, true).startOf('day');
                    end = moment(customTimeframe.end).utcOffset(0, true).endOf('day');
                } else {
                    console.warn("Invalid custom timeframe, defaulting to current_month:", customTimeframe);
                    start = target.clone().startOf('month');
                    end = target.clone().endOf('month');
                }
                break;
            case 'latest':
                 return { singlePoint: true, date: target.toDate() };
            default:
                start = target.clone().startOf('month');
                end = target.clone().endOf('month');
        }
        return { start: start.toDate(), end: end.toDate() };
    }

    // Format value for display
    formatValue(value, format) {
        if (value === null || value === undefined || (typeof value === 'number' && !isFinite(value))) {
            return 'N/A';
        }

        let formatted;
        const decimals = (format && typeof format.decimals === 'number') ? format.decimals : 2;
        
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
            default:
                formatted = this.formatNumber(value, decimals) + (format.suffix || '');
        }

        return formatted;
    }

    formatNumber(value, decimals = 0) {
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
            return 'N/A';
        }
        
        // Indian numbering system
        if (Math.abs(value) >= 10000000) { // 1 Crore
            return (value / 10000000).toFixed(Math.max(0, decimals - 1)) + 'Cr';
        } else if (Math.abs(value) >= 100000) { // 1 Lakh
            return (value / 100000).toFixed(Math.max(0, decimals - 1)) + 'L';
        }
        return value.toFixed(decimals);
    }

    // Get current target
    getCurrentTarget(kpi, date) {
        if (!kpi.targets || kpi.targets.length === 0) return null;
        
        const currentPeriodTarget = moment(date).format('YYYY-MM');
        const target = kpi.targets.find(t => t.period === currentPeriodTarget);
        
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

            if (currentValue === null || currentValue === undefined) continue;

            switch (alert.condition) {
                case 'above':
                    shouldAlert = currentValue > alert.threshold;
                    break;
                case 'below':
                    shouldAlert = currentValue < alert.threshold;
                    break;
                case 'equals':
                    shouldAlert = Math.abs(currentValue - alert.threshold) < (alert.tolerance || 0.01);
                    break;
                case 'change_percent':
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
        console.log(`ALERT: KPI "${kpi.displayName}" triggered alert. Current value: ${this.formatValue(currentValue, kpi.displayFormat)}, Condition: ${alert.condition} ${alert.threshold}`);
        
        // In production, send notifications to all relevant users in the organization
        // You could store alert preferences per user within the organization
    }

    // Calculate all KPIs for an organization - RENAMED AND UPDATED
    async calculateAllKPIsForOrganization(organizationId) {
        const kpis = await CustomKPI.find({ 
            organization: organizationId,
            isActive: true 
        });

        const results = [];
        
        for (const kpi of kpis) {
            try {
                const result = await this.calculateKPIValue(kpi._id, organizationId);
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

    // Get KPI dashboard for organization - UPDATED
    async getKPIDashboard(organizationId, options = {}) {
        const query = {
            organization: organizationId,
            isActive: true
        };
        
        // Allow filtering by visibility based on user role
        if (options.userRole && options.userRole !== 'admin') {
            query.$or = [
                { visibility: 'all' },
                { visibility: 'custom', allowedRoles: options.userRole }
            ];
        }
        
        if (!options.includeUnpinned) {
            query.isPinned = true;
        }
        
        const kpis = await CustomKPI.find(query).sort({ category: 1, displayName: 1 });

        const dashboardData = {
            categories: {},
            summary: {
                total: kpis.length,
                improving: 0,
                declining: 0,
                stable: 0,
                onTarget: 0,
                offTarget: 0
            }
        };

        for (const kpi of kpis) {
            if (!kpi.cache) {
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
                trend: kpi.cache.trend,
                target: this.getCurrentTarget(kpi, new Date()),
                visualization: kpi.visualization || { type: 'number_card' },
                lastUpdated: kpi.cache.lastCalculated,
                visibility: kpi.visibility
            };

            // Update summary based on trend
            if (kpi.cache.trend === null || kpi.cache.trend === undefined) {
                // No trend data
            } else if (kpi.cache.trend > 1) dashboardData.summary.improving++;
            else if (kpi.cache.trend < -1) dashboardData.summary.declining++;
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
        if (value === null || targetValue === null) return false;

        const targetDefinition = kpi.targets 
            ? kpi.targets.find(t => t.value === targetValue || (t.period && t.period === moment().format('YYYY-MM')))
            : null;
        const targetType = (targetDefinition && targetDefinition.type) ? targetDefinition.type : 'min';
        
        switch (targetType) {
            case 'min':
                return value >= targetValue;
            case 'max':
                return value <= targetValue;
            case 'exact':
                return Math.abs(value - targetValue) / Math.abs(targetValue) < 0.05; 
            default:
                return value >= targetValue;
        }
    }

    // Initialize built-in KPIs for organization - RENAMED AND UPDATED
    async initializeBuiltInKPIsForOrganization(organizationId, userId) {
        const results = [];
        if (!this.builtInKPIs || this.builtInKPIs.length === 0) {
            console.warn("No built-in KPI definitions found to initialize for organization.");
            return results;
        }
        
        for (const kpiTemplate of this.builtInKPIs) {
            try {
                // Check if this KPI already exists for the organization
                const existingKPI = await CustomKPI.findOne({
                    name: kpiTemplate.name,
                    organization: organizationId
                });
                
                if (existingKPI) {
                    results.push({ success: true, kpi: existingKPI.name, message: 'KPI already exists' });
                    continue;
                }

                const kpi = await this.createKPI({
                    ...kpiTemplate,
                    isPinned: true,
                    visibility: 'all' // Default visibility for built-in KPIs
                }, userId, organizationId);
                
                results.push({ success: true, kpi: kpi.name, message: 'KPI created' });
            } catch (error) {
                console.error(`Failed to initialize built-in KPI ${kpiTemplate.name} for organization ${organizationId}:`, error.message);
                results.push({ success: false, kpi: kpiTemplate.name, error: error.message });
            }
        }
        
        return results;
    }

    // Update KPI - NEW METHOD
    async updateKPI(kpiId, updates, userId, organizationId) {
        const kpi = await CustomKPI.findOne({
            _id: kpiId,
            organization: organizationId
        });
        
        if (!kpi) {
            throw new Error('KPI not found or unauthorized');
        }
        
        // If formula or variables changed, validate
        if (updates.formula || updates.formulaVariables) {
            const formula = updates.formula || kpi.formula;
            const variables = updates.formulaVariables || kpi.formulaVariables;
            
            const validation = await this.validateFormula(formula, variables);
            if (!validation.isValid) {
                throw new Error(`Invalid formula: ${validation.error}`);
            }
        }
        
        // Update fields
        Object.keys(updates).forEach(key => {
            if (key !== '_id' && key !== 'organization') {
                kpi[key] = updates[key];
            }
        });
        
        kpi.lastModifiedBy = userId;
        await kpi.save();
        
        // Recalculate if formula changed
        if (updates.formula || updates.formulaVariables) {
            await this.calculateKPIValue(kpi._id, organizationId);
        }
        
        return kpi;
    }

    // Delete KPI - NEW METHOD
    async deleteKPI(kpiId, organizationId) {
        const result = await CustomKPI.deleteOne({
            _id: kpiId,
            organization: organizationId
        });
        
        if (result.deletedCount === 0) {
            throw new Error('KPI not found or unauthorized');
        }
        
        return { success: true };
    }

    // Get KPI history - NEW METHOD
    async getKPIHistory(kpiId, organizationId, days = 30) {
        const kpi = await CustomKPI.findOne({
            _id: kpiId,
            organization: organizationId
        });
        
        if (!kpi) {
            throw new Error('KPI not found or unauthorized');
        }
        
        const cutoffDate = moment().subtract(days, 'days').toDate();
        const history = (kpi.cache.historicalValues || [])
            .filter(h => h.date > cutoffDate)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        return {
            kpiId: kpi._id,
            name: kpi.displayName,
            history,
            currentValue: kpi.cache.currentValue,
            trend: kpi.cache.trend,
            displayFormat: kpi.displayFormat
        };
    }
}

module.exports = {
    CustomKPIService,
    customKPIService: new CustomKPIService()
};