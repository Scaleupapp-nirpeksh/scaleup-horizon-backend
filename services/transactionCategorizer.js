// services/transactionCategorizer.js
const natural = require('natural');
const fs = require('fs').promises;
const path = require('path');

class TransactionCategorizer {
    constructor() {
        this.classifier = new natural.BayesClassifier();
        this.categories = {
            'Tech Infrastructure': [
                'aws', 'google cloud', 'azure', 'digitalocean', 'hosting', 'server',
                'domain', 'ssl', 'cdn', 'cloudflare', 'github', 'gitlab', 'database',
                'mongodb', 'redis', 'elasticsearch', 'datadog', 'new relic'
            ],
            'Marketing & Sales': [
                'google ads', 'facebook ads', 'linkedin', 'marketing', 'advertising',
                'campaign', 'seo', 'content', 'hubspot', 'mailchimp', 'sendgrid',
                'social media', 'influencer', 'pr agency', 'branding'
            ],
            'Salaries & Wages': [
                'salary', 'payroll', 'wages', 'bonus', 'commission', 'contractor',
                'freelance', 'consultant', 'employee', 'staff', 'compensation'
            ],
            'Software & Subscriptions': [
                'subscription', 'saas', 'software', 'license', 'slack', 'zoom',
                'microsoft', 'adobe', 'figma', 'notion', 'jira', 'asana', 'canva'
            ],
            'Legal & Professional': [
                'lawyer', 'legal', 'attorney', 'accounting', 'cpa', 'audit',
                'compliance', 'registration', 'trademark', 'patent', 'consulting'
            ],
            'Rent & Utilities': [
                'rent', 'lease', 'office', 'electricity', 'water', 'internet',
                'phone', 'utilities', 'maintenance', 'cleaning', 'security'
            ],
            'Travel & Entertainment': [
                'flight', 'hotel', 'uber', 'ola', 'taxi', 'meals', 'restaurant',
                'conference', 'event', 'team lunch', 'client dinner', 'travel'
            ],
            'Office Supplies': [
                'stationery', 'supplies', 'furniture', 'equipment', 'laptop',
                'monitor', 'keyboard', 'mouse', 'desk', 'chair', 'printer'
            ]
        };
        
        this.modelPath = path.join(__dirname, '../ml-models/transaction-classifier.json');
        this.isModelLoaded = false;
    }

    async initialize() {
        try {
            // Try to load existing model
            await this.loadModel();
        } catch (error) {
            console.log('No existing model found, training new model...');
            await this.trainInitialModel();
        }
    }

    async trainInitialModel() {
        // Train with predefined patterns
        for (const [category, keywords] of Object.entries(this.categories)) {
            for (const keyword of keywords) {
                // Add variations
                this.classifier.addDocument(keyword, category);
                this.classifier.addDocument(keyword.toUpperCase(), category);
                this.classifier.addDocument(`${keyword} payment`, category);
                this.classifier.addDocument(`${keyword} invoice`, category);
                this.classifier.addDocument(`${keyword} expense`, category);
            }
        }

        // Add some Indian-specific training data
        this.addIndianSpecificData();
        
        // Train the classifier
        this.classifier.train();
        
        // Save the model
        await this.saveModel();
        this.isModelLoaded = true;
    }

    addIndianSpecificData() {
        // Indian payment methods and services
        const indianPatterns = {
            'Tech Infrastructure': [
                'razorpay', 'paytm', 'phonepe', 'bharatpe', 'airtel cloud'
            ],
            'Marketing & Sales': [
                'times of india', 'hindustan times', 'mint', 'economic times'
            ],
            'Travel & Entertainment': [
                'makemytrip', 'goibibo', 'irctc', 'redbus', 'swiggy', 'zomato'
            ],
            'Legal & Professional': [
                'gst payment', 'tds payment', 'roc filing', 'mca', 'income tax'
            ]
        };

        for (const [category, keywords] of Object.entries(indianPatterns)) {
            for (const keyword of keywords) {
                this.classifier.addDocument(keyword, category);
            }
        }
    }

    async categorizeTransaction(description, amount, vendor) {
        if (!this.isModelLoaded) {
            await this.initialize();
        }

        // Combine all available information
        const combinedText = `${description} ${vendor || ''}`.toLowerCase();
        
        // Get classification with confidence scores
        const classifications = this.classifier.getClassifications(combinedText);
        const topCategory = classifications[0];
        
        // Calculate confidence
        const confidence = this.calculateConfidence(classifications);
        
        // Apply business rules for edge cases
        const finalCategory = this.applyBusinessRules(
            topCategory.label,
            combinedText,
            amount,
            confidence
        );

        return {
            category: finalCategory,
            confidence: confidence,
            allScores: classifications.slice(0, 3).map(c => ({
                category: c.label,
                score: c.value
            })),
            requiresReview: confidence < 0.7
        };
    }

    calculateConfidence(classifications) {
        if (classifications.length < 2) return 1;
        
        // Calculate relative confidence based on top 2 scores
        const topScore = classifications[0].value;
        const secondScore = classifications[1].value;
        
        // If top score is significantly higher, we're confident
        const relativeConfidence = (topScore - secondScore) / topScore;
        
        // Also consider absolute score
        const absoluteConfidence = topScore;
        
        // Weighted average
        return (relativeConfidence * 0.7 + absoluteConfidence * 0.3);
    }

    applyBusinessRules(category, text, amount, confidence) {
        // Rule 1: Large amounts (>₹100k) for unknown vendors should be reviewed
        if (amount > 100000 && confidence < 0.8) {
            return 'Other';
        }

        // Rule 2: Salary-related keywords override other categories
        const salaryKeywords = ['salary', 'payroll', 'ctc', 'compensation'];
        if (salaryKeywords.some(keyword => text.includes(keyword))) {
            return 'Salaries & Wages';
        }

        // Rule 3: GST/Tax payments are always Legal & Professional
        const taxKeywords = ['gst', 'tax', 'tds', 'duty', 'cess'];
        if (taxKeywords.some(keyword => text.includes(keyword))) {
            return 'Legal & Professional';
        }

        return category;
    }

    async learnFromCorrection(transactionId, description, vendor, correctCategory) {
        // Add this correction to training data
        const text = `${description} ${vendor || ''}`.toLowerCase();
        this.classifier.addDocument(text, correctCategory);
        
        // Retrain with new data
        this.classifier.train();
        
        // Save updated model
        await this.saveModel();
        
        // Log for analytics
        await this.logCorrection(transactionId, correctCategory);
    }

    async bulkCategorize(transactions) {
        const results = [];
        
        for (const transaction of transactions) {
            const result = await this.categorizeTransaction(
                transaction.description,
                transaction.amount,
                transaction.vendor
            );
            
            results.push({
                transactionId: transaction._id,
                ...result
            });
        }
        
        return results;
    }

    async getCategoryInsights() {
        // Analyze categorization patterns
        const insights = {
            totalTransactionsCategorized: 0,
            categoryDistribution: {},
            averageConfidence: 0,
            lowConfidenceTransactions: [],
            commonMiscategorizations: []
        };

        // This would query from database in production
        // For now, return mock insights
        return insights;
    }

    async saveModel() {
        const modelData = JSON.stringify(this.classifier);
        await fs.mkdir(path.dirname(this.modelPath), { recursive: true });
        await fs.writeFile(this.modelPath, modelData);
    }

    async loadModel() {
        const modelData = await fs.readFile(this.modelPath, 'utf8');
        this.classifier = natural.BayesClassifier.restore(JSON.parse(modelData));
        this.isModelLoaded = true;
    }

    async logCorrection(transactionId, correctCategory) {
        // In production, this would save to database
        console.log(`Learning: Transaction ${transactionId} -> ${correctCategory}`);
    }

    // Advanced ML Features
    async suggestNewCategories(uncategorizedTransactions) {
        // Use clustering to identify potential new categories
        const clusters = {};
        
        for (const transaction of uncategorizedTransactions) {
            const tokens = natural.PorterStemmer.tokenizeAndStem(
                transaction.description
            );
            
            // Simple clustering by common tokens
            for (const token of tokens) {
                if (!clusters[token]) {
                    clusters[token] = [];
                }
                clusters[token].push(transaction);
            }
        }
        
        // Find significant clusters
        const significantClusters = Object.entries(clusters)
            .filter(([token, transactions]) => transactions.length > 5)
            .map(([token, transactions]) => ({
                suggestedCategory: token,
                transactionCount: transactions.length,
                totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
                examples: transactions.slice(0, 3)
            }));
        
        return significantClusters;
    }
}

// Singleton instance
let categorizerInstance = null;

module.exports = {
    getTransactionCategorizer: async () => {
        if (!categorizerInstance) {
            categorizerInstance = new TransactionCategorizer();
            await categorizerInstance.initialize();
        }
        return categorizerInstance;
    },
    TransactionCategorizer
};