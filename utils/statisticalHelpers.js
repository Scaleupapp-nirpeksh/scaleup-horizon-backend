// utils/statisticalHelpers.js
const stats = require('simple-statistics');

class StatisticalHelpers {
    /**
     * Calculate confidence intervals
     */
    static confidenceInterval(data, confidence = 0.95) {
        const mean = stats.mean(data);
        const stdDev = stats.standardDeviation(data);
        const n = data.length;
        
        // Z-score for confidence level
        const zScores = {
            0.90: 1.645,
            0.95: 1.96,
            0.99: 2.576
        };
        
        const z = zScores[confidence] || 1.96;
        const marginOfError = z * (stdDev / Math.sqrt(n));
        
        return {
            mean,
            lower: mean - marginOfError,
            upper: mean + marginOfError,
            marginOfError
        };
    }
    
    /**
     * Detect anomalies using IQR method
     */
    static detectAnomalies(data) {
        const q1 = stats.quantile(data, 0.25);
        const q3 = stats.quantile(data, 0.75);
        const iqr = q3 - q1;
        
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        
        return data.map((value, index) => ({
            index,
            value,
            isAnomaly: value < lowerBound || value > upperBound,
            bounds: { lower: lowerBound, upper: upperBound }
        }));
    }
    
    /**
     * Calculate growth rates between periods
     */
    static calculateGrowthRates(data) {
        const rates = [];
        
        for (let i = 1; i < data.length; i++) {
            if (data[i - 1] !== 0) {
                rates.push((data[i] - data[i - 1]) / data[i - 1]);
            }
        }
        
        return {
            rates,
            average: rates.length > 0 ? stats.mean(rates) : 0,
            median: rates.length > 0 ? stats.median(rates) : 0,
            volatility: rates.length > 0 ? stats.standardDeviation(rates) : 0
        };
    }
    
    /**
     * Weighted moving average
     */
    static weightedMovingAverage(data, weights = [0.1, 0.2, 0.3, 0.4]) {
        if (data.length < weights.length) return null;
        
        const recentData = data.slice(-weights.length);
        let weightedSum = 0;
        let weightSum = 0;
        
        for (let i = 0; i < weights.length; i++) {
            weightedSum += recentData[i] * weights[i];
            weightSum += weights[i];
        }
        
        return weightedSum / weightSum;
    }
    
    /**
     * Calculate correlation between two series
     */
    static correlation(series1, series2) {
        if (series1.length !== series2.length || series1.length === 0) {
            return null;
        }
        
        return stats.sampleCorrelation(series1, series2);
    }
    
    /**
     * Forecast accuracy metrics
     */
    static calculateAccuracyMetrics(actual, predicted) {
        if (actual.length !== predicted.length || actual.length === 0) {
            return null;
        }
        
        // Mean Absolute Error
        const mae = stats.mean(
            actual.map((a, i) => Math.abs(a - predicted[i]))
        );
        
        // Mean Absolute Percentage Error
        const mape = stats.mean(
            actual.map((a, i) => 
                a !== 0 ? Math.abs((a - predicted[i]) / a) : 0
            )
        ) * 100;
        
        // Root Mean Square Error
        const rmse = Math.sqrt(
            stats.mean(
                actual.map((a, i) => Math.pow(a - predicted[i], 2))
            )
        );
        
        // R-squared
        const actualMean = stats.mean(actual);
        const ssTotal = stats.sum(actual.map(a => Math.pow(a - actualMean, 2)));
        const ssResidual = stats.sum(
            actual.map((a, i) => Math.pow(a - predicted[i], 2))
        );
        const r2 = 1 - (ssResidual / ssTotal);
        
        return { mae, mape, rmse, r2 };
    }
    
    /**
     * Smooth noisy data using Savitzky-Golay filter
     */
    static smoothData(data, windowSize = 5) {
        const smoothed = [];
        const halfWindow = Math.floor(windowSize / 2);
        
        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - halfWindow);
            const end = Math.min(data.length, i + halfWindow + 1);
            const window = data.slice(start, end);
            
            smoothed.push(stats.mean(window));
        }
        
        return smoothed;
    }
    
    /**
     * Calculate percentiles for scenario analysis
     */
    static calculateScenarios(simulations) {
        const sorted = simulations.sort((a, b) => a - b);
        
        return {
            worst: stats.min(sorted),
            p10: stats.quantile(sorted, 0.10),
            p25: stats.quantile(sorted, 0.25),
            median: stats.median(sorted),
            p75: stats.quantile(sorted, 0.75),
            p90: stats.quantile(sorted, 0.90),
            best: stats.max(sorted),
            mean: stats.mean(sorted),
            stdDev: stats.standardDeviation(sorted)
        };
    }
}

module.exports = StatisticalHelpers;