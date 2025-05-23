// utils/predictionAlgorithms.js
const moment = require('moment');
const stats = require('simple-statistics');

class PredictionAlgorithms {
    /**
     * Calculate exponential smoothing forecast
     */
    static exponentialSmoothing(data, alpha = 0.3, periods = 12) {
        if (!data || data.length === 0) return [];
        
        // Filter out non-numeric values
        const validData = data.filter(d => typeof d === 'number' && !isNaN(d) && isFinite(d));
        if (validData.length === 0) return Array(periods).fill(0);
        
        const forecast = [validData[0]];
        
        // Calculate smoothed values for historical data
        for (let i = 1; i < validData.length; i++) {
            forecast[i] = alpha * validData[i] + (1 - alpha) * forecast[i - 1];
        }
        
        // Project future values
        const lastValue = forecast[forecast.length - 1];
        const trend = this.calculateTrend(validData);
        
        for (let i = 0; i < periods; i++) {
            const projectedValue = lastValue * Math.pow(1 + trend, i + 1);
            forecast.push(isFinite(projectedValue) ? projectedValue : lastValue);
        }
        
        return forecast.slice(validData.length);
    }
    
    /**
     * Calculate trend from historical data
     */
    static calculateTrend(data) {
        if (!data || data.length < 2) return 0;
        
        // Filter valid numeric data
        const validData = data.filter(d => typeof d === 'number' && !isNaN(d) && isFinite(d));
        if (validData.length < 2) return 0;
        
        try {
            const xValues = Array.from({length: validData.length}, (_, i) => i);
            const regression = stats.linearRegression([xValues, validData]);
            
            const meanValue = stats.mean(validData);
            if (meanValue === 0) return 0;
            
            const trend = regression.m / meanValue;
            return isFinite(trend) ? trend : 0;
        } catch (error) {
            console.error('Error calculating trend:', error);
            return 0;
        }
    }
    
    /**
     * Monte Carlo simulation for runway scenarios
     */
    static monteCarloSimulation(params, iterations = 1000) {
        const results = [];
        
        for (let i = 0; i < iterations; i++) {
            const scenario = this.runSingleScenario(params);
            results.push(scenario);
        }
        
        // Calculate percentiles
        const runwayMonths = results.map(r => r.runwayMonths).sort((a, b) => a - b);
        
        return {
            p10: runwayMonths[Math.floor(iterations * 0.1)] || 0,
            p50: runwayMonths[Math.floor(iterations * 0.5)] || 0,
            p90: runwayMonths[Math.floor(iterations * 0.9)] || 0,
            mean: stats.mean(runwayMonths) || 0,
            stdDev: stats.standardDeviation(runwayMonths) || 0,
            scenarios: results
        };
    }
    
    /**
     * Run a single scenario with random variations
     */
    static runSingleScenario(params) {
        let cash = params.initialCash || 0;
        let month = 0;
        let monthlyBurn = params.monthlyBurn || 0;
        let monthlyRevenue = params.monthlyRevenue || 0;
        
        const burnGrowthRate = params.burnGrowthRate || 0;
        const revenueGrowthRate = params.revenueGrowthRate || 0;
        const variance = params.variance || 0.1;
        
        while (cash > 0 && month < 60) { // Max 60 months
            // Apply random variance
            const burnVariance = 1 + (Math.random() - 0.5) * 2 * variance;
            const revenueVariance = 1 + (Math.random() - 0.5) * 2 * variance;
            
            const actualBurn = monthlyBurn * burnVariance;
            const actualRevenue = monthlyRevenue * revenueVariance;
            
            cash = cash + actualRevenue - actualBurn;
            
            // Apply growth rates
            monthlyBurn *= (1 + burnGrowthRate);
            monthlyRevenue *= (1 + revenueGrowthRate);
            
            month++;
        }
        
        return {
            runwayMonths: month,
            finalCash: Math.max(0, cash),
            breakEven: monthlyRevenue >= monthlyBurn
        };
    }
    
    /**
     * Calculate fundraising probability based on multiple factors
     */
    static calculateFundraisingProbability(factors) {
        const weights = {
            burnRate: 0.25,
            growth: 0.20,
            marketConditions: 0.15,
            teamStrength: 0.15,
            productMarketFit: 0.15,
            revenue: 0.10  // Changed from previousRounds
        };
        
        let totalScore = 0;
        let totalWeight = 0;
        
        for (const [factor, score] of Object.entries(factors)) {
            if (weights[factor] && typeof score === 'number' && !isNaN(score)) {
                totalScore += score * weights[factor];
                totalWeight += weights[factor];
            }
        }
        
        return totalWeight > 0 ? totalScore / totalWeight : 0.5;
    }
    
    /**
     * Project cash flow with seasonality
     */
    static projectCashFlow(historicalData, periods = 12, seasonality = true) {
        if (!historicalData || historicalData.length === 0) {
            return Array(periods).fill({
                period: 0,
                revenue: 0,
                expenses: 0,
                netCashFlow: 0,
                confidence: 0.5
            }).map((item, index) => ({...item, period: index + 1}));
        }
        
        const projections = [];
        
        // Extract trends
        const revenues = historicalData.map(d => d.revenue || 0);
        const expenses = historicalData.map(d => d.expenses || 0);
        
        const revenueTrend = this.calculateTrend(revenues);
        const expenseTrend = this.calculateTrend(expenses);
        
        // Calculate seasonality factors if enabled
        const seasonalFactors = seasonality ? this.calculateSeasonality(historicalData) : null;
        
        // Base values (last known values)
        let baseRevenue = revenues[revenues.length - 1] || 0;
        let baseExpenses = expenses[expenses.length - 1] || 0;
        
        for (let i = 0; i < periods; i++) {
            const monthIndex = (historicalData.length + i) % 12;
            const seasonalFactor = seasonalFactors ? seasonalFactors[monthIndex] : 1;
            
            const projectedRevenue = baseRevenue * (1 + revenueTrend) * seasonalFactor;
            const projectedExpenses = baseExpenses * (1 + expenseTrend);
            
            projections.push({
                period: i + 1,
                revenue: isFinite(projectedRevenue) ? projectedRevenue : baseRevenue,
                expenses: isFinite(projectedExpenses) ? projectedExpenses : baseExpenses,
                netCashFlow: projectedRevenue - projectedExpenses,
                confidence: Math.max(0.5, 1 - (i * 0.03)) // Confidence decreases over time
            });
            
            baseRevenue = projectedRevenue;
            baseExpenses = projectedExpenses;
        }
        
        return projections;
    }
    
    /**
     * Calculate seasonality factors from historical data
     */
    static calculateSeasonality(data) {
        if (!data || data.length === 0) {
            return Array(12).fill(1);
        }
        
        const monthlyAverages = Array(12).fill(0);
        const monthlyCounts = Array(12).fill(0);
        
        data.forEach(item => {
            if (item.date) {
                const month = moment(item.date).month();
                monthlyAverages[month] += item.revenue || 0;
                monthlyCounts[month]++;
            }
        });
        
        // Calculate average for each month
        for (let i = 0; i < 12; i++) {
            if (monthlyCounts[i] > 0) {
                monthlyAverages[i] /= monthlyCounts[i];
            }
        }
        
        // Calculate overall average
        const validAverages = monthlyAverages.filter(a => a > 0);
        if (validAverages.length === 0) {
            return Array(12).fill(1);
        }
        
        const overallAverage = stats.mean(validAverages);
        
        // Calculate seasonality factors
        return monthlyAverages.map(avg => 
            avg > 0 && overallAverage > 0 ? avg / overallAverage : 1
        );
    }
    
    /**
     * Cohort retention projection using power law
     */
    static projectCohortRetention(initialUsers, historicalRetention, projectionMonths) {
        if (!initialUsers || initialUsers <= 0 || !historicalRetention || historicalRetention.length === 0) {
            return Array(projectionMonths).fill({
                month: 0,
                retention: 0,
                activeUsers: 0,
                churnedUsers: initialUsers || 0
            }).map((item, index) => ({...item, month: index}));
        }
        
        try {
            // Filter valid retention rates
            const validRetention = historicalRetention.filter(r => 
                typeof r === 'number' && !isNaN(r) && r > 0 && r <= 1
            );
            
            if (validRetention.length < 2) {
                // Not enough data for regression, use simple decay
                const projections = [];
                const decayRate = validRetention[0] || 0.5;
                
                for (let month = 0; month < projectionMonths; month++) {
                    const retention = month === 0 ? 1 : decayRate * Math.pow(0.9, month - 1);
                    const activeUsers = Math.round(initialUsers * Math.max(0, Math.min(1, retention)));
                    
                    projections.push({
                        month,
                        retention: Math.max(0, Math.min(1, retention)),
                        activeUsers,
                        churnedUsers: initialUsers - activeUsers
                    });
                }
                
                return projections;
            }
            
            // Fit power law: retention = a * t^b
            const periods = validRetention.map((_, i) => i + 1);
            const logPeriods = periods.map(p => Math.log(p));
            const logRetention = validRetention.map(r => Math.log(r));
            
            const regression = stats.linearRegression([logPeriods, logRetention]);
            const a = Math.exp(regression.b);
            const b = regression.m;
            
            const projections = [];
            
            for (let month = 0; month < projectionMonths; month++) {
                const retention = month === 0 ? 1 : a * Math.pow(month, b);
                const safeRetention = Math.max(0, Math.min(1, isFinite(retention) ? retention : 0));
                const activeUsers = Math.round(initialUsers * safeRetention);
                
                projections.push({
                    month,
                    retention: safeRetention,
                    activeUsers,
                    churnedUsers: initialUsers - activeUsers
                });
            }
            
            return projections;
        } catch (error) {
            console.error('Error in projectCohortRetention:', error);
            // Return simple decay on error
            return Array(projectionMonths).fill(null).map((_, month) => ({
                month,
                retention: Math.pow(0.8, month),
                activeUsers: Math.round(initialUsers * Math.pow(0.8, month)),
                churnedUsers: initialUsers - Math.round(initialUsers * Math.pow(0.8, month))
            }));
        }
    }
    
    /**
     * Calculate cohort LTV with confidence intervals
     */
    static calculateCohortLTV(cohortData, discountRate = 0.1) {
        try {
            // Validate input
            if (!cohortData || !cohortData.metrics || cohortData.metrics.length === 0) {
                return {
                    ltv: 0,
                    ltvPerUser: 0,
                    paybackPeriod: null,
                    confidence: 0
                };
            }
            
            const initialUsers = cohortData.initialUsers || 0;
            if (initialUsers === 0) {
                return {
                    ltv: 0,
                    ltvPerUser: 0,
                    paybackPeriod: null,
                    confidence: 0
                };
            }
            
            // Extract and validate data
            const monthlyRevenues = cohortData.metrics.map(m => {
                const revenue = m.revenue || 0;
                return isFinite(revenue) ? revenue : 0;
            });
            
            const activeUsers = cohortData.metrics.map(m => {
                const users = m.activeUsers || 0;
                return isFinite(users) ? users : 0;
            });
            
            // Check if we have any valid data
            const hasRevenue = monthlyRevenues.some(r => r > 0);
            const hasUsers = activeUsers.some(u => u > 0);
            
            if (!hasRevenue || !hasUsers) {
                return {
                    ltv: 0,
                    ltvPerUser: 0,
                    paybackPeriod: null,
                    confidence: 0
                };
            }
            
            // Calculate average revenue per user for each period
            const arpu = monthlyRevenues.map((rev, i) => {
                if (activeUsers[i] > 0 && isFinite(rev)) {
                    return rev / activeUsers[i];
                }
                return 0;
            });
            
            // Filter out invalid ARPU values
            const validArpu = arpu.filter(a => isFinite(a) && a >= 0);
            if (validArpu.length === 0) {
                return {
                    ltv: 0,
                    ltvPerUser: 0,
                    paybackPeriod: null,
                    confidence: 0
                };
            }
            
            // Project future ARPU
            const projectedARPU = this.exponentialSmoothing(arpu, 0.3, 24);
            
            // Project future retention
            const retentionRates = activeUsers.map(users => {
                const rate = users / initialUsers;
                return isFinite(rate) ? Math.max(0, Math.min(1, rate)) : 0;
            });
            
            const projectedRetention = this.projectCohortRetention(
                initialUsers,
                retentionRates,
                24
            );
            
            // Calculate LTV with NPV
            let ltv = 0;
            const allARPU = [...arpu, ...projectedARPU];
            
            for (let i = 0; i < Math.min(allARPU.length, projectedRetention.length); i++) {
                const discountFactor = Math.pow(1 + discountRate / 12, -i);
                const monthlyValue = allARPU[i] * projectedRetention[i].retention;
                
                if (isFinite(monthlyValue) && isFinite(discountFactor)) {
                    ltv += monthlyValue * discountFactor;
                }
            }
            
            // Ensure ltv is valid
            if (!isFinite(ltv)) {
                ltv = 0;
            }
            
            const totalLTV = ltv * initialUsers;
            const paybackPeriod = this.calculatePaybackPeriod(cohortData, ltv);
            const confidence = this.calculateLTVConfidence(cohortData);
            
            return {
                ltv: isFinite(totalLTV) ? totalLTV : 0,
                ltvPerUser: isFinite(ltv) ? ltv : 0,
                paybackPeriod: isFinite(paybackPeriod) && paybackPeriod !== Infinity ? paybackPeriod : null,
                confidence: isFinite(confidence) ? confidence : 0
            };
        } catch (error) {
            console.error('Error in calculateCohortLTV:', error);
            return {
                ltv: 0,
                ltvPerUser: 0,
                paybackPeriod: null,
                confidence: 0
            };
        }
    }
    
    /**
     * Calculate payback period for CAC
     */
    static calculatePaybackPeriod(cohortData, ltvPerUser) {
        try {
            const cac = cohortData.averageCAC || 0;
            if (cac === 0) return 0;
            
            let cumulativeRevenue = 0;
            let month = 0;
            
            for (const metric of cohortData.metrics) {
                if (metric.activeUsers > 0 && metric.revenue > 0) {
                    const revenuePerUser = metric.revenue / metric.activeUsers;
                    if (isFinite(revenuePerUser)) {
                        cumulativeRevenue += revenuePerUser;
                        month++;
                        
                        if (cumulativeRevenue >= cac) {
                            return month;
                        }
                    }
                }
            }
            
            // If not paid back yet, project
            const validMetrics = cohortData.metrics.filter(m => 
                m.activeUsers > 0 && m.revenue > 0
            );
            
            if (validMetrics.length > 0) {
                const arpuValues = validMetrics.map(m => m.revenue / m.activeUsers)
                    .filter(a => isFinite(a));
                
                if (arpuValues.length > 0) {
                    const avgARPU = stats.mean(arpuValues);
                    
                    if (avgARPU > 0 && isFinite(avgARPU)) {
                        const remainingMonths = Math.ceil((cac - cumulativeRevenue) / avgARPU);
                        if (isFinite(remainingMonths) && remainingMonths > 0) {
                            return month + remainingMonths;
                        }
                    }
                }
            }
            
            return null; // Cannot calculate payback
        } catch (error) {
            console.error('Error in calculatePaybackPeriod:', error);
            return null;
        }
    }
    
    /**
     * Calculate confidence level for LTV prediction
     */
    static calculateLTVConfidence(cohortData) {
        try {
            const validMetrics = cohortData.metrics.filter(m => 
                m.revenue > 0 && isFinite(m.revenue)
            );
            
            const dataPoints = validMetrics.length;
            if (dataPoints === 0) return 0;
            
            const consistency = this.calculateDataConsistency(
                validMetrics.map(m => m.revenue)
            );
            
            // Base confidence on data points and consistency
            const dataConfidence = Math.min(1, dataPoints / 12); // Full confidence at 12 months
            const consistencyConfidence = isFinite(consistency) ? consistency : 0.5;
            
            const confidence = (dataConfidence * 0.6 + consistencyConfidence * 0.4);
            return isFinite(confidence) ? confidence : 0;
        } catch (error) {
            console.error('Error in calculateLTVConfidence:', error);
            return 0;
        }
    }
    
    /**
     * Calculate data consistency (inverse of coefficient of variation)
     */
    static calculateDataConsistency(data) {
        try {
            const validData = data.filter(d => 
                typeof d === 'number' && isFinite(d) && d > 0
            );
            
            if (validData.length < 2) return 0.5;
            
            const mean = stats.mean(validData);
            if (mean === 0) return 0;
            
            const stdDev = stats.standardDeviation(validData);
            const cv = stdDev / mean;
            
            const consistency = 1 - cv;
            return Math.max(0, Math.min(1, isFinite(consistency) ? consistency : 0.5));
        } catch (error) {
            console.error('Error in calculateDataConsistency:', error);
            return 0.5;
        }
    }
}

module.exports = PredictionAlgorithms;