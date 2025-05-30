// controllers/predictiveAnalyticsController.js
const RunwayScenario = require('../models/runwayScenarioModel');
const FundraisingPrediction = require('../models/fundraisingPredictionModel');
const CashFlowForecast = require('../models/cashFlowForecastModel');
const RevenueCohort = require('../models/revenueCohortModel');
const Round = require('../models/roundModel');
const Expense = require('../models/expenseModel');
const Revenue = require('../models/revenueModel');
const BankAccount = require('../models/bankAccountModel');
const Investor = require('../models/investorModel');
const ManualKpiSnapshot = require('../models/manualKpiSnapshotModel');
const PredictionAlgorithms = require('../utils/predictionAlgorithms');
const StatisticalHelpers = require('../utils/statisticalHelpers');
const mongoose = require('mongoose');
const moment = require('moment');

class PredictiveAnalyticsController {
    /**
     * Create a new runway scenario with projections
     * @desc    Create runway scenario for the active organization
     * @access  Private (Requires authenticated user with organization context)
     */
    static async createRunwayScenario(req, res) {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            const {
                name,
                description,
                scenarioType,
                assumptions,
                projectionMonths = 24,
                plannedFundraisingEvents = []
            } = req.body;

            // --- MULTI-TENANCY: Filter all queries by organizationId ---
            // Get current financial position for the organization
            const bankAccounts = await BankAccount.find({ organization: organizationId });
            const totalCash = bankAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);

            // Calculate current burn rate (last 3 months average) for the organization
            const threeMonthsAgo = moment().subtract(3, 'months').toDate();
            const recentExpenses = await Expense.aggregate([
                { $match: { organization: organizationId, date: { $gte: threeMonthsAgo } } },
                {
                    $group: {
                        _id: { year: { $year: "$date" }, month: { $month: "$date" } },
                        total: { $sum: "$amount" }
                    }
                }
            ]);

            const recentRevenues = await Revenue.aggregate([
                { $match: { organization: organizationId, date: { $gte: threeMonthsAgo } } },
                {
                    $group: {
                        _id: { year: { $year: "$date" }, month: { $month: "$date" } },
                        total: { $sum: "$amount" }
                    }
                }
            ]);

            const monthlyBurn = recentExpenses.length > 0 
                ? recentExpenses.reduce((sum, e) => sum + e.total, 0) / recentExpenses.length 
                : 0;
            const monthlyRevenue = recentRevenues.length > 0 
                ? recentRevenues.reduce((sum, r) => sum + r.total, 0) / recentRevenues.length 
                : 0;

            // Create scenario document
            const scenario = new RunwayScenario({
                organization: organizationId,  // Scope to organization
                user: userId,                  // Track creator
                name,
                description,
                scenarioType,
                startDate: new Date(),
                initialCashBalance: totalCash,
                initialMonthlyBurn: monthlyBurn,
                initialMonthlyRevenue: monthlyRevenue,
                assumptions: assumptions || [
                    { metric: 'monthly_burn_rate', baseValue: monthlyBurn, growthRate: 0.05 },
                    { metric: 'revenue_growth_rate', baseValue: monthlyRevenue, growthRate: 0.10 }
                ],
                projectionMonths,
                plannedFundraisingEvents,
                createdBy: userId              // Maintain for backward compatibility
            });

            // Generate projections
            const projections = await PredictiveAnalyticsController.generateRunwayProjections(scenario);
            scenario.monthlyProjections = projections.monthlyProjections;
            scenario.totalRunwayMonths = projections.runwayMonths;
            scenario.dateOfCashOut = projections.cashOutDate;
            scenario.totalCashBurned = projections.totalBurned;
            scenario.totalRevenueGenerated = projections.totalRevenue;
            scenario.breakEvenMonth = projections.breakEvenMonth;

            await scenario.save();

            // Run Monte Carlo simulation for confidence intervals
            const simulation = PredictionAlgorithms.monteCarloSimulation({
                initialCash: totalCash,
                monthlyBurn,
                monthlyRevenue,
                burnGrowthRate: assumptions?.find(a => a.metric === 'monthly_burn_rate')?.growthRate || 0.05,
                revenueGrowthRate: assumptions?.find(a => a.metric === 'revenue_growth_rate')?.growthRate || 0.10,
                variance: 0.15
            });

            res.status(201).json({
                scenario,
                simulation: {
                    p10: simulation.p10,
                    p50: simulation.p50,
                    p90: simulation.p90,
                    mean: simulation.mean.toFixed(1)
                }
            });
        } catch (err) {
            console.error('Error creating runway scenario:', err);
            res.status(500).json({ msg: 'Server Error: Could not create runway scenario.' });
        }
    }

    /**
     * Generate runway projections for a scenario
     */
    static async generateRunwayProjections(scenario) {
        const projections = [];
        let cash = scenario.initialCashBalance;
        let monthlyBurn = scenario.initialMonthlyBurn;
        let monthlyRevenue = scenario.initialMonthlyRevenue;
        let runwayMonths = 0;
        let cashOutDate = null;
        let totalBurned = 0;
        let totalRevenue = 0;
        let breakEvenMonth = null;

        const burnGrowthRate = scenario.assumptions.find(a => a.metric === 'monthly_burn_rate')?.growthRate || 0;
        const revenueGrowthRate = scenario.assumptions.find(a => a.metric === 'revenue_growth_rate')?.growthRate || 0;

        for (let month = 1; month <= scenario.projectionMonths; month++) {
            const date = moment(scenario.startDate).add(month - 1, 'months').toDate();
            
            // Check for fundraising events
            const fundraising = scenario.plannedFundraisingEvents.find(e => e.month === month);
            const fundraisingAmount = fundraising ? fundraising.amount * fundraising.probability : 0;

            // Calculate net cash flow
            const netCashFlow = monthlyRevenue - monthlyBurn + fundraisingAmount;
            const endingCash = cash + netCashFlow;

            projections.push({
                month,
                date,
                startingCash: cash,
                revenue: monthlyRevenue,
                expenses: monthlyBurn,
                netCashFlow,
                endingCash,
                runwayRemaining: endingCash > 0 ? Math.floor(endingCash / monthlyBurn) : 0,
                isOutOfCash: endingCash <= 0
            });

            totalBurned += monthlyBurn;
            totalRevenue += monthlyRevenue;

            if (cash > 0 && endingCash <= 0 && !cashOutDate) {
                runwayMonths = month;
                cashOutDate = date;
            }

            if (monthlyRevenue >= monthlyBurn && !breakEvenMonth) {
                breakEvenMonth = month;
            }

            // Update for next month
            cash = endingCash;
            monthlyBurn *= (1 + burnGrowthRate);
            monthlyRevenue *= (1 + revenueGrowthRate);

            if (endingCash <= 0) break;
        }

        return {
            monthlyProjections: projections,
            runwayMonths: runwayMonths || scenario.projectionMonths,
            cashOutDate,
            totalBurned,
            totalRevenue,
            breakEvenMonth
        };
    }

    /**
     * Get all runway scenarios for the active organization
     * @desc    Get runway scenarios for the organization
     * @access  Private
     */
    static async getRunwayScenarios(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;
        
        try {
            // --- MULTI-TENANCY: Filter by organizationId ---
            const scenarios = await RunwayScenario.find({
                organization: organizationId,
                isActive: true
            })
            .populate('user', 'name email')  // Show who created it
            .sort({ createdAt: -1 })
            .limit(20);

            res.json(scenarios);
        } catch (err) {
            console.error('Error fetching runway scenarios:', err);
            res.status(500).json({ msg: 'Server Error: Could not fetch runway scenarios.' });
        }
    }

    /**
     * Create fundraising timeline prediction
     * @desc    Create fundraising prediction for the active organization
     * @access  Private
     */
    static async createFundraisingPrediction(req, res) {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            const {
                predictionName,
                targetRoundSize,
                targetValuation,
                roundType,
                keyMilestones = []
            } = req.body;

            // --- MULTI-TENANCY: Pass organizationId to analysis methods ---
            // Analyze current state for the organization
            const currentMetrics = await PredictiveAnalyticsController.analyzeCurrentFundraisingReadiness(organizationId);
            
            // Calculate probabilities
            const probabilities = PredictiveAnalyticsController.calculateFundraisingProbabilities(
                currentMetrics,
                targetRoundSize,
                roundType
            );

            // Predict timeline
            const timeline = PredictiveAnalyticsController.predictFundraisingTimeline(
                currentMetrics,
                keyMilestones,
                roundType
            );

            // Get market comparables
            const marketData = await PredictiveAnalyticsController.getMarketComparables(
                roundType,
                targetRoundSize
            );

            // Generate recommendations
            const recommendations = PredictiveAnalyticsController.generateFundraisingRecommendations(
                currentMetrics,
                probabilities,
                keyMilestones
            );

            const prediction = new FundraisingPrediction({
                organization: organizationId,  // Scope to organization
                user: userId,                  // Track creator
                predictionName,
                targetRoundSize,
                targetValuation,
                roundType,
                currentDate: new Date(),
                predictedStartDate: timeline.startDate,
                predictedCloseDate: timeline.closeDate,
                confidenceInterval: timeline.confidenceInterval,
                overallProbability: probabilities.overall,
                timelineProbability: probabilities.timeline,
                amountProbability: probabilities.amount,
                probabilityFactors: probabilities.factors,
                keyMilestones,
                marketConditions: marketData,
                recommendations,
                createdBy: userId              // Maintain for backward compatibility
            });

            await prediction.save();
            res.status(201).json(prediction);
        } catch (err) {
            console.error('Error creating fundraising prediction:', err);
            res.status(500).json({ msg: 'Server Error: Could not create fundraising prediction.' });
        }
    }

    /**
     * Analyze current fundraising readiness for the organization
     */
    static async analyzeCurrentFundraisingReadiness(organizationId) {
        // Get financial metrics for the organization
        const threeMonthsAgo = moment().subtract(3, 'months').toDate();
        const expenses = await Expense.aggregate([
            { $match: { organization: organizationId, date: { $gte: threeMonthsAgo } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const revenues = await Revenue.aggregate([
            { $match: { organization: organizationId, date: { $gte: threeMonthsAgo } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const monthlyBurn = expenses[0]?.total / 3 || 0;
        const monthlyRevenue = revenues[0]?.total / 3 || 0;

        // Get KPI trends for the organization
        const kpiSnapshots = await ManualKpiSnapshot.find({ organization: organizationId })
            .sort({ snapshotDate: -1 })
            .limit(6);

        const dauGrowth = kpiSnapshots.length >= 2 
            ? (kpiSnapshots[0].dau - kpiSnapshots[kpiSnapshots.length - 1].dau) / kpiSnapshots[kpiSnapshots.length - 1].dau 
            : 0;

        // Get current runway for the organization
        const bankAccounts = await BankAccount.find({ organization: organizationId });
        const totalCash = bankAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);
        const runwayMonths = monthlyBurn > 0 ? totalCash / monthlyBurn : 12;

        return {
            monthlyBurn,
            monthlyRevenue,
            totalCash,
            runwayMonths,
            dauGrowth,
            revenueGrowth: revenues[0]?.total > 0 ? 0.15 : 0, // Placeholder
            teamSize: 10 // Placeholder - could be from employee records
        };
    }

    /**
     * Calculate fundraising probabilities
     */
    static calculateFundraisingProbabilities(metrics, targetAmount, roundType) {
        const factors = [];
        
        // Burn rate factor
        const burnScore = metrics.runwayMonths > 12 ? 0.8 : 
                         metrics.runwayMonths > 6 ? 0.6 : 0.3;
        factors.push({
            factor: 'Current burn rate',
            weight: 1.5,
            currentStatus: burnScore > 0.6 ? 'positive' : 'negative',
            impact: burnScore,
            notes: `${metrics.runwayMonths.toFixed(1)} months runway`
        });

        // Growth factor
        const growthScore = metrics.dauGrowth > 0.2 ? 0.9 : 
                           metrics.dauGrowth > 0.1 ? 0.7 : 0.4;
        factors.push({
            factor: 'User growth',
            weight: 2,
            currentStatus: growthScore > 0.6 ? 'positive' : 'neutral',
            impact: growthScore,
            notes: `${(metrics.dauGrowth * 100).toFixed(1)}% DAU growth`
        });

        // Revenue factor
        const revenueScore = metrics.monthlyRevenue > 0 ? 0.8 : 0.3;
        factors.push({
            factor: 'Revenue traction',
            weight: 1.5,
            currentStatus: revenueScore > 0.5 ? 'positive' : 'negative',
            impact: revenueScore,
            notes: `$${metrics.monthlyRevenue.toFixed(0)} monthly revenue`
        });

        // Calculate overall probability
        const overall = PredictionAlgorithms.calculateFundraisingProbability({
            burnRate: burnScore,
            growth: growthScore,
            revenue: revenueScore,
            marketConditions: 0.7, // Placeholder
            teamStrength: 0.8, // Placeholder
            productMarketFit: 0.6 // Placeholder
        });

        return {
            overall,
            timeline: overall * 0.9, // Slightly lower for timeline
            amount: overall * 0.85, // Lower for full amount
            factors
        };
    }

    /**
     * Predict fundraising timeline
     */
    static predictFundraisingTimeline(metrics, milestones, roundType) {
        // Base timelines by round type (in days)
        const baseTimelines = {
            'Pre-Seed': 90,
            'Seed': 120,
            'Series A': 150,
            'Series B': 180,
            'Bridge': 60
        };

        const baseDays = baseTimelines[roundType] || 120;
        
        // Adjust based on readiness
        let adjustmentFactor = 1;
        
        if (metrics.runwayMonths < 6) adjustmentFactor *= 0.8; // Urgent
        if (metrics.dauGrowth > 0.2) adjustmentFactor *= 0.9; // Strong growth
        if (milestones.filter(m => m.percentageComplete > 80).length > milestones.length / 2) {
            adjustmentFactor *= 0.9; // Good milestone progress
        }

        const adjustedDays = Math.round(baseDays * adjustmentFactor);
        const startDate = moment().add(30, 'days').toDate(); // Start in 30 days
        const closeDate = moment(startDate).add(adjustedDays, 'days').toDate();

        return {
            startDate,
            closeDate,
            confidenceInterval: Math.round(adjustedDays * 0.2) // 20% variance
        };
    }

    /**
     * Get market comparables
     */
    static async getMarketComparables(roundType, targetSize) {
        // In production, this would query an external API or database
        // For now, return mock data
        return {
            sectorSentiment: 'positive',
            comparableDeals: [
                {
                    companyName: 'Similar EdTech Startup A',
                    roundSize: targetSize * 0.9,
                    valuation: targetSize * 4,
                    date: moment().subtract(2, 'months').toDate(),
                    similarity: 0.85
                },
                {
                    companyName: 'Similar EdTech Startup B',
                    roundSize: targetSize * 1.1,
                    valuation: targetSize * 5,
                    date: moment().subtract(3, 'months').toDate(),
                    similarity: 0.75
                }
            ],
            averageRoundSize: targetSize,
            averageValuation: targetSize * 4.5,
            averageTimeToClose: 120
        };
    }

    /**
     * Generate fundraising recommendations
     */
    static generateFundraisingRecommendations(metrics, probabilities, milestones) {
        const recommendations = [];

        if (metrics.runwayMonths < 9) {
            recommendations.push({
                priority: 'high',
                action: 'Start fundraising process immediately',
                deadline: moment().add(2, 'weeks').toDate(),
                impact: 'Critical for maintaining operations'
            });
        }

        if (metrics.dauGrowth < 0.1) {
            recommendations.push({
                priority: 'high',
                action: 'Focus on user acquisition to show growth',
                deadline: moment().add(1, 'month').toDate(),
                impact: 'Improve attractiveness to investors'
            });
        }

        const incompleteMilestones = milestones.filter(m => m.percentageComplete < 50);
        if (incompleteMilestones.length > 0) {
            recommendations.push({
                priority: 'medium',
                action: `Complete key milestones: ${incompleteMilestones.map(m => m.name).join(', ')}`,
                deadline: moment().add(2, 'months').toDate(),
                impact: 'Strengthen negotiation position'
            });
        }

        return recommendations;
    }

    /**
     * Create cash flow forecast
     * @desc    Create cash flow forecast for the active organization
     * @access  Private
     */
    static async createCashFlowForecast(req, res) {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            const {
                forecastName,
                description,
                forecastType = 'Short-term',
                endDate,
                granularity = 'weekly'
            } = req.body;

            // --- MULTI-TENANCY: Pass organizationId to all methods ---
            // Get historical data for the organization
            const historicalData = await PredictiveAnalyticsController.getHistoricalCashFlowData(organizationId);
            
            // Get current position for the organization
            const currentPosition = await PredictiveAnalyticsController.getCurrentCashPosition(organizationId);

            // Generate category forecasts
            const categoryForecasts = await PredictiveAnalyticsController.generateCategoryForecasts(historicalData);

            // Calculate forecast period
            const startDate = new Date();
            const forecastEndDate = endDate ? new Date(endDate) : moment().add(3, 'months').toDate();
            
            // Generate weekly forecasts
            const weeklyForecasts = await PredictiveAnalyticsController.generateWeeklyForecasts(
                currentPosition,
                categoryForecasts,
                startDate,
                forecastEndDate,
                granularity
            );

            // Perform scenario analysis
            const scenarioAnalysis = PredictiveAnalyticsController.performCashFlowScenarioAnalysis(
                weeklyForecasts,
                currentPosition.cash
            );

            // Generate alerts
            const alerts = PredictiveAnalyticsController.generateCashFlowAlerts(weeklyForecasts);

            const forecast = new CashFlowForecast({
                organization: organizationId,  // Scope to organization
                user: userId,                  // Track creator
                forecastName,
                description,
                forecastType,
                startDate,
                endDate: forecastEndDate,
                granularity,
                initialCashPosition: currentPosition.cash,
                outstandingReceivables: currentPosition.receivables,
                outstandingPayables: currentPosition.payables,
                categoryForecasts,
                weeklyForecasts,
                minimumCashBalance: Math.min(...weeklyForecasts.map(w => w.cashBalance)),
                minimumCashDate: weeklyForecasts.find(w => 
                    w.cashBalance === Math.min(...weeklyForecasts.map(wf => wf.cashBalance))
                )?.startDate,
                requiresAdditionalFunding: weeklyForecasts.some(w => w.cashBalance < 0),
                additionalFundingNeeded: Math.abs(Math.min(0, ...weeklyForecasts.map(w => w.cashBalance))),
                scenarioAnalysis,
                alerts,
                createdBy: userId              // Maintain for backward compatibility
            });

            await forecast.save();
            res.status(201).json(forecast);
        } catch (err) {
            console.error('Error creating cash flow forecast:', err);
            res.status(500).json({ msg: 'Server Error: Could not create cash flow forecast.' });
        }
    }

    /**
     * Get historical cash flow data for the organization
     */
    static async getHistoricalCashFlowData(organizationId) {
        const sixMonthsAgo = moment().subtract(6, 'months').toDate();
        
        const expenses = await Expense.aggregate([
            { $match: { organization: organizationId, date: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: {
                        year: { $year: "$date" },
                        month: { $month: "$date" },
                        category: "$category"
                    },
                    total: { $sum: "$amount" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        const revenues = await Revenue.aggregate([
            { $match: { organization: organizationId, date: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: {
                        year: { $year: "$date" },
                        month: { $month: "$date" }
                    },
                    total: { $sum: "$amount" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        return { expenses, revenues };
    }

    /**
     * Get current cash position for the organization
     */
    static async getCurrentCashPosition(organizationId) {
        const bankAccounts = await BankAccount.find({ organization: organizationId });
        const totalCash = bankAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);

        // For MVP, assume no receivables/payables tracking
        return {
            cash: totalCash,
            receivables: 0,
            payables: 0
        };
    }

    /**
     * Generate category-wise forecasts
     */
    static async generateCategoryForecasts(historicalData) {
        const categoryData = {};
        
        // Group expenses by category
        historicalData.expenses.forEach(exp => {
            const category = exp._id.category;
            if (!categoryData[category]) {
                categoryData[category] = [];
            }
            categoryData[category].push(exp.total);
        });

        // Add revenue as a category
        categoryData['Revenue'] = historicalData.revenues.map(r => r.total);

        const forecasts = [];
        
        for (const [category, values] of Object.entries(categoryData)) {
            if (values.length > 0) {
                const growthRates = StatisticalHelpers.calculateGrowthRates(values);
                forecasts.push({
                    category,
                    baseAmount: StatisticalHelpers.weightedMovingAverage(values) || values[values.length - 1],
                    growthRate: growthRates.median,
                    confidence: Math.max(0.5, 1 - growthRates.volatility)
                });
            }
        }

        return forecasts;
    }

    /**
     * Generate weekly forecasts
     */
    static async generateWeeklyForecasts(currentPosition, categoryForecasts, startDate, endDate, granularity) {
        const forecasts = [];
        let currentDate = moment(startDate);
        let weekNumber = 1;
        let cumulativeCashFlow = 0;
        let cashBalance = currentPosition.cash;

        while (currentDate.isBefore(endDate)) {
            const weekStart = currentDate.clone();
            const weekEnd = currentDate.clone().add(6, 'days');

            // Calculate inflows and outflows for this week
            let revenueProjected = 0;
            let operatingExpenses = 0;
            let payroll = 0;

            categoryForecasts.forEach(cf => {
                const weeklyAmount = cf.baseAmount / 4; // Convert monthly to weekly
                const growth = Math.pow(1 + cf.growthRate, (weekNumber - 1) / 4);
                
                if (cf.category === 'Revenue') {
                    revenueProjected = weeklyAmount * growth;
                } else if (cf.category === 'Salaries & Wages') {
                    payroll = weeklyAmount * growth;
                } else {
                    operatingExpenses += weeklyAmount * growth;
                }
            });

            const totalInflows = revenueProjected;
            const totalOutflows = operatingExpenses + payroll;
            const netCashFlow = totalInflows - totalOutflows;
            cumulativeCashFlow += netCashFlow;
            cashBalance += netCashFlow;

            // Calculate confidence level based on forecast type
            let confidenceLevel;
            if (weekNumber <= 4) {
                // First month: high confidence (90-85%)
                confidenceLevel = 0.9 - (weekNumber * 0.0125);
            } else if (weekNumber <= 12) {
                // Months 2-3: moderate confidence (85-70%)
                confidenceLevel = 0.85 - ((weekNumber - 4) * 0.01875);
            } else if (weekNumber <= 26) {
                // Months 4-6: lower confidence (70-50%)
                confidenceLevel = 0.7 - ((weekNumber - 12) * 0.0143);
            } else {
                // Beyond 6 months: maintain minimum confidence
                confidenceLevel = Math.max(0.3, 0.5 - ((weekNumber - 26) * 0.005));
            }

            forecasts.push({
                weekNumber,
                startDate: weekStart.toDate(),
                endDate: weekEnd.toDate(),
                revenueProjected,
                investmentInflows: 0,
                otherInflows: 0,
                totalInflows,
                operatingExpenses,
                payroll,
                otherOutflows: 0,
                totalOutflows,
                netCashFlow,
                cumulativeCashFlow,
                cashBalance,
                confidenceLevel: Math.max(0.1, confidenceLevel), // Ensure minimum 10%
                variance: Math.min(50, weekNumber * 1.5) // Cap variance at 50%
            });

            currentDate.add(7, 'days');
            weekNumber++;
        }

        return forecasts;
    }

    /**
     * Perform scenario analysis
     */
    static performCashFlowScenarioAnalysis(weeklyForecasts, initialCash) {
        const lastForecast = weeklyForecasts[weeklyForecasts.length - 1];
        const minCash = Math.min(...weeklyForecasts.map(w => w.cashBalance));

        return {
            bestCase: {
                endingCash: lastForecast.cashBalance * 1.2,
                minimumCash: minCash * 1.2,
                probability: 0.25
            },
            worstCase: {
                endingCash: lastForecast.cashBalance * 0.7,
                minimumCash: minCash * 0.7,
                probability: 0.25
            },
            mostLikely: {
                endingCash: lastForecast.cashBalance,
                minimumCash: minCash,
                probability: 0.5
            }
        };
    }

    /**
     * Generate cash flow alerts
     */
    static generateCashFlowAlerts(weeklyForecasts) {
        const alerts = [];

        weeklyForecasts.forEach((forecast, index) => {
            if (forecast.cashBalance < 0) {
                alerts.push({
                    severity: 'critical',
                    message: `Cash balance goes negative in week ${forecast.weekNumber}`,
                    date: forecast.startDate,
                    metric: 'cashBalance'
                });
            } else if (forecast.cashBalance < 100000 && index === 0) {
                alerts.push({
                    severity: 'warning',
                    message: 'Cash balance below safety threshold',
                    date: forecast.startDate,
                    metric: 'cashBalance'
                });
            }

            if (forecast.netCashFlow < -50000) {
                alerts.push({
                    severity: 'warning',
                    message: `High burn rate in week ${forecast.weekNumber}`,
                    date: forecast.startDate,
                    metric: 'burnRate'
                });
            }
        });

        return alerts;
    }

    /**
     * Create or update revenue cohort
     * @desc    Create revenue cohort for the active organization
     * @access  Private
     */
    static async createRevenueCohort(req, res) {
        // --- MULTI-TENANCY: Get organization and user from request ---
        const organizationId = req.organization._id;
        const userId = req.user._id;

        try {
            const {
                cohortName,
                cohortStartDate,
                cohortType = 'monthly',
                initialUsers,
                acquisitionChannel,
                acquisitionCost,
                productType,
                metrics = []
            } = req.body;

            // Calculate derived metrics
            const averageCAC = initialUsers > 0 ? acquisitionCost / initialUsers : 0;
            
            // If metrics provided, calculate LTV
            const cohort = new RevenueCohort({
                organization: organizationId,  // Scope to organization
                user: userId,                  // Track creator
                cohortName,
                cohortStartDate,
                cohortType,
                initialUsers,
                acquisitionChannel,
                acquisitionCost,
                averageCAC,
                productType,
                metrics,
                createdBy: userId              // Maintain for backward compatibility
            });

            // Calculate LTV if we have metrics
            if (metrics.length > 0) {
                try {
                    const ltvResults = PredictionAlgorithms.calculateCohortLTV(cohort, 0.1);
                    
                    // Validate and set LTV values with fallbacks
                    cohort.actualLTV = (!isNaN(ltvResults.ltv) && isFinite(ltvResults.ltv)) 
                        ? ltvResults.ltv 
                        : 0;
                    
                    cohort.projectedLTV = (!isNaN(ltvResults.ltv) && isFinite(ltvResults.ltv)) 
                        ? ltvResults.ltv 
                        : 0;
                    
                    cohort.paybackPeriod = (!isNaN(ltvResults.paybackPeriod) && isFinite(ltvResults.paybackPeriod)) 
                        ? ltvResults.paybackPeriod 
                        : null;
                    
                    // Calculate LTV:CAC ratio safely
                    if (averageCAC > 0 && ltvResults.ltvPerUser && !isNaN(ltvResults.ltvPerUser) && isFinite(ltvResults.ltvPerUser)) {
                        cohort.ltcacRatio = ltvResults.ltvPerUser / averageCAC;
                    } else {
                        cohort.ltcacRatio = 0;
                    }
                } catch (ltvError) {
                    console.error('Error calculating LTV:', ltvError);
                    // Set default values if calculation fails
                    cohort.actualLTV = 0;
                    cohort.projectedLTV = 0;
                    cohort.paybackPeriod = null;
                    cohort.ltcacRatio = 0;
                }
            } else {
                // No metrics provided, set default values
                cohort.actualLTV = 0;
                cohort.projectedLTV = 0;
                cohort.paybackPeriod = null;
                cohort.ltcacRatio = 0;
            }

            await cohort.save();
            res.status(201).json(cohort);
        } catch (err) {
            console.error('Error creating revenue cohort:', err);
            res.status(500).json({ msg: 'Server Error: Could not create revenue cohort.' });
        }
    }

    /**
     * Generate cohort projections
     * @desc    Generate projections for a revenue cohort
     * @access  Private
     */
    static async generateCohortProjections(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            const { cohortId } = req.params;
            const { projectionMonths = 24 } = req.body;

            if (!mongoose.Types.ObjectId.isValid(cohortId)) {
                return res.status(400).json({ msg: 'Invalid cohort ID' });
            }

            // --- MULTI-TENANCY: Filter by cohortId AND organizationId ---
            const cohort = await RevenueCohort.findOne({ 
                _id: cohortId,
                organization: organizationId 
            });
            
            if (!cohort) {
                return res.status(404).json({ msg: 'Cohort not found within your organization.' });
            }

            // Get historical metrics
            const historicalMetrics = cohort.metrics.filter(m => !m.isProjected);
            if (historicalMetrics.length < 3) {
                return res.status(400).json({ 
                    msg: 'Need at least 3 months of historical data for projections' 
                });
            }

            // Project retention
            const retentionRates = historicalMetrics.map(m => m.retentionRate || 0);
            const projectedRetention = PredictionAlgorithms.projectCohortRetention(
                cohort.initialUsers,
                retentionRates,
                projectionMonths
            );

            // Project revenue per user
            const revenuePerUser = historicalMetrics.map(m => 
                m.activeUsers > 0 ? m.revenue / m.activeUsers : 0
            );
            const projectedRPU = PredictionAlgorithms.exponentialSmoothing(
                revenuePerUser, 
                0.3, 
                projectionMonths - historicalMetrics.length
            );

            // Combine projections
            const projectedMetrics = [];
            for (let i = historicalMetrics.length; i < projectionMonths; i++) {
                const retention = projectedRetention[i];
                const rpu = projectedRPU[i - historicalMetrics.length] || 
                           revenuePerUser[revenuePerUser.length - 1];
                
                projectedMetrics.push({
                    periodNumber: i,
                    periodLabel: `Month ${i}`,
                    activeUsers: Math.round(retention.activeUsers),
                    churnedUsers: retention.churnedUsers,
                    retentionRate: retention.retention,
                    revenue: Math.round(retention.activeUsers * rpu),
                    averageRevenuePerUser: rpu,
                    cumulativeRevenue: 0, // Will calculate after
                    isProjected: true,
                    confidenceLevel: Math.max(0.5, 1 - (i - historicalMetrics.length) * 0.03)
                });
            }

            // Calculate cumulative revenue
            let cumRevenue = historicalMetrics[historicalMetrics.length - 1]?.cumulativeRevenue || 0;
            projectedMetrics.forEach(m => {
                cumRevenue += m.revenue;
                m.cumulativeRevenue = cumRevenue;
            });

            // Update cohort with projections
            cohort.metrics = [...historicalMetrics, ...projectedMetrics];
            cohort.projectionMonths = projectionMonths;

            // Recalculate LTV with projections
            const ltvResults = PredictionAlgorithms.calculateCohortLTV(cohort, 0.1);
            
            // Validate and set LTV values with fallbacks
            cohort.projectedLTV = (!isNaN(ltvResults.ltv) && isFinite(ltvResults.ltv)) 
                ? ltvResults.ltv 
                : 0;
            
            cohort.paybackPeriod = (!isNaN(ltvResults.paybackPeriod) && isFinite(ltvResults.paybackPeriod)) 
                ? ltvResults.paybackPeriod 
                : null;
            
            // Calculate LTV:CAC ratio safely
            if (cohort.averageCAC > 0 && ltvResults.ltvPerUser && !isNaN(ltvResults.ltvPerUser) && isFinite(ltvResults.ltvPerUser)) {
                cohort.ltcacRatio = ltvResults.ltvPerUser / cohort.averageCAC;
            } else {
                cohort.ltcacRatio = 0;
            }

            // Generate insights
            cohort.insights = PredictiveAnalyticsController.generateCohortInsights(cohort, ltvResults);

            await cohort.save();
            res.json({
                cohort,
                projectionSummary: {
                    monthsProjected: projectionMonths - historicalMetrics.length,
                    projectedLTV: ltvResults.ltv,
                    projectedLTVPerUser: ltvResults.ltvPerUser,
                    paybackPeriod: ltvResults.paybackPeriod,
                    confidence: ltvResults.confidence
                }
            });
        } catch (err) {
            console.error('Error generating cohort projections:', err);
            res.status(500).json({ msg: 'Server Error: Could not generate projections.' });
        }
    }

    /**
     * Generate cohort insights
     */
    static generateCohortInsights(cohort, ltvResults) {
        const insights = [];

        // Retention insights
        const latestRetention = cohort.metrics[cohort.metrics.length - 1]?.retentionRate || 0;
        if (latestRetention < 0.2) {
            insights.push({
                type: 'retention',
                severity: 'critical',
                message: 'Retention rate is critically low',
                recommendedAction: 'Investigate product-market fit and user experience issues'
            });
        }

        // LTV:CAC insights
        if (cohort.ltcacRatio < 1) {
            insights.push({
                type: 'ltv',
                severity: 'critical',
                message: 'LTV:CAC ratio is below 1',
                recommendedAction: 'Reduce acquisition costs or improve monetization'
            });
        } else if (cohort.ltcacRatio > 3) {
            insights.push({
                type: 'ltv',
                severity: 'positive',
                message: 'Excellent LTV:CAC ratio',
                recommendedAction: 'Consider scaling acquisition in this channel'
            });
        }

        // Payback period insights
        if (cohort.paybackPeriod > 12) {
            insights.push({
                type: 'ltv',
                severity: 'warning',
                message: 'Long payback period',
                recommendedAction: 'Focus on early monetization or reduce CAC'
            });
        }

        return insights;
    }

    /**
     * Get all scenarios with comparison
     * @desc    Compare runway scenarios for the active organization
     * @access  Private
     */
    static async compareRunwayScenarios(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            // --- MULTI-TENANCY: Filter by organizationId ---
            const scenarios = await RunwayScenario.find({
                organization: organizationId,
                isActive: true
            }).sort({ createdAt: -1 }).limit(5);

            if (scenarios.length === 0) {
                return res.json({ msg: 'No scenarios found', comparison: [] });
            }

            const comparison = scenarios.map(scenario => ({
                id: scenario._id,
                name: scenario.name,
                type: scenario.scenarioType,
                runwayMonths: scenario.totalRunwayMonths,
                cashOutDate: scenario.dateOfCashOut,
                breakEvenMonth: scenario.breakEvenMonth,
                totalBurned: scenario.totalCashBurned,
                assumptions: {
                    burnGrowth: scenario.assumptions.find(a => a.metric === 'monthly_burn_rate')?.growthRate || 0,
                    revenueGrowth: scenario.assumptions.find(a => a.metric === 'revenue_growth_rate')?.growthRate || 0
                },
                createdBy: scenario.user // Show who created it
            }));

            // Sort by runway months
            comparison.sort((a, b) => b.runwayMonths - a.runwayMonths);

            res.json({
                scenarios: comparison,
                insights: {
                    bestCase: comparison[0],
                    worstCase: comparison[comparison.length - 1],
                    averageRunway: comparison.reduce((sum, s) => sum + s.runwayMonths, 0) / comparison.length
                }
            });
        } catch (err) {
            console.error('Error comparing scenarios:', err);
            res.status(500).json({ msg: 'Server Error' });
        }
    }

    /**
     * Get all cohorts with comparison
     * @desc    Compare revenue cohorts for the active organization
     * @access  Private
     */
    static async getCohortsComparison(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            // --- MULTI-TENANCY: Filter by organizationId ---
            const cohorts = await RevenueCohort.find({
                organization: organizationId
            }).sort({ cohortStartDate: -1 });

            const comparison = cohorts.map(cohort => ({
                id: cohort._id,
                name: cohort.cohortName,
                startDate: cohort.cohortStartDate,
                initialUsers: cohort.initialUsers,
                currentRetention: cohort.metrics[cohort.metrics.length - 1]?.retentionRate || 0,
                ltv: cohort.projectedLTV || cohort.actualLTV || 0,
                cac: cohort.averageCAC || 0,
                ltcacRatio: cohort.ltcacRatio || 0,
                paybackPeriod: cohort.paybackPeriod || null,
                totalRevenue: cohort.metrics[cohort.metrics.length - 1]?.cumulativeRevenue || 0,
                createdBy: cohort.user // Show who created it
            }));

            // Best performing cohorts
            const validCohorts = comparison.filter(c => c.ltv > 0);
            const bestByLTV = validCohorts.length > 0 
                ? [...validCohorts].sort((a, b) => b.ltv - a.ltv)[0] 
                : null;
            const bestByRetention = [...comparison].sort((a, b) => b.currentRetention - a.currentRetention)[0];

            res.json({
                cohorts: comparison,
                insights: {
                    bestByLTV,
                    bestByRetention,
                    averageLTV: validCohorts.length > 0 
                        ? validCohorts.reduce((sum, c) => sum + c.ltv, 0) / validCohorts.length 
                        : 0,
                    averageRetention: comparison.length > 0 
                        ? comparison.reduce((sum, c) => sum + c.currentRetention, 0) / comparison.length 
                        : 0
                }
            });
        } catch (err) {
            console.error('Error comparing cohorts:', err);
            res.status(500).json({ msg: 'Server Error' });
        }
    }

    /**
     * Get all fundraising predictions
     * @desc    Get fundraising predictions for the active organization
     * @access  Private
     */
    static async getFundraisingPredictions(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            // --- MULTI-TENANCY: Filter by organizationId ---
            const predictions = await FundraisingPrediction.find({
                organization: organizationId
            })
            .populate('linkedRoundId', 'name')
            .populate('user', 'name email')  // Show who created it
            .sort({ createdAt: -1 })
            .limit(50);

            res.json(predictions);
        } catch (err) {
            console.error('Error fetching fundraising predictions:', err);
            res.status(500).json({ msg: 'Server Error: Could not fetch fundraising predictions.' });
        }
    }

    /**
     * Get all cash flow forecasts
     * @desc    Get cash flow forecasts for the active organization
     * @access  Private
     */
    static async getCashFlowForecasts(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            // --- MULTI-TENANCY: Filter by organizationId ---
            const forecasts = await CashFlowForecast.find({
                organization: organizationId,
                isActive: true
            })
            .populate('user', 'name email')  // Show who created it
            .sort({ createdAt: -1 })
            .limit(50);

            res.json(forecasts);
        } catch (err) {
            console.error('Error fetching cash flow forecasts:', err);
            res.status(500).json({ msg: 'Server Error: Could not fetch cash flow forecasts.' });
        }
    }

    /**
     * Get all revenue cohorts
     * @desc    Get revenue cohorts for the active organization
     * @access  Private
     */
    static async getRevenueCohorts(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            // --- MULTI-TENANCY: Filter by organizationId ---
            const cohorts = await RevenueCohort.find({
                organization: organizationId
            })
            .populate('user', 'name email')  // Show who created it
            .sort({ cohortStartDate: -1 })
            .limit(100);

            res.json(cohorts);
        } catch (err) {
            console.error('Error fetching revenue cohorts:', err);
            res.status(500).json({ msg: 'Server Error: Could not fetch revenue cohorts.' });
        }
    }

    /**
     * Get fundraising prediction by ID
     * @desc    Get specific fundraising prediction for the active organization
     * @access  Private
     */
    static async getFundraisingPredictionById(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ msg: 'Invalid prediction ID' });
            }

            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const prediction = await FundraisingPrediction.findOne({
                _id: req.params.id,
                organization: organizationId
            })
            .populate('linkedRoundId', 'name')
            .populate('user', 'name email');
            
            if (!prediction) {
                return res.status(404).json({ msg: 'Prediction not found within your organization.' });
            }

            res.json(prediction);
        } catch (err) {
            console.error('Error fetching fundraising prediction:', err);
            res.status(500).json({ msg: 'Server Error' });
        }
    }

    /**
     * Delete fundraising prediction
     * @desc    Delete fundraising prediction for the active organization
     * @access  Private
     */
    static async deleteFundraisingPrediction(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ msg: 'Invalid prediction ID' });
            }

            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const prediction = await FundraisingPrediction.findOneAndDelete({
                _id: req.params.id,
                organization: organizationId
            });
            
            if (!prediction) {
                return res.status(404).json({ msg: 'Prediction not found within your organization or already deleted.' });
            }

            res.json({ msg: 'Fundraising prediction deleted' });
        } catch (err) {
            console.error('Error deleting fundraising prediction:', err);
            res.status(500).json({ msg: 'Server Error' });
        }
    }

    /**
     * Get cash flow forecast by ID
     * @desc    Get specific cash flow forecast for the active organization
     * @access  Private
     */
    static async getCashFlowForecastById(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ msg: 'Invalid forecast ID' });
            }

            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const forecast = await CashFlowForecast.findOne({
                _id: req.params.id,
                organization: organizationId
            })
            .populate('user', 'name email');
            
            if (!forecast) {
                return res.status(404).json({ msg: 'Forecast not found within your organization.' });
            }

            res.json(forecast);
        } catch (err) {
            console.error('Error fetching cash flow forecast:', err);
            res.status(500).json({ msg: 'Server Error' });
        }
    }

    /**
     * Delete cash flow forecast
     * @desc    Delete cash flow forecast for the active organization
     * @access  Private
     */
    static async deleteCashFlowForecast(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ msg: 'Invalid forecast ID' });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const forecast = await CashFlowForecast.findOne({
                _id: req.params.id,
                organization: organizationId
            });
            
            if (!forecast) {
                return res.status(404).json({ msg: 'Forecast not found within your organization.' });
            }

            // Soft delete
            forecast.isActive = false;
            await forecast.save();
            
            res.json({ msg: 'Cash flow forecast deleted' });
        } catch (err) {
            console.error('Error deleting cash flow forecast:', err);
            res.status(500).json({ msg: 'Server Error' });
        }
    }

    /**
     * Get revenue cohort by ID
     * @desc    Get specific revenue cohort for the active organization
     * @access  Private
     */
    static async getRevenueCohortById(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ msg: 'Invalid cohort ID' });
            }

            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const cohort = await RevenueCohort.findOne({
                _id: req.params.id,
                organization: organizationId
            })
            .populate('user', 'name email');
            
            if (!cohort) {
                return res.status(404).json({ msg: 'Cohort not found within your organization.' });
            }

            res.json(cohort);
        } catch (err) {
            console.error('Error fetching revenue cohort:', err);
            res.status(500).json({ msg: 'Server Error' });
        }
    }

    /**
     * Delete revenue cohort
     * @desc    Delete revenue cohort for the active organization
     * @access  Private
     */
    static async deleteRevenueCohort(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ msg: 'Invalid cohort ID' });
            }

            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const cohort = await RevenueCohort.findOneAndDelete({
                _id: req.params.id,
                organization: organizationId
            });
            
            if (!cohort) {
                return res.status(404).json({ msg: 'Cohort not found within your organization or already deleted.' });
            }

            res.json({ msg: 'Revenue cohort deleted' });
        } catch (err) {
            console.error('Error deleting revenue cohort:', err);
            res.status(500).json({ msg: 'Server Error' });
        }
    }

    /**
     * Update metrics for a revenue cohort
     * @desc    Update cohort metrics for the active organization
     * @access  Private
     */
    static async updateCohortMetrics(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ msg: 'Invalid cohort ID' });
            }

            const { metrics } = req.body;
            
            if (!metrics || !Array.isArray(metrics)) {
                return res.status(400).json({ msg: 'Metrics array is required' });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const cohort = await RevenueCohort.findOne({
                _id: req.params.id,
                organization: organizationId
            });
            
            if (!cohort) {
                return res.status(404).json({ msg: 'Cohort not found within your organization.' });
            }

            // Validate the metrics array and ensure all required fields are present
            for (const metric of metrics) {
                if (typeof metric.periodNumber !== 'number' || !metric.periodLabel) {
                    return res.status(400).json({ 
                        msg: 'Each metric must include periodNumber and periodLabel' 
                    });
                }
            }

            // Update the metrics
            cohort.metrics = metrics;
            
            // Sort metrics by period number
            cohort.metrics.sort((a, b) => a.periodNumber - b.periodNumber);
            
            // Calculate and update LTV if we have non-projected metrics
            const historicalMetrics = metrics.filter(m => !m.isProjected);
            if (historicalMetrics.length > 0) {
                try {
                    const ltvResults = PredictionAlgorithms.calculateCohortLTV(cohort, 0.1);
                    
                    // Update LTV fields
                    cohort.actualLTV = (!isNaN(ltvResults.ltv) && isFinite(ltvResults.ltv)) 
                        ? ltvResults.ltv 
                        : cohort.actualLTV || 0;
                    
                    // Calculate LTV:CAC ratio
                    if (cohort.averageCAC > 0 && ltvResults.ltvPerUser && !isNaN(ltvResults.ltvPerUser) && isFinite(ltvResults.ltvPerUser)) {
                        cohort.ltcacRatio = ltvResults.ltvPerUser / cohort.averageCAC;
                    }
                    
                    // Generate insights
                    cohort.insights = PredictiveAnalyticsController.generateCohortInsights(cohort, ltvResults);
                } catch (ltvError) {
                    console.error('Error calculating LTV:', ltvError);
                    // Keep existing values if calculation fails
                }
            }

            // Save the updated cohort
            await cohort.save();
            res.json(cohort);
        } catch (err) {
            console.error('Error updating cohort metrics:', err);
            res.status(500).json({ msg: 'Server Error: Could not update cohort metrics.' });
        }
    }

    /**
     * Get runway scenario by ID
     * @desc    Get specific runway scenario for the active organization
     * @access  Private
     */
    static async getRunwayScenarioById(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ msg: 'Invalid scenario ID' });
            }

            // --- MULTI-TENANCY: Filter by _id AND organizationId ---
            const scenario = await RunwayScenario.findOne({
                _id: req.params.id,
                organization: organizationId
            })
            .populate('user', 'name email');
            
            if (!scenario) {
                return res.status(404).json({ msg: 'Scenario not found within your organization.' });
            }

            res.json(scenario);
        } catch (err) {
            console.error('Error fetching runway scenario:', err);
            res.status(500).json({ msg: 'Server Error' });
        }
    }

    /**
     * Delete runway scenario
     * @desc    Delete runway scenario for the active organization
     * @access  Private
     */
    static async deleteRunwayScenario(req, res) {
        // --- MULTI-TENANCY: Get organization from request ---
        const organizationId = req.organization._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(400).json({ msg: 'Invalid scenario ID' });
            }

            // --- MULTI-TENANCY: Find by _id AND organizationId ---
            const scenario = await RunwayScenario.findOne({
                _id: req.params.id,
                organization: organizationId
            });
            
            if (!scenario) {
                return res.status(404).json({ msg: 'Scenario not found within your organization.' });
            }

            // Soft delete
            scenario.isActive = false;
            await scenario.save();
            
            res.json({ msg: 'Runway scenario deleted' });
        } catch (err) {
            console.error('Error deleting runway scenario:', err);
            res.status(500).json({ msg: 'Server Error' });
        }
    }
}

module.exports = PredictiveAnalyticsController;