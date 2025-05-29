// services/advancedMLService.js
const tf = require('@tensorflow/tfjs-node');
const natural = require('natural');
const stats = require('simple-statistics');
const moment = require('moment');
const mongoose = require('mongoose');

class AdvancedMLService {
    constructor() {
        // Store models per organization for better isolation
        this.organizationModels = new Map(); // organizationId -> models Map
        this.globalModels = new Map(); // Shared base models
        this.isInitialized = false;
        this.initialize();
    }

    async initialize() {
        if (this.isInitialized) return;
        
        // Initialize global base models
        await this.initializeGlobalModels();
        
        this.isInitialized = true;
    }

    async initializeGlobalModels() {
        // Initialize base models that can be fine-tuned per organization
        await this.initializeExpensePredictor();
        await this.initializeRevenueForecaster();
        await this.initializeAnomalyDetector();
        await this.initializeChurnPredictor();
        await this.initializeCashFlowOptimizer();
    }

    // Get or create organization-specific models
    getOrganizationModels(organizationId) {
        if (!this.organizationModels.has(organizationId)) {
            this.organizationModels.set(organizationId, new Map());
        }
        return this.organizationModels.get(organizationId);
    }

    // 1. Expense Prediction Model
    async initializeExpensePredictor() {
        try {
            // Create a neural network for expense prediction
            const model = tf.sequential({
                layers: [
                    tf.layers.dense({ inputShape: [10], units: 64, activation: 'relu' }),
                    tf.layers.dropout({ rate: 0.2 }),
                    tf.layers.dense({ units: 32, activation: 'relu' }),
                    tf.layers.dropout({ rate: 0.2 }),
                    tf.layers.dense({ units: 16, activation: 'relu' }),
                    tf.layers.dense({ units: 1, activation: 'linear' })
                ]
            });

            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'meanSquaredError',
                metrics: ['mae']
            });

            this.globalModels.set('expensePredictor', model);
        } catch (error) {
            console.error('Error initializing expense predictor:', error);
        }
    }

    // Train expense predictor with historical data - NOW ORGANIZATION-SPECIFIC
    async trainExpensePredictor(organizationId) {
        const Expense = mongoose.model('Expense');
        
        // Get historical expenses FOR THIS ORGANIZATION
        const expenses = await Expense.find({ organization: organizationId })
            .sort({ date: 1 })
            .limit(1000);

        if (expenses.length < 100) {
            console.log(`Insufficient data for training expense predictor for organization ${organizationId}`);
            return;
        }

        // Prepare training data
        const features = [];
        const labels = [];

        for (let i = 30; i < expenses.length; i++) {
            // Features: last 30 days of expenses aggregated by category
            const last30Days = expenses.slice(i - 30, i);
            const categoryTotals = this.aggregateByCategory(last30Days);
            const dayOfMonth = moment(expenses[i].date).date();
            const monthOfYear = moment(expenses[i].date).month();
            const dayOfWeek = moment(expenses[i].date).day();
            
            const feature = [
                categoryTotals['Tech Infrastructure'] || 0,
                categoryTotals['Marketing & Sales'] || 0,
                categoryTotals['Salaries & Wages'] || 0,
                categoryTotals['Software & Subscriptions'] || 0,
                categoryTotals['Legal & Professional'] || 0,
                categoryTotals['Rent & Utilities'] || 0,
                categoryTotals['Other'] || 0,
                dayOfMonth / 31, // Normalize
                monthOfYear / 12,
                dayOfWeek / 7
            ];

            features.push(feature);
            labels.push(expenses[i].amount);
        }

        // Convert to tensors
        const xs = tf.tensor2d(features);
        const ys = tf.tensor2d(labels, [labels.length, 1]);

        // Normalize data
        const xsNorm = this.normalizeData(xs);
        const ysNorm = this.normalizeData(ys);

        // Clone the global model for organization-specific training
        const globalModel = this.globalModels.get('expensePredictor');
        const orgModels = this.getOrganizationModels(organizationId);
        
        // Create a copy of the global model for this organization
        const model = await this.cloneModel(globalModel);
        
        // Train the organization-specific model
        await model.fit(xsNorm.normalized, ysNorm.normalized, {
            epochs: 50,
            batchSize: 32,
            validationSplit: 0.2,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    if (epoch % 10 === 0) {
                        console.log(`Expense Predictor [Org: ${organizationId}] - Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}`);
                    }
                }
            }
        });

        // Store organization-specific model and normalization parameters
        orgModels.set('expensePredictor', model);
        orgModels.set('expensePredictorNorm', {
            x: { min: xsNorm.min, max: xsNorm.max },
            y: { min: ysNorm.min, max: ysNorm.max }
        });

        // Cleanup
        xs.dispose();
        ys.dispose();
        xsNorm.normalized.dispose();
        ysNorm.normalized.dispose();
    }

    // Clone a model for organization-specific use
    async cloneModel(model) {
        const modelConfig = model.toJSON();
        const clonedModel = await tf.loadLayersModel({
            load: async () => modelConfig
        });
        
        // Copy weights
        const weights = model.getWeights();
        const clonedWeights = weights.map(w => w.clone());
        clonedModel.setWeights(clonedWeights);
        
        // Compile with same configuration
        clonedModel.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mae']
        });
        
        return clonedModel;
    }

    // Predict future expenses - NOW ORGANIZATION-SPECIFIC
    async predictExpenses(organizationId, daysAhead = 30) {
        const orgModels = this.getOrganizationModels(organizationId);
        const model = orgModels.get('expensePredictor') || this.globalModels.get('expensePredictor');
        const normParams = orgModels.get('expensePredictorNorm');
        
        if (!model || !normParams) {
            throw new Error(`Expense predictor not trained for organization ${organizationId}`);
        }

        const Expense = mongoose.model('Expense');
        
        // Get last 30 days of expenses FOR THIS ORGANIZATION
        const recentExpenses = await Expense.find({ organization: organizationId })
            .sort({ date: -1 })
            .limit(30);

        const predictions = [];
        let currentFeatures = this.prepareExpenseFeatures(recentExpenses);

        for (let day = 1; day <= daysAhead; day++) {
            const targetDate = moment().add(day, 'days');
            
            // Add temporal features
            const feature = [
                ...currentFeatures,
                targetDate.date() / 31,
                targetDate.month() / 12,
                targetDate.day() / 7
            ];

            // Normalize and predict
            const input = tf.tensor2d([feature]);
            const normalized = this.normalizeWithParams(input, normParams.x);
            const prediction = model.predict(normalized);
            const denormalized = this.denormalizeWithParams(prediction, normParams.y);
            
            const predictedAmount = await denormalized.data();
            
            predictions.push({
                date: targetDate.toDate(),
                predictedAmount: Math.max(0, predictedAmount[0]),
                confidence: this.calculatePredictionConfidence(day)
            });

            // Cleanup
            input.dispose();
            normalized.dispose();
            prediction.dispose();
            denormalized.dispose();
        }

        return predictions;
    }

    // 2. Revenue Forecasting Model
    async initializeRevenueForecaster() {
        // LSTM model for time series forecasting
        const model = tf.sequential({
            layers: [
                tf.layers.lstm({
                    units: 50,
                    returnSequences: true,
                    inputShape: [30, 5] // 30 days, 5 features
                }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.lstm({ units: 50 }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({ units: 1 })
            ]
        });

        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mae']
        });

        this.globalModels.set('revenueForecaster', model);
    }

    // 3. Anomaly Detection
    async initializeAnomalyDetector() {
        // Isolation Forest implementation for anomaly detection
        this.globalModels.set('anomalyDetector', {
            type: 'isolationForest',
            contamination: 0.1, // Expected proportion of outliers
            maxSamples: 256
        });
    }

    // Detect anomalies - transactions should already be filtered by organization
    async detectAnomalies(transactions, type = 'expense') {
        const anomalies = [];
        
        // Group by category for better detection
        const byCategory = {};
        transactions.forEach(tx => {
            const category = tx.category || 'Other';
            if (!byCategory[category]) {
                byCategory[category] = [];
            }
            byCategory[category].push(tx);
        });

        for (const [category, categoryTransactions] of Object.entries(byCategory)) {
            if (categoryTransactions.length < 10) continue;

            // Calculate statistics
            const amounts = categoryTransactions.map(tx => tx.amount);
            const mean = stats.mean(amounts);
            const stdDev = stats.standardDeviation(amounts);
            const median = stats.median(amounts);
            const mad = stats.medianAbsoluteDeviation(amounts);

            // Multiple anomaly detection methods
            categoryTransactions.forEach(tx => {
                const zScore = Math.abs((tx.amount - mean) / stdDev);
                const modifiedZScore = 0.6745 * (tx.amount - median) / mad;
                
                // Anomaly conditions
                const isStatisticalAnomaly = zScore > 3 || Math.abs(modifiedZScore) > 3.5;
                const isContextualAnomaly = this.checkContextualAnomaly(tx, categoryTransactions);
                const isPatternAnomaly = this.checkPatternAnomaly(tx, categoryTransactions);
                
                if (isStatisticalAnomaly || isContextualAnomaly || isPatternAnomaly) {
                    anomalies.push({
                        transaction: tx,
                        anomalyScore: Math.max(zScore / 3, Math.abs(modifiedZScore) / 3.5),
                        reasons: [
                            isStatisticalAnomaly && 'Unusual amount for category',
                            isContextualAnomaly && 'Unusual timing or frequency',
                            isPatternAnomaly && 'Breaks expected pattern'
                        ].filter(Boolean),
                        category,
                        statistics: {
                            mean,
                            median,
                            stdDev,
                            txAmount: tx.amount,
                            percentile: stats.quantileRank(amounts, tx.amount) * 100
                        }
                    });
                }
            });
        }

        return anomalies.sort((a, b) => b.anomalyScore - a.anomalyScore);
    }

    checkContextualAnomaly(transaction, categoryTransactions) {
        // Check for unusual timing
        const hour = moment(transaction.date).hour();
        const dayOfWeek = moment(transaction.date).day();
        
        // Most business transactions happen during business hours
        const isUnusualTime = hour < 6 || hour > 22;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        // Check frequency
        const sameVendorTxs = categoryTransactions.filter(tx => 
            tx.vendor === transaction.vendor && 
            Math.abs(moment(tx.date).diff(transaction.date, 'days')) < 30
        );
        
        const isUnusualFrequency = sameVendorTxs.length > 5; // More than 5 times in 30 days
        
        return isUnusualTime || (isWeekend && transaction.category !== 'Travel & Entertainment') || isUnusualFrequency;
    }

    checkPatternAnomaly(transaction, categoryTransactions) {
        // Check if transaction breaks expected patterns
        const sameDayTransactions = categoryTransactions.filter(tx =>
            moment(tx.date).date() === moment(transaction.date).date()
        );
        
        if (sameDayTransactions.length < 3) return false;
        
        // Check if this day of month usually has transactions
        const dayAmounts = sameDayTransactions.map(tx => tx.amount);
        const expectedRange = {
            min: stats.min(dayAmounts) * 0.8,
            max: stats.max(dayAmounts) * 1.2
        };
        
        return transaction.amount < expectedRange.min || transaction.amount > expectedRange.max;
    }

    // 4. Churn Prediction (for investor/customer relationships)
    async initializeChurnPredictor() {
        const model = tf.sequential({
            layers: [
                tf.layers.dense({ inputShape: [8], units: 16, activation: 'relu' }),
                tf.layers.dropout({ rate: 0.3 }),
                tf.layers.dense({ units: 8, activation: 'relu' }),
                tf.layers.dense({ units: 1, activation: 'sigmoid' })
            ]
        });

        model.compile({
            optimizer: tf.train.adam(0.01),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        this.globalModels.set('churnPredictor', model);
    }

    // 5. Cash Flow Optimizer
    async initializeCashFlowOptimizer() {
        // Genetic algorithm parameters for optimization
        this.globalModels.set('cashFlowOptimizer', {
            populationSize: 100,
            generations: 50,
            mutationRate: 0.1,
            crossoverRate: 0.7,
            eliteSize: 10
        });
    }

    // Optimize cash flow - currentState should include organization-specific data
    async optimizeCashFlow(currentState, constraints) {
        const optimizer = this.globalModels.get('cashFlowOptimizer');
        
        // Generate initial population
        let population = this.generateInitialPopulation(
            optimizer.populationSize,
            currentState,
            constraints
        );

        // Evolution loop
        for (let gen = 0; gen < optimizer.generations; gen++) {
            // Evaluate fitness
            population = population.map(individual => ({
                ...individual,
                fitness: this.evaluateCashFlowFitness(individual, currentState, constraints)
            }));

            // Sort by fitness
            population.sort((a, b) => b.fitness - a.fitness);

            // Select best individuals
            const elite = population.slice(0, optimizer.eliteSize);
            const newPopulation = [...elite];

            // Generate new individuals
            while (newPopulation.length < optimizer.populationSize) {
                const parent1 = this.tournamentSelection(population);
                const parent2 = this.tournamentSelection(population);
                
                let child = this.crossover(parent1, parent2, optimizer.crossoverRate);
                child = this.mutate(child, optimizer.mutationRate);
                
                newPopulation.push(child);
            }

            population = newPopulation;
        }

        // Return best solution
        const bestSolution = population.sort((a, b) => b.fitness - a.fitness)[0];
        
        return this.translateSolutionToRecommendations(bestSolution, currentState);
    }

    generateInitialPopulation(size, currentState, constraints) {
        const population = [];
        
        for (let i = 0; i < size; i++) {
            const individual = {
                genes: {
                    // Payment timing adjustments (days to delay/advance)
                    paymentTimings: {},
                    // Expense reductions by category (percentage)
                    expenseReductions: {},
                    // Revenue acceleration opportunities
                    revenueAcceleration: {},
                    // Investment timing
                    investmentTiming: Math.random() * 90 // days
                }
            };

            // Initialize genes based on current transactions
            Object.keys(currentState.upcomingExpenses).forEach(category => {
                individual.genes.paymentTimings[category] = Math.floor(Math.random() * 30 - 15); // -15 to +15 days
                individual.genes.expenseReductions[category] = Math.random() * 0.2; // 0-20% reduction
            });

            Object.keys(currentState.expectedRevenue).forEach(source => {
                individual.genes.revenueAcceleration[source] = Math.random() * 0.3; // 0-30% acceleration
            });

            population.push(individual);
        }

        return population;
    }

    evaluateCashFlowFitness(individual, currentState, constraints) {
        let fitness = 0;
        let cashBalance = currentState.currentCash;
        const dailyBalances = [];

        // Simulate cash flow with individual's genes
        for (let day = 0; day < 90; day++) {
            // Apply payment timing adjustments
            let dayExpenses = 0;
            let dayRevenue = 0;

            // Calculate adjusted expenses
            Object.entries(currentState.upcomingExpenses).forEach(([category, schedule]) => {
                const adjustment = individual.genes.paymentTimings[category] || 0;
                const reduction = individual.genes.expenseReductions[category] || 0;
                
                if (schedule[day + adjustment]) {
                    dayExpenses += schedule[day + adjustment] * (1 - reduction);
                }
            });

            // Calculate adjusted revenue
            Object.entries(currentState.expectedRevenue).forEach(([source, schedule]) => {
                const acceleration = individual.genes.revenueAcceleration[source] || 0;
                
                if (schedule[day]) {
                    dayRevenue += schedule[day] * (1 + acceleration);
                }
            });

            cashBalance += dayRevenue - dayExpenses;
            dailyBalances.push(cashBalance);

            // Penalize negative balance
            if (cashBalance < constraints.minCashBalance) {
                fitness -= Math.abs(cashBalance - constraints.minCashBalance) * 10;
            }
        }

        // Reward maintaining healthy cash balance
        const avgBalance = stats.mean(dailyBalances);
        const balanceVolatility = stats.standardDeviation(dailyBalances);
        
        fitness += avgBalance / 1000; // Reward higher average balance
        fitness -= balanceVolatility / 1000; // Penalize volatility
        
        // Reward meeting constraints
        if (Math.min(...dailyBalances) >= constraints.minCashBalance) {
            fitness += 1000;
        }

        return fitness;
    }

    tournamentSelection(population, tournamentSize = 3) {
        const tournament = [];
        for (let i = 0; i < tournamentSize; i++) {
            tournament.push(population[Math.floor(Math.random() * population.length)]);
        }
        return tournament.sort((a, b) => b.fitness - a.fitness)[0];
    }

    crossover(parent1, parent2, crossoverRate) {
        if (Math.random() > crossoverRate) {
            return { ...parent1 };
        }

        const child = {
            genes: {
                paymentTimings: {},
                expenseReductions: {},
                revenueAcceleration: {},
                investmentTiming: 0
            }
        };

        // Mix genes from both parents
        Object.keys(parent1.genes.paymentTimings).forEach(key => {
            child.genes.paymentTimings[key] = Math.random() < 0.5 ? 
                parent1.genes.paymentTimings[key] : parent2.genes.paymentTimings[key];
        });

        Object.keys(parent1.genes.expenseReductions).forEach(key => {
            child.genes.expenseReductions[key] = Math.random() < 0.5 ? 
                parent1.genes.expenseReductions[key] : parent2.genes.expenseReductions[key];
        });

        Object.keys(parent1.genes.revenueAcceleration).forEach(key => {
            child.genes.revenueAcceleration[key] = Math.random() < 0.5 ? 
                parent1.genes.revenueAcceleration[key] : parent2.genes.revenueAcceleration[key];
        });

        child.genes.investmentTiming = Math.random() < 0.5 ? 
            parent1.genes.investmentTiming : parent2.genes.investmentTiming;

        return child;
    }

    mutate(individual, mutationRate) {
        const mutated = JSON.parse(JSON.stringify(individual));

        // Mutate payment timings
        Object.keys(mutated.genes.paymentTimings).forEach(key => {
            if (Math.random() < mutationRate) {
                mutated.genes.paymentTimings[key] += Math.floor(Math.random() * 10 - 5);
                mutated.genes.paymentTimings[key] = Math.max(-30, Math.min(30, mutated.genes.paymentTimings[key]));
            }
        });

        // Mutate expense reductions
        Object.keys(mutated.genes.expenseReductions).forEach(key => {
            if (Math.random() < mutationRate) {
                mutated.genes.expenseReductions[key] += Math.random() * 0.1 - 0.05;
                mutated.genes.expenseReductions[key] = Math.max(0, Math.min(0.3, mutated.genes.expenseReductions[key]));
            }
        });

        return mutated;
    }

    translateSolutionToRecommendations(solution, currentState) {
        const recommendations = [];

        // Payment timing recommendations
        Object.entries(solution.genes.paymentTimings).forEach(([category, adjustment]) => {
            if (Math.abs(adjustment) > 5) {
                recommendations.push({
                    type: 'payment_timing',
                    category,
                    action: adjustment > 0 ? 'delay' : 'accelerate',
                    days: Math.abs(adjustment),
                    impact: 'high',
                    description: `${adjustment > 0 ? 'Delay' : 'Accelerate'} ${category} payments by ${Math.abs(adjustment)} days to optimize cash flow`
                });
            }
        });

        // Expense reduction recommendations
        Object.entries(solution.genes.expenseReductions).forEach(([category, reduction]) => {
            if (reduction > 0.05) {
                recommendations.push({
                    type: 'expense_reduction',
                    category,
                    percentage: (reduction * 100).toFixed(1),
                    impact: reduction > 0.15 ? 'high' : 'medium',
                    description: `Reduce ${category} expenses by ${(reduction * 100).toFixed(1)}% to improve runway`
                });
            }
        });

        // Revenue acceleration recommendations
        Object.entries(solution.genes.revenueAcceleration).forEach(([source, acceleration]) => {
            if (acceleration > 0.1) {
                recommendations.push({
                    type: 'revenue_acceleration',
                    source,
                    percentage: (acceleration * 100).toFixed(1),
                    impact: 'high',
                    description: `Accelerate ${source} collections by ${(acceleration * 100).toFixed(1)}% through early payment incentives`
                });
            }
        });

        return {
            recommendations: recommendations.sort((a, b) => {
                const impactOrder = { high: 3, medium: 2, low: 1 };
                return impactOrder[b.impact] - impactOrder[a.impact];
            }),
            projectedImpact: {
                runwayExtension: this.calculateRunwayExtension(solution, currentState),
                cashFlowImprovement: this.calculateCashFlowImprovement(solution, currentState),
                riskReduction: this.calculateRiskReduction(solution, currentState)
            }
        };
    }

    // Helper methods
    normalizeData(tensor) {
        const min = tensor.min();
        const max = tensor.max();
        const normalized = tensor.sub(min).div(max.sub(min));
        return { normalized, min, max };
    }

    normalizeWithParams(tensor, params) {
        return tensor.sub(params.min).div(params.max.sub(params.min));
    }

    denormalizeWithParams(tensor, params) {
        return tensor.mul(params.max.sub(params.min)).add(params.min);
    }

    aggregateByCategory(expenses) {
        const aggregated = {};
        expenses.forEach(expense => {
            const category = expense.category || 'Other';
            aggregated[category] = (aggregated[category] || 0) + expense.amount;
        });
        return aggregated;
    }

    prepareExpenseFeatures(recentExpenses) {
        const categoryTotals = this.aggregateByCategory(recentExpenses);
        return [
            categoryTotals['Tech Infrastructure'] || 0,
            categoryTotals['Marketing & Sales'] || 0,
            categoryTotals['Salaries & Wages'] || 0,
            categoryTotals['Software & Subscriptions'] || 0,
            categoryTotals['Legal & Professional'] || 0,
            categoryTotals['Rent & Utilities'] || 0,
            categoryTotals['Other'] || 0
        ];
    }

    calculatePredictionConfidence(daysAhead) {
        // Confidence decreases with time
        return Math.max(0.5, 1 - (daysAhead / 100));
    }

    calculateRunwayExtension(solution, currentState) {
        // Simplified calculation
        const totalReduction = Object.values(solution.genes.expenseReductions)
            .reduce((sum, reduction) => sum + reduction, 0) / Object.keys(solution.genes.expenseReductions).length;
        
        const currentRunway = currentState.currentCash / currentState.monthlyBurn;
        const newMonthlyBurn = currentState.monthlyBurn * (1 - totalReduction);
        const newRunway = currentState.currentCash / newMonthlyBurn;
        
        return newRunway - currentRunway;
    }

    calculateCashFlowImprovement(solution, currentState) {
        // Calculate average daily cash flow improvement
        const timingImpact = Object.values(solution.genes.paymentTimings)
            .reduce((sum, timing) => sum + Math.abs(timing), 0) * 1000; // Rough estimate
        
        const reductionImpact = Object.values(solution.genes.expenseReductions)
            .reduce((sum, reduction) => sum + reduction * currentState.monthlyBurn, 0);
        
        return timingImpact + reductionImpact;
    }

    calculateRiskReduction(solution, currentState) {
        // Risk reduction score based on cash buffer improvement
        const minBalance = currentState.projectedMinBalance;
        const improvedMinBalance = minBalance + this.calculateCashFlowImprovement(solution, currentState);
        
        return ((improvedMinBalance - minBalance) / minBalance) * 100;
    }

    // Advanced pattern recognition - NOW ORGANIZATION-SPECIFIC
    async identifySpendingPatterns(organizationId) {
        const Expense = mongoose.model('Expense');
        const expenses = await Expense.find({ organization: organizationId })
            .sort({ date: -1 })
            .limit(500);

        const patterns = {
            seasonal: await this.detectSeasonalPatterns(expenses),
            recurring: await this.detectRecurringPatterns(expenses),
            anomalous: await this.detectAnomalousPatterns(expenses),
            trends: await this.detectSpendingTrends(expenses)
        };

        return patterns;
    }

    async detectSeasonalPatterns(expenses) {
        const monthlyTotals = {};
        
        expenses.forEach(expense => {
            const monthKey = moment(expense.date).format('MM');
            if (!monthlyTotals[monthKey]) {
                monthlyTotals[monthKey] = [];
            }
            monthlyTotals[monthKey].push(expense.amount);
        });

        const seasonalFactors = {};
        const overallAverage = stats.mean(expenses.map(e => e.amount));

        Object.entries(monthlyTotals).forEach(([month, amounts]) => {
            const monthAverage = stats.mean(amounts);
            seasonalFactors[month] = {
                factor: monthAverage / overallAverage,
                variance: stats.standardDeviation(amounts) / monthAverage,
                interpretation: monthAverage > overallAverage * 1.2 ? 'High spending month' :
                               monthAverage < overallAverage * 0.8 ? 'Low spending month' : 'Normal spending'
            };
        });

        return seasonalFactors;
    }

    async detectRecurringPatterns(expenses) {
        const patterns = [];
        const vendorGroups = {};

        // Group by vendor
        expenses.forEach(expense => {
            if (!expense.vendor) return;
            if (!vendorGroups[expense.vendor]) {
                vendorGroups[expense.vendor] = [];
            }
            vendorGroups[expense.vendor].push(expense);
        });

        // Analyze each vendor's pattern
        Object.entries(vendorGroups).forEach(([vendor, vendorExpenses]) => {
            if (vendorExpenses.length < 3) return;

            // Calculate intervals between transactions
            const intervals = [];
            for (let i = 1; i < vendorExpenses.length; i++) {
                const days = moment(vendorExpenses[i-1].date).diff(vendorExpenses[i].date, 'days');
                intervals.push(Math.abs(days));
            }

            const avgInterval = stats.mean(intervals);
            const stdDevInterval = stats.standardDeviation(intervals);

            // Check if it's recurring (low variance in intervals)
            if (stdDevInterval < avgInterval * 0.3 && avgInterval < 40) {
                patterns.push({
                    vendor,
                    frequency: avgInterval < 8 ? 'weekly' :
                               avgInterval < 16 ? 'biweekly' :
                               avgInterval < 35 ? 'monthly' : 'other',
                    avgInterval,
                    avgAmount: stats.mean(vendorExpenses.map(e => e.amount)),
                    lastDate: vendorExpenses[0].date,
                    nextExpectedDate: moment(vendorExpenses[0].date).add(avgInterval, 'days').toDate()
                });
            }
        });

        return patterns;
    }

    async detectAnomalousPatterns(expenses) {
        // Time-based anomalies
        const timeAnomalies = [];
        const hourlyDistribution = Array(24).fill(0);
        
        expenses.forEach(expense => {
            const hour = moment(expense.date).hour();
            hourlyDistribution[hour]++;
        });

        // Find unusual transaction times
        const avgHourlyCount = stats.mean(hourlyDistribution);
        hourlyDistribution.forEach((count, hour) => {
            if (count > avgHourlyCount * 3) {
                timeAnomalies.push({
                    type: 'unusual_time_concentration',
                    hour,
                    count,
                    description: `Unusually high number of transactions at ${hour}:00`
                });
            }
        });

        return {
            timeAnomalies,
            amountAnomalies: await this.detectAnomalies(expenses, 'expense')
        };
    }

    async detectSpendingTrends(expenses) {
        // Group by month
        const monthlyData = {};
        expenses.forEach(expense => {
            const monthKey = moment(expense.date).format('YYYY-MM');
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {
                    total: 0,
                    count: 0,
                    categories: {}
                };
            }
            monthlyData[monthKey].total += expense.amount;
            monthlyData[monthKey].count++;
            
            const category = expense.category || 'Other';
            monthlyData[monthKey].categories[category] = 
                (monthlyData[monthKey].categories[category] || 0) + expense.amount;
        });

        // Calculate trends
        const months = Object.keys(monthlyData).sort();
        const totals = months.map(m => monthlyData[m].total);
        
        // Linear regression for overall trend
        const xValues = Array.from({length: totals.length}, (_, i) => i);
        const regression = stats.linearRegression([xValues, totals]);
        
        // Category trends
        const categoryTrends = {};
        const categories = [...new Set(expenses.map(e => e.category || 'Other'))];
        
        categories.forEach(category => {
            const categoryTotals = months.map(m => monthlyData[m].categories[category] || 0);
            const catRegression = stats.linearRegression([xValues, categoryTotals]);
            
            categoryTrends[category] = {
                slope: catRegression.m,
                trend: catRegression.m > 0 ? 'increasing' : 'decreasing',
                monthlyChange: catRegression.m,
                percentageChange: categoryTotals[0] > 0 ? 
                    ((catRegression.m * months.length) / categoryTotals[0]) * 100 : 0
            };
        });

        return {
            overall: {
                trend: regression.m > 0 ? 'increasing' : 'decreasing',
                monthlyChange: regression.m,
                projectedNext3Months: [1, 2, 3].map(i => 
                    regression.m * (totals.length + i) + regression.b
                )
            },
            byCategory: categoryTrends,
            insights: this.generateTrendInsights(regression, categoryTrends)
        };
    }

    generateTrendInsights(overallTrend, categoryTrends) {
        const insights = [];

        if (overallTrend.m > 0) {
            insights.push({
                type: 'warning',
                message: `Expenses are increasing at ₹${this.formatNumber(overallTrend.m)}/month`,
                severity: 'medium'
            });
        }

        // Find fastest growing categories
        const sortedCategories = Object.entries(categoryTrends)
            .sort((a, b) => b[1].percentageChange - a[1].percentageChange);

        if (sortedCategories[0][1].percentageChange > 20) {
            insights.push({
                type: 'alert',
                message: `${sortedCategories[0][0]} expenses growing rapidly at ${sortedCategories[0][1].percentageChange.toFixed(1)}%`,
                severity: 'high'
            });
        }

        // Find optimization opportunities
        const decreasingCategories = sortedCategories
            .filter(([_, trend]) => trend.percentageChange < -10);
        
        if (decreasingCategories.length > 0) {
            insights.push({
                type: 'success',
                message: `Good progress in reducing ${decreasingCategories[0][0]} expenses`,
                severity: 'low'
            });
        }

        return insights;
    }

    formatNumber(value) {
        if (Math.abs(value) >= 100000) {
            return (value / 100000).toFixed(1) + 'L';
        } else if (Math.abs(value) >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
        }
        return value.toFixed(0);
    }

    // Clean up organization-specific models when needed
    async cleanupOrganizationModels(organizationId) {
        const orgModels = this.organizationModels.get(organizationId);
        if (orgModels) {
            // Dispose of TensorFlow models
            orgModels.forEach((model, key) => {
                if (model && typeof model.dispose === 'function') {
                    model.dispose();
                }
            });
            this.organizationModels.delete(organizationId);
        }
    }
}

// Singleton instance
let mlServiceInstance = null;

module.exports = {
    getAdvancedMLService: () => {
        if (!mlServiceInstance) {
            mlServiceInstance = new AdvancedMLService();
        }
        return mlServiceInstance;
    },
    AdvancedMLService
};