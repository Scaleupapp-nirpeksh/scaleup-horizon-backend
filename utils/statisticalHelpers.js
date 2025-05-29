// utils/statisticalHelpers.js
const stats = require('simple-statistics');

/**
 * Memoization helper for expensive calculations
 * @param {Function} fn - Function to memoize
 * @returns {Function} Memoized function
 */
const memoize = (fn) => {
    const cache = new Map();
    return (...args) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) return cache.get(key);
        const result = fn(...args);
        cache.set(key, result);
        return result;
    };
};

class StatisticalHelpers {
    /**
     * Default configurations for statistical methods
     */
    static defaultConfigs = {
        confidenceLevel: 0.95,
        anomalyThreshold: 1.5,
        movingAverageWeights: [0.1, 0.2, 0.3, 0.4],
        smoothingWindow: 5,
        polynomialOrder: 2
    };

    /**
     * Update default configuration
     * @param {string} configKey - Configuration key to update
     * @param {any} value - New configuration value
     * @returns {boolean} Success status
     */
    static setDefaultConfig(configKey, value) {
        if (this.defaultConfigs.hasOwnProperty(configKey)) {
            this.defaultConfigs[configKey] = value;
            return true;
        }
        return false;
    }

    /**
     * Calculate confidence intervals for a dataset
     * @param {number[]} data - Array of numeric values
     * @param {number} confidence - Confidence level (0.90, 0.95, or 0.99)
     * @returns {Object} Object containing mean, lower bound, upper bound, and margin of error
     * @example
     * // Returns {mean: 10, lower: 8.5, upper: 11.5, marginOfError: 1.5}
     * confidenceInterval([8, 9, 10, 11, 12], 0.95)
     */
    static confidenceInterval(data, confidence = this.defaultConfigs.confidenceLevel) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }
        if (confidence < 0 || confidence > 1) {
            throw new Error('Confidence must be between 0 and 1');
        }

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
            marginOfError,
            sampleSize: n,
            confidenceLevel: confidence
        };
    }
    
    /**
     * Detect anomalies using IQR method
     * @param {number[]} data - Dataset to analyze for anomalies
     * @param {number} threshold - Multiplier for IQR to define anomaly boundaries (default: 1.5)
     * @returns {Array<Object>} Array of objects with value, anomaly status, and boundaries
     */
    static detectAnomalies(data, threshold = this.defaultConfigs.anomalyThreshold) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }
        
        // Calculate quantiles once and store for performance
        const sortedData = [...data].sort((a, b) => a - b);
        const q1 = stats.quantile(sortedData, 0.25);
        const q3 = stats.quantile(sortedData, 0.75);
        const iqr = q3 - q1;
        
        const lowerBound = q1 - threshold * iqr;
        const upperBound = q3 + threshold * iqr;
        
        return data.map((value, index) => ({
            index,
            value,
            isAnomaly: value < lowerBound || value > upperBound,
            bounds: { lower: lowerBound, upper: upperBound }
        }));
    }
    
    /**
     * Calculate growth rates between consecutive periods
     * @param {number[]} data - Time series data
     * @returns {Object} Object with rates array and summary statistics
     */
    static calculateGrowthRates(data) {
        if (!Array.isArray(data) || data.length <= 1) {
            throw new Error('Data must be an array with at least two elements');
        }
        
        const rates = [];
        const percentages = [];
        
        for (let i = 1; i < data.length; i++) {
            if (data[i - 1] !== 0) {
                const rate = (data[i] - data[i - 1]) / data[i - 1];
                rates.push(rate);
                percentages.push(rate * 100);
            } else {
                rates.push(null);
                percentages.push(null);
            }
        }
        
        // Filter out null values for calculations
        const validRates = rates.filter(r => r !== null);
        
        return {
            rates,
            percentages,
            average: validRates.length > 0 ? stats.mean(validRates) : 0,
            median: validRates.length > 0 ? stats.median(validRates) : 0,
            volatility: validRates.length > 0 ? stats.standardDeviation(validRates) : 0,
            min: validRates.length > 0 ? Math.min(...validRates) : 0,
            max: validRates.length > 0 ? Math.max(...validRates) : 0
        };
    }
    
    /**
     * Calculate weighted moving average for time series data
     * @param {number[]} data - Time series data
     * @param {number[]} weights - Array of weights (should sum to 1)
     * @returns {number|null} Weighted average or null if insufficient data
     */
    static weightedMovingAverage(data, weights = this.defaultConfigs.movingAverageWeights) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }
        if (!Array.isArray(weights) || weights.length === 0) {
            throw new Error('Weights must be a non-empty array');
        }
        if (data.length < weights.length) return null;
        
        // Normalize weights if they don't sum to 1
        const weightSum = weights.reduce((sum, w) => sum + w, 0);
        const normalizedWeights = weightSum !== 1 
            ? weights.map(w => w / weightSum) 
            : weights;
        
        const recentData = data.slice(-normalizedWeights.length);
        let weightedSum = 0;
        
        for (let i = 0; i < normalizedWeights.length; i++) {
            weightedSum += recentData[i] * normalizedWeights[i];
        }
        
        return weightedSum;
    }
    
    /**
     * Calculate correlation between two data series
     * @param {number[]} series1 - First data series
     * @param {number[]} series2 - Second data series
     * @returns {number|null} Correlation coefficient or null if invalid input
     */
    static correlation(series1, series2) {
        if (!Array.isArray(series1) || !Array.isArray(series2)) {
            throw new Error('Both series must be arrays');
        }
        if (series1.length !== series2.length) {
            throw new Error('Series must have the same length');
        }
        if (series1.length === 0) {
            throw new Error('Series cannot be empty');
        }
        
        try {
            return stats.sampleCorrelation(series1, series2);
        } catch (error) {
            console.error('Error calculating correlation:', error.message);
            return null;
        }
    }
    
    /**
     * Memoized version of correlation calculation for performance
     */
    static memoizedCorrelation = memoize(StatisticalHelpers.correlation);
    
    /**
     * Calculate forecast accuracy metrics
     * @param {number[]} actual - Actual values
     * @param {number[]} predicted - Predicted values
     * @returns {Object|null} Object with accuracy metrics or null if invalid input
     */
    static calculateAccuracyMetrics(actual, predicted) {
        if (!Array.isArray(actual) || !Array.isArray(predicted)) {
            throw new Error('Both actual and predicted must be arrays');
        }
        if (actual.length !== predicted.length) {
            throw new Error('Actual and predicted must have the same length');
        }
        if (actual.length === 0) {
            throw new Error('Data arrays cannot be empty');
        }
        
        try {
            // Mean Absolute Error
            const mae = stats.mean(
                actual.map((a, i) => Math.abs(a - predicted[i]))
            );
            
            // Mean Absolute Percentage Error
            const mapeValues = actual.map((a, i) => 
                a !== 0 ? Math.abs((a - predicted[i]) / a) : null
            ).filter(v => v !== null);
            
            const mape = mapeValues.length > 0 
                ? stats.mean(mapeValues) * 100 
                : null;
            
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
            const r2 = ssTotal !== 0 ? 1 - (ssResidual / ssTotal) : null;
            
            // Theil's U statistic (forecast accuracy)
            const changes = {
                actual: actual.slice(1).map((val, i) => val - actual[i]),
                predicted: predicted.slice(1).map((val, i) => val - predicted[i])
            };
            
            const sumSquaredActualChanges = stats.sum(
                changes.actual.map(c => Math.pow(c, 2))
            );
            
            const sumSquaredForecastErrors = stats.sum(
                changes.actual.map((a, i) => Math.pow(a - changes.predicted[i], 2))
            );
            
            const theilsU = Math.sqrt(sumSquaredForecastErrors / sumSquaredActualChanges);
            
            return { mae, mape, rmse, r2, theilsU };
        } catch (error) {
            console.error('Error calculating accuracy metrics:', error.message);
            return null;
        }
    }
    
    /**
     * Smooth noisy data using a moving average window
     * @param {number[]} data - Data to smooth
     * @param {number} windowSize - Size of the smoothing window (should be odd)
     * @returns {number[]} Smoothed data
     */
    static smoothData(data, windowSize = this.defaultConfigs.smoothingWindow) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }
        
        // Ensure window size is valid
        windowSize = Math.max(1, Math.min(windowSize, data.length));
        
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
     * Improved Savitzky-Golay filter implementation for data smoothing
     * @param {number[]} data - Data to smooth
     * @param {number} windowSize - Size of the smoothing window (must be odd)
     * @param {number} polynomialOrder - Order of the fitting polynomial
     * @returns {number[]} Smoothed data
     */
    static improvedSmoothData(data, windowSize = this.defaultConfigs.smoothingWindow, 
                             polynomialOrder = this.defaultConfigs.polynomialOrder) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }
        
        // Ensure window size is odd
        windowSize = windowSize % 2 === 0 ? windowSize + 1 : windowSize;
        
        if (windowSize < 3 || polynomialOrder >= windowSize) {
            throw new Error('Invalid parameters: window size must be >= 3 and polynomial order < window size');
        }
        
        // For a full implementation, we would use matrix operations for polynomial fitting
        // This is a simplified version that falls back to the simple moving average
        if (polynomialOrder > 1) {
            console.warn('Full Savitzky-Golay implementation not available, using moving average');
        }
        
        return this.smoothData(data, windowSize);
    }
    
    /**
     * Calculate percentiles for scenario analysis
     * @param {number[]} simulations - Array of simulation results
     * @returns {Object} Object with various percentiles and statistics
     */
    static calculateScenarios(simulations) {
        if (!Array.isArray(simulations) || simulations.length === 0) {
            throw new Error('Simulations must be a non-empty array');
        }
        
        const sorted = [...simulations].sort((a, b) => a - b);
        
        return {
            worst: stats.min(sorted),
            p5: stats.quantile(sorted, 0.05),
            p10: stats.quantile(sorted, 0.10),
            p25: stats.quantile(sorted, 0.25),
            median: stats.median(sorted),
            p75: stats.quantile(sorted, 0.75),
            p90: stats.quantile(sorted, 0.90),
            p95: stats.quantile(sorted, 0.95),
            best: stats.max(sorted),
            mean: stats.mean(sorted),
            stdDev: stats.standardDeviation(sorted),
            skewness: this.calculateSkewness(sorted),
            kurtosis: this.calculateKurtosis(sorted),
            sampleSize: sorted.length
        };
    }
    
    /**
     * Calculate skewness of a distribution
     * @param {number[]} data - Dataset
     * @returns {number} Skewness value
     */
    static calculateSkewness(data) {
        if (data.length < 3) return 0;
        
        const n = data.length;
        const mean = stats.mean(data);
        const stdDev = stats.standardDeviation(data);
        
        if (stdDev === 0) return 0;
        
        const sum = data.reduce((acc, val) => 
            acc + Math.pow((val - mean) / stdDev, 3), 0);
        
        return (n / ((n - 1) * (n - 2))) * sum;
    }
    
    /**
     * Calculate kurtosis of a distribution
     * @param {number[]} data - Dataset
     * @returns {number} Kurtosis value
     */
    static calculateKurtosis(data) {
        if (data.length < 4) return 0;
        
        const n = data.length;
        const mean = stats.mean(data);
        const stdDev = stats.standardDeviation(data);
        
        if (stdDev === 0) return 0;
        
        const sum = data.reduce((acc, val) => 
            acc + Math.pow((val - mean) / stdDev, 4), 0);
        
        return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum - 
            (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    }
    
    /**
     * Detect seasonality in time series data
     * @param {number[]} data - Time series data
     * @param {number} maxLag - Maximum lag to test
     * @returns {Object} Detected period and autocorrelation values
     */
    static detectSeasonality(data, maxLag = Math.floor(data.length / 4)) {
        if (!Array.isArray(data) || data.length < 4) {
            throw new Error('Data must be an array with at least 4 elements');
        }
        
        maxLag = Math.min(maxLag, Math.floor(data.length / 2));
        const results = [];
        const mean = stats.mean(data);
        
        // Calculate autocorrelation for different lags
        for (let lag = 1; lag <= maxLag; lag++) {
            let numerator = 0;
            let denominator = 0;
            
            for (let i = 0; i < data.length - lag; i++) {
                numerator += (data[i] - mean) * (data[i + lag] - mean);
                denominator += Math.pow(data[i] - mean, 2);
            }
            
            const acf = denominator !== 0 ? numerator / denominator : 0;
            results.push({ lag, acf });
        }
        
        // Find potential seasonality periods (peaks in autocorrelation)
        const peaks = results.filter((r, i) => 
            i > 0 && i < results.length - 1 && 
            r.acf > results[i-1].acf && 
            r.acf > results[i+1].acf &&
            r.acf > 0.2  // Threshold to be considered significant
        );
        
        return {
            results,
            potentialPeriods: peaks.sort((a, b) => b.acf - a.acf),
            seasonalityDetected: peaks.length > 0,
            primaryPeriod: peaks.length > 0 ? peaks[0].lag : null
        };
    }
    
    /**
     * Validate numerical data and handle missing values
     * @param {Array} data - Data to validate
     * @param {Object} options - Validation options
     * @returns {Object} Cleaned data and validation report
     */
    static validateData(data, options = {}) {
        if (!Array.isArray(data)) {
            throw new Error('Data must be an array');
        }
        
        const defaults = {
            removeNaN: true,
            removeInfinity: true,
            removeOutliers: false,
            outlierThreshold: this.defaultConfigs.anomalyThreshold,
            interpolateMissing: false
        };
        
        const config = { ...defaults, ...options };
        const report = {
            originalLength: data.length,
            nanCount: 0,
            infinityCount: 0,
            outlierCount: 0,
            missingValues: [],
            cleanedData: []
        };
        
        // Initial filtering
        let cleaned = [];
        let nanIndices = [];
        
        data.forEach((val, i) => {
            if (Number.isNaN(val)) {
                report.nanCount++;
                nanIndices.push(i);
                if (!config.removeNaN) cleaned.push(val);
            } else if (!Number.isFinite(val)) {
                report.infinityCount++;
                if (!config.removeInfinity) cleaned.push(val);
            } else {
                cleaned.push(val);
            }
        });
        
        report.missingValues = nanIndices;
        
        // Handle outliers if requested
        if (config.removeOutliers) {
            const validValues = cleaned.filter(val => !Number.isNaN(val) && Number.isFinite(val));
            const anomalies = this.detectAnomalies(validValues, config.outlierThreshold);
            
            const cleanedWithoutOutliers = [];
            let outlierCount = 0;
            
            cleaned.forEach((val, i) => {
                const validIndex = validValues.indexOf(val);
                if (validIndex !== -1 && anomalies[validIndex].isAnomaly) {
                    outlierCount++;
                } else {
                    cleanedWithoutOutliers.push(val);
                }
            });
            
            report.outlierCount = outlierCount;
            cleaned = cleanedWithoutOutliers;
        }
        
        // Interpolate missing values if requested
        if (config.interpolateMissing && nanIndices.length > 0 && data.length > nanIndices.length) {
            // Simple linear interpolation
            const interpolated = [...data];
            
            nanIndices.forEach(index => {
                // Find nearest non-NaN values before and after
                let before = index - 1;
                while (before >= 0 && (Number.isNaN(data[before]) || !Number.isFinite(data[before]))) {
                    before--;
                }
                
                let after = index + 1;
                while (after < data.length && (Number.isNaN(data[after]) || !Number.isFinite(data[after]))) {
                    after++;
                }
                
                // Interpolate if we found valid values on both sides
                if (before >= 0 && after < data.length) {
                    const beforeVal = data[before];
                    const afterVal = data[after];
                    const ratio = (index - before) / (after - before);
                    interpolated[index] = beforeVal + ratio * (afterVal - beforeVal);
                }
                // If only one side has valid values, use that
                else if (before >= 0) {
                    interpolated[index] = data[before];
                }
                else if (after < data.length) {
                    interpolated[index] = data[after];
                }
            });
            
            report.interpolatedData = interpolated;
        }
        
        report.cleanedData = cleaned;
        report.finalLength = cleaned.length;
        
        return report;
    }
    
    /**
     * Calculate exponential moving average
     * @param {number[]} data - Time series data
     * @param {number} alpha - Smoothing factor (0 < alpha < 1)
     * @returns {number[]} EMA values
     */
    static calculateEMA(data, alpha = 0.2) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Data must be a non-empty array');
        }
        if (alpha <= 0 || alpha >= 1) {
            throw new Error('Alpha must be between 0 and 1');
        }
        
        const ema = [data[0]];
        
        for (let i = 1; i < data.length; i++) {
            ema.push(alpha * data[i] + (1 - alpha) * ema[i-1]);
        }
        
        return ema;
    }
    
    /**
     * Perform linear regression analysis
     * @param {number[]} x - Independent variable values
     * @param {number[]} y - Dependent variable values
     * @returns {Object} Regression results including slope, intercept, and statistics
     */
    static linearRegression(x, y) {
        if (!Array.isArray(x) || !Array.isArray(y)) {
            throw new Error('Both x and y must be arrays');
        }
        if (x.length !== y.length) {
            throw new Error('x and y must have the same length');
        }
        if (x.length < 2) {
            throw new Error('Need at least two data points for regression');
        }
        
        try {
            const regression = stats.linearRegression(x.map((xi, i) => [xi, y[i]]));
            const slope = regression.m;
            const intercept = regression.b;
            
            // Calculate predicted values
            const predicted = x.map(xi => slope * xi + intercept);
            
            // Calculate R-squared
            const yMean = stats.mean(y);
            const ssTotal = stats.sum(y.map(yi => Math.pow(yi - yMean, 2)));
            const ssResidual = stats.sum(y.map((yi, i) => Math.pow(yi - predicted[i], 2)));
            const rSquared = 1 - (ssResidual / ssTotal);
            
            // Calculate standard error of the slope
            const n = x.length;
            const xMean = stats.mean(x);
            const sumSquaredXDiff = stats.sum(x.map(xi => Math.pow(xi - xMean, 2)));
            const stdErrorSlope = Math.sqrt(ssResidual / (n - 2)) / Math.sqrt(sumSquaredXDiff);
            
            // Calculate t-statistic and p-value for slope
            const tStat = slope / stdErrorSlope;
            // p-value calculation would require t-distribution implementation
            // Using approximate values for demo purposes
            let pValue = null;
            if (Math.abs(tStat) > 2.576) pValue = 0.01;
            else if (Math.abs(tStat) > 1.96) pValue = 0.05;
            else if (Math.abs(tStat) > 1.645) pValue = 0.10;
            else pValue = 0.20;
            
            return {
                slope,
                intercept,
                rSquared,
                predicted,
                residuals: y.map((yi, i) => yi - predicted[i]),
                stdErrorSlope,
                tStatistic: tStat,
                pValue,
                n
            };
        } catch (error) {
            console.error('Error performing linear regression:', error.message);
            return null;
        }
    }
}

module.exports = StatisticalHelpers;