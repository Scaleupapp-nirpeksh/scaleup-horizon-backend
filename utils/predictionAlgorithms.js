// utils/predictionAlgorithms.js
const moment = require('moment');
const stats = require('simple-statistics');

// Configuration constants
const CONFIG = {
    DEFAULT_ALPHA: 0.3,
    DEFAULT_DISCOUNT_RATE: 0.1,
    DEFAULT_VARIANCE: 0.1,
    MAX_PROJECTION_MONTHS: 60,
    MIN_DATA_POINTS: 2,
    CONFIDENCE_DECAY_RATE: 0.03,
    MONTE_CARLO_ITERATIONS: 1000
};

// Cache for expensive calculations
const cache = new Map();

class PredictionAlgorithms {
    /**
     * Calculate exponential smoothing forecast with improved error handling
     * @param {number[]} data - Historical data points
     * @param {number} alpha - Smoothing parameter (0-1)
     * @param {number} periods - Number of periods to forecast
     * @returns {number[]} Forecasted values
     */
    static exponentialSmoothing(data, alpha = CONFIG.DEFAULT_ALPHA, periods = 12) {
        // Input validation
        if (!Array.isArray(data) || data.length === 0) {
            return Array(periods).fill(0);
        }
        
        // Validate alpha
        alpha = Math.max(0, Math.min(1, alpha));
        
        // Filter and validate data
        const validData = data.filter(d => 
            typeof d === 'number' && 
            !isNaN(d) && 
            isFinite(d) && 
            d >= 0
        );
        
        if (validData.length === 0) {
            return Array(periods).fill(0);
        }
        
        // Check cache
        const cacheKey = `exp_smooth_${JSON.stringify(validData)}_${alpha}_${periods}`;
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey);
        }
        
        try {
            // Initialize with first value
            const smoothed = [validData[0]];
            
            // Calculate smoothed values for historical data
            for (let i = 1; i < validData.length; i++) {
                const smoothedValue = alpha * validData[i] + (1 - alpha) * smoothed[i - 1];
                smoothed.push(smoothedValue);
            }
            
            // Calculate trend using robust method
            const trend = this.calculateTrend(validData);
            const lastValue = smoothed[smoothed.length - 1];
            
            // Project future values with trend dampening
            const forecast = [];
            for (let i = 0; i < periods; i++) {
                // Dampen trend over time for more realistic projections
                const dampingFactor = Math.exp(-i * 0.05);
                const effectiveTrend = trend * dampingFactor;
                
                const projectedValue = lastValue * Math.pow(1 + effectiveTrend, i + 1);
                
                // Ensure reasonable bounds
                const boundedValue = Math.max(0, projectedValue);
                forecast.push(isFinite(boundedValue) ? boundedValue : lastValue);
            }
            
            // Cache result
            cache.set(cacheKey, forecast);
            
            // Clear old cache entries if too many
            if (cache.size > 100) {
                const firstKey = cache.keys().next().value;
                cache.delete(firstKey);
            }
            
            return forecast;
        } catch (error) {
            console.error('Error in exponentialSmoothing:', error);
            return Array(periods).fill(validData[validData.length - 1] || 0);
        }
    }
    
    /**
     * Calculate trend with outlier detection
     * @param {number[]} data - Historical data
     * @returns {number} Trend coefficient
     */
    static calculateTrend(data) {
        if (!Array.isArray(data) || data.length < CONFIG.MIN_DATA_POINTS) {
            return 0;
        }
        
        // Filter valid data
        const validData = data.filter(d => 
            typeof d === 'number' && 
            !isNaN(d) && 
            isFinite(d) && 
            d >= 0
        );
        
        if (validData.length < CONFIG.MIN_DATA_POINTS) {
            return 0;
        }
        
        try {
            // Remove outliers using IQR method
            const cleanData = this.removeOutliers(validData);
            if (cleanData.length < CONFIG.MIN_DATA_POINTS) {
                return 0;
            }
            
            // Calculate linear regression
            const xValues = Array.from({length: cleanData.length}, (_, i) => i);
            const regression = stats.linearRegression([xValues, cleanData]);
            
            const meanValue = stats.mean(cleanData);
            if (meanValue === 0) return 0;
            
            // Calculate trend as percentage
            const trend = regression.m / meanValue;
            
            // Cap extreme trends
            const cappedTrend = Math.max(-0.5, Math.min(0.5, trend));
            
            return isFinite(cappedTrend) ? cappedTrend : 0;
        } catch (error) {
            console.error('Error calculating trend:', error);
            return 0;
        }
    }
    
    /**
     * Remove outliers using IQR method
     * @param {number[]} data - Input data
     * @returns {number[]} Data without outliers
     */
    static removeOutliers(data) {
        if (data.length < 4) return data;
        
        try {
            const sorted = [...data].sort((a, b) => a - b);
            const q1 = stats.quantile(sorted, 0.25);
            const q3 = stats.quantile(sorted, 0.75);
            const iqr = q3 - q1;
            
            const lowerBound = q1 - 1.5 * iqr;
            const upperBound = q3 + 1.5 * iqr;
            
            return data.filter(d => d >= lowerBound && d <= upperBound);
        } catch (error) {
            return data;
        }
    }
    
    /**
     * Optimized Monte Carlo simulation
     * @param {Object} params - Simulation parameters
     * @param {number} iterations - Number of iterations
     * @returns {Object} Simulation results
     */
    static monteCarloSimulation(params, iterations = CONFIG.MONTE_CARLO_ITERATIONS) {
        // Validate inputs
        const validParams = {
            initialCash: Math.max(0, params.initialCash || 0),
            monthlyBurn: Math.max(0, params.monthlyBurn || 0),
            monthlyRevenue: Math.max(0, params.monthlyRevenue || 0),
            burnGrowthRate: Math.max(-0.5, Math.min(0.5, params.burnGrowthRate || 0)),
            revenueGrowthRate: Math.max(-0.5, Math.min(0.5, params.revenueGrowthRate || 0)),
            variance: Math.max(0, Math.min(0.5, params.variance || CONFIG.DEFAULT_VARIANCE))
        };
        
        // Check if simulation is meaningful
        if (validParams.initialCash === 0 || validParams.monthlyBurn === 0) {
            return {
                p10: 0,
                p50: 0,
                p90: 0,
                mean: 0,
                stdDev: 0,
                scenarios: []
            };
        }
        
        // Run simulations in batches for better performance
        const batchSize = 100;
        const results = [];
        
        for (let batch = 0; batch < iterations; batch += batchSize) {
            const batchResults = [];
            const currentBatchSize = Math.min(batchSize, iterations - batch);
            
            for (let i = 0; i < currentBatchSize; i++) {
                batchResults.push(this.runSingleScenario(validParams));
            }
            
            results.push(...batchResults);
        }
        
        // Calculate statistics
        const runwayMonths = results
            .map(r => r.runwayMonths)
            .filter(r => isFinite(r))
            .sort((a, b) => a - b);
        
        if (runwayMonths.length === 0) {
            return {
                p10: 0,
                p50: 0,
                p90: 0,
                mean: 0,
                stdDev: 0,
                scenarios: results
            };
        }
        
        return {
            p10: runwayMonths[Math.floor(runwayMonths.length * 0.1)] || 0,
            p50: runwayMonths[Math.floor(runwayMonths.length * 0.5)] || 0,
            p90: runwayMonths[Math.floor(runwayMonths.length * 0.9)] || 0,
            mean: stats.mean(runwayMonths),
            stdDev: runwayMonths.length > 1 ? stats.standardDeviation(runwayMonths) : 0,
            scenarios: results.slice(0, 100) // Limit returned scenarios for performance
        };
    }
    
    /**
     * Run single scenario with improved randomness
     * @param {Object} params - Scenario parameters
     * @returns {Object} Scenario result
     */
    static runSingleScenario(params) {
        let cash = params.initialCash;
        let month = 0;
        let monthlyBurn = params.monthlyBurn;
        let monthlyRevenue = params.monthlyRevenue;
        
        const maxMonths = CONFIG.MAX_PROJECTION_MONTHS;
        
        while (cash > 0 && month < maxMonths) {
            // Use Box-Muller transform for better normal distribution
            const burnVariance = this.generateNormalRandom(1, params.variance);
            const revenueVariance = this.generateNormalRandom(1, params.variance);
            
            // Ensure non-negative values
            const actualBurn = Math.max(0, monthlyBurn * burnVariance);
            const actualRevenue = Math.max(0, monthlyRevenue * revenueVariance);
            
            cash = cash + actualRevenue - actualBurn;
            
            // Apply growth with compounding
            monthlyBurn *= (1 + params.burnGrowthRate);
            monthlyRevenue *= (1 + params.revenueGrowthRate);
            
            month++;
            
            // Early exit if burn becomes unrealistic
            if (monthlyBurn > params.initialCash * 10) {
                break;
            }
        }
        
        return {
            runwayMonths: month,
            finalCash: Math.max(0, cash),
            breakEven: monthlyRevenue >= monthlyBurn,
            burnMultiple: monthlyBurn / params.monthlyBurn
        };
    }
    
    /**
     * Generate normal random number using Box-Muller transform
     * @param {number} mean - Mean value
     * @param {number} stdDev - Standard deviation
     * @returns {number} Random value
     */
    static generateNormalRandom(mean, stdDev) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z0 * stdDev;
    }
    
    /**
     * Calculate fundraising probability with validation
     * @param {Object} factors - Scoring factors
     * @returns {number} Probability (0-1)
     */
    static calculateFundraisingProbability(factors) {
        const weights = {
            burnRate: 0.25,
            growth: 0.20,
            marketConditions: 0.15,
            teamStrength: 0.15,
            productMarketFit: 0.15,
            revenue: 0.10
        };
        
        let weightedSum = 0;
        let totalWeight = 0;
        
        for (const [factor, weight] of Object.entries(weights)) {
            const score = factors[factor];
            
            // Validate and normalize score to 0-1 range
            if (typeof score === 'number' && !isNaN(score)) {
                const normalizedScore = Math.max(0, Math.min(1, score));
                weightedSum += normalizedScore * weight;
                totalWeight += weight;
            }
        }
        
        // Return weighted average or default
        const probability = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
        return Math.max(0, Math.min(1, probability));
    }
    
    /**
     * Project cash flow with improved seasonality
     * @param {Array} historicalData - Historical cash flow data
     * @param {number} periods - Number of periods to project
     * @param {boolean} seasonality - Apply seasonality adjustments
     * @returns {Array} Projected cash flow
     */
    static projectCashFlow(historicalData, periods = 12, seasonality = true) {
        // Handle empty or invalid data
        if (!Array.isArray(historicalData) || historicalData.length === 0) {
            return this.generateEmptyProjections(periods);
        }
        
        // Filter valid data points
        const validData = historicalData.filter(d => 
            d && 
            typeof d.revenue === 'number' && 
            typeof d.expenses === 'number' &&
            isFinite(d.revenue) &&
            isFinite(d.expenses)
        );
        
        if (validData.length === 0) {
            return this.generateEmptyProjections(periods);
        }
        
        // Extract and clean data
        const revenues = validData.map(d => Math.max(0, d.revenue));
        const expenses = validData.map(d => Math.max(0, d.expenses));
        
        // Calculate trends with minimum data check
        const revenueTrend = validData.length >= CONFIG.MIN_DATA_POINTS ? 
            this.calculateTrend(revenues) : 0;
        const expenseTrend = validData.length >= CONFIG.MIN_DATA_POINTS ? 
            this.calculateTrend(expenses) : 0;
        
        // Calculate seasonality
        const seasonalFactors = seasonality && validData.length >= 12 ? 
            this.calculateSeasonality(validData) : Array(12).fill(1);
        
        // Use recent average as base
        const recentCount = Math.min(3, validData.length);
        const recentRevenues = revenues.slice(-recentCount);
        const recentExpenses = expenses.slice(-recentCount);
        
        let baseRevenue = stats.mean(recentRevenues);
        let baseExpenses = stats.mean(recentExpenses);
        
        const projections = [];
        
        for (let i = 0; i < periods; i++) {
            const monthIndex = (validData.length + i) % 12;
            const seasonalFactor = seasonalFactors[monthIndex];
            
            // Apply trends with dampening
            const trendDampening = Math.exp(-i * 0.02);
            const effectiveRevenueTrend = revenueTrend * trendDampening;
            const effectiveExpenseTrend = expenseTrend * trendDampening;
            
            const projectedRevenue = baseRevenue * (1 + effectiveRevenueTrend) * seasonalFactor;
            const projectedExpenses = baseExpenses * (1 + effectiveExpenseTrend);
            
            const netCashFlow = projectedRevenue - projectedExpenses;
            
            projections.push({
                period: i + 1,
                revenue: Math.max(0, isFinite(projectedRevenue) ? projectedRevenue : baseRevenue),
                expenses: Math.max(0, isFinite(projectedExpenses) ? projectedExpenses : baseExpenses),
                netCashFlow: isFinite(netCashFlow) ? netCashFlow : 0,
                confidence: Math.max(0.3, 1 - (i * CONFIG.CONFIDENCE_DECAY_RATE))
            });
            
            // Update base values for next iteration
            baseRevenue = projections[i].revenue;
            baseExpenses = projections[i].expenses;
        }
        
        return projections;
    }
    
    /**
     * Generate empty projections
     * @param {number} periods - Number of periods
     * @returns {Array} Empty projections
     */
    static generateEmptyProjections(periods) {
        return Array(periods).fill(null).map((_, i) => ({
            period: i + 1,
            revenue: 0,
            expenses: 0,
            netCashFlow: 0,
            confidence: 0.5
        }));
    }
    
    /**
     * Calculate seasonality with validation
     * @param {Array} data - Historical data with dates
     * @returns {Array} Monthly seasonality factors
     */
    static calculateSeasonality(data) {
        const monthlyTotals = Array(12).fill(0);
        const monthlyCounts = Array(12).fill(0);
        const validData = [];
        
        // Aggregate by month
        data.forEach(item => {
            if (item.date && item.revenue > 0) {
                const month = moment(item.date).month();
                if (month >= 0 && month < 12) {
                    monthlyTotals[month] += item.revenue;
                    monthlyCounts[month]++;
                    validData.push(item.revenue);
                }
            }
        });
        
        // Need data for at least 6 months
        const monthsWithData = monthlyCounts.filter(c => c > 0).length;
        if (monthsWithData < 6 || validData.length === 0) {
            return Array(12).fill(1);
        }
        
        // Calculate averages
        const monthlyAverages = monthlyTotals.map((total, i) => 
            monthlyCounts[i] > 0 ? total / monthlyCounts[i] : 0
        );
        
        // Calculate overall average (excluding zero months)
        const nonZeroAverages = monthlyAverages.filter(a => a > 0);
        if (nonZeroAverages.length === 0) {
            return Array(12).fill(1);
        }
        
        const overallAverage = stats.mean(nonZeroAverages);
        
        // Calculate factors with smoothing
        return monthlyAverages.map((avg, i) => {
            if (avg === 0 || monthlyCounts[i] === 0) {
                // Use average of adjacent months
                const prev = monthlyAverages[(i + 11) % 12];
                const next = monthlyAverages[(i + 1) % 12];
                if (prev > 0 && next > 0) {
                    avg = (prev + next) / 2;
                } else {
                    return 1;
                }
            }
            
            const factor = avg / overallAverage;
            // Limit extreme seasonality
            return Math.max(0.5, Math.min(2, factor));
        });
    }
    
    /**
     * Improved cohort retention projection
     * @param {number} initialUsers - Starting user count
     * @param {Array} historicalRetention - Historical retention rates
     * @param {number} projectionMonths - Months to project
     * @returns {Array} Retention projections
     */
    static projectCohortRetention(initialUsers, historicalRetention, projectionMonths) {
        // Validate inputs
        if (!initialUsers || initialUsers <= 0) {
            return this.generateEmptyRetentionProjections(projectionMonths);
        }
        
        if (!Array.isArray(historicalRetention) || historicalRetention.length === 0) {
            return this.generateDefaultRetentionProjections(initialUsers, projectionMonths);
        }
        
        // Clean retention data
        const validRetention = historicalRetention
            .map(r => typeof r === 'number' ? r : 0)
            .map(r => Math.max(0, Math.min(1, r)))
            .filter(r => r > 0);
        
        if (validRetention.length === 0) {
            return this.generateDefaultRetentionProjections(initialUsers, projectionMonths);
        }
        
        try {
            // Use different models based on data availability
            if (validRetention.length >= 6) {
                return this.powerLawRetention(initialUsers, validRetention, projectionMonths);
            } else if (validRetention.length >= 3) {
                return this.exponentialRetention(initialUsers, validRetention, projectionMonths);
            } else {
                return this.simpleRetention(initialUsers, validRetention, projectionMonths);
            }
        } catch (error) {
            console.error('Error in retention projection:', error);
            return this.generateDefaultRetentionProjections(initialUsers, projectionMonths);
        }
    }
    
    /**
     * Power law retention model
     */
    static powerLawRetention(initialUsers, retention, months) {
        const periods = retention.map((_, i) => i + 1);
        const logPeriods = periods.map(p => Math.log(p));
        const logRetention = retention.map(r => Math.log(Math.max(0.001, r)));
        
        const regression = stats.linearRegression([logPeriods, logRetention]);
        const a = Math.exp(regression.b);
        const b = regression.m;
        
        const projections = [];
        
        for (let month = 0; month < months; month++) {
            let retentionRate;
            if (month === 0) {
                retentionRate = 1;
            } else if (month < retention.length) {
                retentionRate = retention[month - 1];
            } else {
                retentionRate = a * Math.pow(month, b);
            }
            
            retentionRate = Math.max(0, Math.min(1, retentionRate));
            const activeUsers = Math.round(initialUsers * retentionRate);
            
            projections.push({
                month,
                retention: retentionRate,
                activeUsers: Math.max(0, activeUsers),
                churnedUsers: initialUsers - activeUsers
            });
        }
        
        return projections;
    }
    
    /**
     * Generate empty retention projections
     */
    static generateEmptyRetentionProjections(months) {
        return Array(months).fill(null).map((_, i) => ({
            month: i,
            retention: 0,
            activeUsers: 0,
            churnedUsers: 0
        }));
    }
    
    /**
     * Generate default retention with standard decay
     */
    static generateDefaultRetentionProjections(initialUsers, months) {
        const defaultDecay = 0.85; // 15% churn per month
        return Array(months).fill(null).map((_, month) => {
            const retention = Math.pow(defaultDecay, month);
            const activeUsers = Math.round(initialUsers * retention);
            return {
                month,
                retention,
                activeUsers,
                churnedUsers: initialUsers - activeUsers
            };
        });
    }
    
    /**
     * Calculate cohort LTV with improved error handling
     * @param {Object} cohortData - Cohort information
     * @param {number} discountRate - Annual discount rate
     * @returns {Object} LTV calculations
     */
    static calculateCohortLTV(cohortData, discountRate = CONFIG.DEFAULT_DISCOUNT_RATE) {
        // Comprehensive validation
        if (!cohortData || !cohortData.metrics || !Array.isArray(cohortData.metrics)) {
            return this.getEmptyLTVResult();
        }
        
        const initialUsers = cohortData.initialUsers || 0;
        if (initialUsers <= 0) {
            return this.getEmptyLTVResult();
        }
        
        // Extract and validate metrics
        const validMetrics = cohortData.metrics.filter(m => 
            m && 
            typeof m.revenue === 'number' && 
            typeof m.activeUsers === 'number' &&
            m.revenue >= 0 && 
            m.activeUsers >= 0
        );
        
        if (validMetrics.length === 0) {
            return this.getEmptyLTVResult();
        }
        
        try {
            // Calculate ARPU for each period
            const arpuData = validMetrics.map(m => {
                if (m.activeUsers > 0) {
                    return m.revenue / m.activeUsers;
                }
                return 0;
            });
            
            // Project future ARPU
            const futureMonths = Math.max(24, validMetrics.length * 2);
            const projectedARPU = this.exponentialSmoothing(arpuData, 0.3, futureMonths);
            
            // Calculate retention rates
            const retentionRates = validMetrics.map(m => 
                Math.min(1, m.activeUsers / initialUsers)
            );
            
            // Project retention
            const projectedRetention = this.projectCohortRetention(
                initialUsers,
                retentionRates,
                futureMonths + validMetrics.length
            );
            
            // Calculate NPV of future cash flows
            let ltv = 0;
            const monthlyDiscountRate = discountRate / 12;
            
            // Historical revenue
            validMetrics.forEach((metric, i) => {
                const discountFactor = Math.pow(1 + monthlyDiscountRate, -i);
                ltv += (metric.revenue / initialUsers) * discountFactor;
            });
            
            // Projected revenue
            for (let i = 0; i < projectedARPU.length; i++) {
                const monthIndex = validMetrics.length + i;
                if (monthIndex < projectedRetention.length) {
                    const discountFactor = Math.pow(1 + monthlyDiscountRate, -monthIndex);
                    const monthlyRevenue = projectedARPU[i] * projectedRetention[monthIndex].retention;
                    ltv += monthlyRevenue * discountFactor;
                }
            }
            
            const paybackPeriod = this.calculatePaybackPeriod(cohortData, ltv);
            const confidence = this.calculateLTVConfidence(cohortData);
            
            return {
                ltv: ltv * initialUsers,
                ltvPerUser: ltv,
                paybackPeriod: paybackPeriod,
                confidence: confidence,
                projectedMonths: futureMonths + validMetrics.length
            };
        } catch (error) {
            console.error('Error calculating LTV:', error);
            return this.getEmptyLTVResult();
        }
    }
    
    /**
     * Get empty LTV result
     */
    static getEmptyLTVResult() {
        return {
            ltv: 0,
            ltvPerUser: 0,
            paybackPeriod: null,
            confidence: 0,
            projectedMonths: 0
        };
    }
    
    /**
     * Simple retention model for limited data
     */
    static simpleRetention(initialUsers, retention, months) {
        const avgRetention = stats.mean(retention);
        const decayRate = Math.pow(avgRetention, 1 / retention.length);
        
        return Array(months).fill(null).map((_, month) => {
            let retentionRate;
            if (month < retention.length) {
                retentionRate = month === 0 ? 1 : retention[month - 1];
            } else {
                retentionRate = Math.pow(decayRate, month);
            }
            
            const activeUsers = Math.round(initialUsers * retentionRate);
            return {
                month,
                retention: Math.max(0, Math.min(1, retentionRate)),
                activeUsers: Math.max(0, activeUsers),
                churnedUsers: initialUsers - activeUsers
            };
        });
    }
    
    /**
     * Exponential retention model
     */
    static exponentialRetention(initialUsers, retention, months) {
        // Fit exponential decay
        const periods = retention.map((_, i) => i + 1);
        const logRetention = retention.map(r => Math.log(Math.max(0.001, r)));
        
        const regression = stats.linearRegression([periods, logRetention]);
        const decayRate = Math.exp(regression.m);
        
        return Array(months).fill(null).map((_, month) => {
            let retentionRate;
            if (month === 0) {
                retentionRate = 1;
            } else if (month <= retention.length) {
                retentionRate = retention[month - 1];
            } else {
                retentionRate = Math.exp(regression.b) * Math.pow(decayRate, month);
            }
            
            retentionRate = Math.max(0, Math.min(1, retentionRate));
            const activeUsers = Math.round(initialUsers * retentionRate);
            
            return {
                month,
                retention: retentionRate,
                activeUsers,
                churnedUsers: initialUsers - activeUsers
            };
        });
    }
}

module.exports = PredictionAlgorithms;