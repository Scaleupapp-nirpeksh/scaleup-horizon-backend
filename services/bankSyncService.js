// services/bankSyncService.js
const mongoose = require('mongoose');
const moment = require('moment');
const crypto = require('crypto');
const { getTransactionCategorizer } = require('./transactionCategorizer');

// New Model for Bank Transactions
const BankTransactionSchema = new mongoose.Schema({
    bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', required: true },
    transactionId: { type: String, required: true }, // Unique ID from bank
    date: { type: Date, required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true }, // Negative for debits, positive for credits
    balance: { type: Number }, // Balance after transaction
    type: { type: String, enum: ['credit', 'debit'], required: true },
    
    // Categorization
    category: { type: String },
    isAutoCategized: { type: Boolean, default: false },
    categorizationConfidence: { type: Number },
    
    // Reconciliation
    reconciliationStatus: {
        type: String,
        enum: ['pending', 'matched', 'manual_review', 'ignored'],
        default: 'pending'
    },
    matchedExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
    matchedRevenueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Revenue' },
    
    // Manual import metadata
    importBatchId: { type: String },
    importSource: { type: String, enum: ['manual_csv', 'manual_entry', 'api', 'pdf'], default: 'manual_csv' },
    
    // Additional metadata
    merchantName: { type: String },
    merchantCategory: { type: String },
    location: { type: String },
    notes: { type: String },
    tags: [{ type: String }],
    
    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'HorizonUser' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

BankTransactionSchema.index({ bankAccountId: 1, transactionId: 1 }, { unique: true });
BankTransactionSchema.index({ date: -1 });
BankTransactionSchema.index({ reconciliationStatus: 1 });

const BankTransaction = mongoose.model('BankTransaction', BankTransactionSchema);

class BankSyncService {
    constructor() {
        this.supportedFormats = {
            'hdfc': this.parseHDFCFormat,
            'icici': this.parseICICIFormat,
            'sbi': this.parseSBIFormat,
            'axis': this.parseAxisFormat,
            'generic': this.parseGenericFormat
        };
    }

    // Manual CSV Import
    async importBankStatement(csvData, bankAccountId, bankFormat, userId) {
        const importBatchId = this.generateBatchId();
        const transactions = [];
        const errors = [];
        
        try {
            // Parse CSV based on bank format
            const parser = this.supportedFormats[bankFormat] || this.supportedFormats.generic;
            const parsedTransactions = await parser.call(this, csvData);
            
            // Get transaction categorizer
            const categorizer = await getTransactionCategorizer();
            
            // Process each transaction
            for (const txn of parsedTransactions) {
                try {
                    // Check for duplicates
                    const existing = await BankTransaction.findOne({
                        bankAccountId,
                        transactionId: txn.transactionId
                    });
                    
                    if (existing) {
                        errors.push({
                            row: txn.rowNumber,
                            error: 'Duplicate transaction',
                            transactionId: txn.transactionId
                        });
                        continue;
                    }
                    
                    // Auto-categorize
                    const categorization = await categorizer.categorizeTransaction(
                        txn.description,
                        Math.abs(txn.amount),
                        txn.merchantName
                    );
                    
                    // Create transaction record
                    const bankTransaction = new BankTransaction({
                        bankAccountId,
                        transactionId: txn.transactionId,
                        date: txn.date,
                        description: txn.description,
                        amount: txn.amount,
                        balance: txn.balance,
                        type: txn.amount > 0 ? 'credit' : 'debit',
                        category: categorization.category,
                        isAutoCategized: true,
                        categorizationConfidence: categorization.confidence,
                        merchantName: txn.merchantName,
                        importBatchId,
                        importSource: 'manual_csv',
                        createdBy: userId
                    });
                    
                    transactions.push(bankTransaction);
                } catch (error) {
                    errors.push({
                        row: txn.rowNumber,
                        error: error.message,
                        data: txn
                    });
                }
            }
            
            // Bulk save transactions
            if (transactions.length > 0) {
                await BankTransaction.insertMany(transactions);
                
                // Update bank account balance
                await this.updateBankAccountBalance(bankAccountId);
                
                // Trigger auto-reconciliation
                await this.autoReconcile(bankAccountId, importBatchId);
            }
            
            return {
                success: true,
                importBatchId,
                imported: transactions.length,
                errors: errors.length,
                errorDetails: errors,
                summary: {
                    totalDebits: transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + Math.abs(t.amount), 0),
                    totalCredits: transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0),
                    dateRange: {
                        from: transactions.length > 0 ? moment.min(transactions.map(t => moment(t.date))).toDate() : null,
                        to: transactions.length > 0 ? moment.max(transactions.map(t => moment(t.date))).toDate() : null
                    }
                }
            };
        } catch (error) {
            console.error('Bank import error:', error);
            return {
                success: false,
                error: error.message,
                importBatchId,
                imported: 0,
                errors: errors.length + 1
            };
        }
    }

    // Bank-specific parsers
    parseHDFCFormat(csvData) {
        const lines = csvData.split('\n');
        const transactions = [];
        
        // HDFC CSV format:
        // Date,Narration,Value Dat,Debit Amount,Credit Amount,Chq/Ref Number,Closing Balance
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const [date, narration, valueDate, debit, credit, refNumber, balance] = this.parseCSVLine(line);
            
            if (!date || !narration) continue;
            
            const amount = credit ? parseFloat(credit) : -parseFloat(debit || 0);
            
            transactions.push({
                rowNumber: i + 1,
                transactionId: this.generateTransactionId(date, refNumber, amount),
                date: moment(date, 'DD/MM/YY').toDate(),
                description: narration,
                amount: amount,
                balance: parseFloat(balance) || null,
                merchantName: this.extractMerchantName(narration),
                referenceNumber: refNumber
            });
        }
        
        return transactions;
    }

    parseICICIFormat(csvData) {
        const lines = csvData.split('\n');
        const transactions = [];
        
        // ICICI format:
        // S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Debit Amount,Credit Amount,Balance
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const [sno, valueDate, txnDate, chequeNo, remarks, debit, credit, balance] = this.parseCSVLine(line);
            
            if (!txnDate || !remarks) continue;
            
            const amount = credit ? parseFloat(credit) : -parseFloat(debit || 0);
            
            transactions.push({
                rowNumber: i + 1,
                transactionId: this.generateTransactionId(txnDate, chequeNo || sno, amount),
                date: moment(txnDate, 'DD-MM-YYYY').toDate(),
                description: remarks,
                amount: amount,
                balance: parseFloat(balance) || null,
                merchantName: this.extractMerchantName(remarks),
                referenceNumber: chequeNo
            });
        }
        
        return transactions;
    }

    parseSBIFormat(csvData) {
        const lines = csvData.split('\n');
        const transactions = [];
        
        // SBI format:
        // Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const [txnDate, valueDate, description, refNo, debit, credit, balance] = this.parseCSVLine(line);
            
            if (!txnDate || !description) continue;
            
            const amount = credit ? parseFloat(credit) : -parseFloat(debit || 0);
            
            transactions.push({
                rowNumber: i + 1,
                transactionId: this.generateTransactionId(txnDate, refNo, amount),
                date: moment(txnDate, 'DD-MM-YYYY').toDate(),
                description: description,
                amount: amount,
                balance: parseFloat(balance) || null,
                merchantName: this.extractMerchantName(description),
                referenceNumber: refNo
            });
        }
        
        return transactions;
    }

    parseAxisFormat(csvData) {
        // Similar to other banks
        return this.parseGenericFormat(csvData);
    }

    parseGenericFormat(csvData) {
        const lines = csvData.split('\n');
        const transactions = [];
        const headers = this.parseCSVLine(lines[0].toLowerCase());
        
        // Try to identify column indices
        const dateIndex = headers.findIndex(h => h.includes('date'));
        const descIndex = headers.findIndex(h => h.includes('description') || h.includes('narration') || h.includes('remarks'));
        const debitIndex = headers.findIndex(h => h.includes('debit') || h.includes('withdrawal'));
        const creditIndex = headers.findIndex(h => h.includes('credit') || h.includes('deposit'));
        const balanceIndex = headers.findIndex(h => h.includes('balance'));
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = this.parseCSVLine(line);
            
            const date = values[dateIndex];
            const description = values[descIndex];
            const debit = values[debitIndex];
            const credit = values[creditIndex];
            const balance = values[balanceIndex];
            
            if (!date || !description) continue;
            
            const amount = credit ? parseFloat(credit) : -parseFloat(debit || 0);
            
            transactions.push({
                rowNumber: i + 1,
                transactionId: this.generateTransactionId(date, i.toString(), amount),
                date: this.parseDate(date),
                description: description,
                amount: amount,
                balance: parseFloat(balance) || null,
                merchantName: this.extractMerchantName(description)
            });
        }
        
        return transactions;
    }

    // Auto-reconciliation
    async autoReconcile(bankAccountId, importBatchId) {
        const unmatchedTransactions = await BankTransaction.find({
            bankAccountId,
            importBatchId,
            reconciliationStatus: 'pending'
        });
        
        let matchedCount = 0;
        let reviewCount = 0;
        
        for (const txn of unmatchedTransactions) {
            try {
                if (txn.type === 'debit') {
                    // Try to match with expenses
                    const potentialMatches = await this.findExpenseMatches(txn);
                    
                    if (potentialMatches.length === 1 && potentialMatches[0].confidence > 0.9) {
                        // High confidence single match
                        txn.reconciliationStatus = 'matched';
                        txn.matchedExpenseId = potentialMatches[0].expense._id;
                        matchedCount++;
                    } else if (potentialMatches.length > 0) {
                        // Multiple potential matches or low confidence
                        txn.reconciliationStatus = 'manual_review';
                        reviewCount++;
                    }
                } else {
                    // Try to match with revenue
                    const potentialMatches = await this.findRevenueMatches(txn);
                    
                    if (potentialMatches.length === 1 && potentialMatches[0].confidence > 0.9) {
                        txn.reconciliationStatus = 'matched';
                        txn.matchedRevenueId = potentialMatches[0].revenue._id;
                        matchedCount++;
                    } else if (potentialMatches.length > 0) {
                        txn.reconciliationStatus = 'manual_review';
                        reviewCount++;
                    }
                }
                
                await txn.save();
            } catch (error) {
                console.error('Auto-reconcile error for transaction:', txn._id, error);
            }
        }
        
        return {
            processed: unmatchedTransactions.length,
            matched: matchedCount,
            requiresReview: reviewCount,
            unmatched: unmatchedTransactions.length - matchedCount - reviewCount
        };
    }

    // Find matching expenses
    async findExpenseMatches(bankTransaction) {
        const Expense = mongoose.model('Expense');
        
        // Date range (±3 days)
        const dateStart = moment(bankTransaction.date).subtract(3, 'days').toDate();
        const dateEnd = moment(bankTransaction.date).add(3, 'days').toDate();
        
        const potentialExpenses = await Expense.find({
            date: { $gte: dateStart, $lte: dateEnd },
            amount: {
                $gte: Math.abs(bankTransaction.amount) * 0.99,
                $lte: Math.abs(bankTransaction.amount) * 1.01
            }
        });
        
        const matches = [];
        
        for (const expense of potentialExpenses) {
            const confidence = this.calculateMatchConfidence(bankTransaction, expense);
            if (confidence > 0.5) {
                matches.push({
                    expense,
                    confidence,
                    matchFactors: {
                        amountMatch: Math.abs(expense.amount - Math.abs(bankTransaction.amount)) < 1,
                        dateProximity: Math.abs(moment(expense.date).diff(bankTransaction.date, 'days')),
                        descriptionSimilarity: this.calculateStringSimilarity(
                            bankTransaction.description,
                            expense.description
                        )
                    }
                });
            }
        }
        
        return matches.sort((a, b) => b.confidence - a.confidence);
    }

    // Find matching revenue
    async findRevenueMatches(bankTransaction) {
        const Revenue = mongoose.model('Revenue');
        
        const dateStart = moment(bankTransaction.date).subtract(3, 'days').toDate();
        const dateEnd = moment(bankTransaction.date).add(3, 'days').toDate();
        
        const potentialRevenues = await Revenue.find({
            date: { $gte: dateStart, $lte: dateEnd },
            amount: {
                $gte: bankTransaction.amount * 0.99,
                $lte: bankTransaction.amount * 1.01
            }
        });
        
        const matches = [];
        
        for (const revenue of potentialRevenues) {
            const confidence = this.calculateMatchConfidence(bankTransaction, revenue);
            if (confidence > 0.5) {
                matches.push({
                    revenue,
                    confidence,
                    matchFactors: {
                        amountMatch: Math.abs(revenue.amount - bankTransaction.amount) < 1,
                        dateProximity: Math.abs(moment(revenue.date).diff(bankTransaction.date, 'days')),
                        descriptionSimilarity: this.calculateStringSimilarity(
                            bankTransaction.description,
                            revenue.description || revenue.source
                        )
                    }
                });
            }
        }
        
        return matches.sort((a, b) => b.confidence - a.confidence);
    }

    // Calculate match confidence
    calculateMatchConfidence(bankTxn, record) {
        let confidence = 0;
        
        // Amount match (40% weight)
        const amountDiff = Math.abs(
            Math.abs(bankTxn.amount) - record.amount
        ) / record.amount;
        
        if (amountDiff < 0.001) confidence += 0.4;
        else if (amountDiff < 0.01) confidence += 0.3;
        else if (amountDiff < 0.05) confidence += 0.1;
        
        // Date proximity (30% weight)
        const daysDiff = Math.abs(
            moment(bankTxn.date).diff(record.date, 'days')
        );
        
        if (daysDiff === 0) confidence += 0.3;
        else if (daysDiff === 1) confidence += 0.2;
        else if (daysDiff <= 3) confidence += 0.1;
        
        // Description similarity (30% weight)
        const similarity = this.calculateStringSimilarity(
            bankTxn.description.toLowerCase(),
            (record.description || record.source || '').toLowerCase()
        );
        
        confidence += similarity * 0.3;
        
        return confidence;
    }

    // String similarity calculation
    calculateStringSimilarity(str1, str2) {
        const natural = require('natural');
        return natural.JaroWinklerDistance(str1, str2);
    }

    // Manual reconciliation
    async manualReconcile(bankTransactionId, matchType, matchId) {
        const bankTxn = await BankTransaction.findById(bankTransactionId);
        if (!bankTxn) throw new Error('Bank transaction not found');
        
        if (matchType === 'expense') {
            bankTxn.matchedExpenseId = matchId;
            bankTxn.matchedRevenueId = null;
        } else if (matchType === 'revenue') {
            bankTxn.matchedRevenueId = matchId;
            bankTxn.matchedExpenseId = null;
        } else if (matchType === 'ignore') {
            bankTxn.reconciliationStatus = 'ignored';
            return await bankTxn.save();
        }
        
        bankTxn.reconciliationStatus = 'matched';
        return await bankTxn.save();
    }

    // Helper methods
    parseCSVLine(line) {
        // Handle CSV parsing with quotes
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }

    generateTransactionId(date, reference, amount) {
        const data = `${date}${reference}${amount}`;
        return crypto.createHash('md5').update(data).digest('hex');
    }

    generateBatchId() {
        return `IMPORT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    extractMerchantName(description) {
        // Extract merchant name from transaction description
        // Common patterns in Indian bank statements
        const patterns = [
            /^(UPI|NEFT|IMPS|RTGS)[-\/](.+?)[-\/]/i,
            /^POS \d+ (.+?)$/i,
            /^ATW-\d+ (.+?)$/i,
            /^(.*?) -\d{6}\*+\d{4}$/i,
            /^PAYMENT TO (.+?)$/i
        ];
        
        for (const pattern of patterns) {
            const match = description.match(pattern);
            if (match) {
                return match[match.length - 1].trim();
            }
        }
        
        // Return first few words if no pattern matches
        return description.split(/[-\/]/)[0].trim();
    }

    parseDate(dateStr) {
        // Try multiple date formats
        const formats = [
            'DD/MM/YYYY',
            'DD-MM-YYYY',
            'YYYY-MM-DD',
            'DD/MM/YY',
            'DD-MM-YY',
            'MM/DD/YYYY',
            'MM-DD-YYYY'
        ];
        
        for (const format of formats) {
            const parsed = moment(dateStr, format, true);
            if (parsed.isValid()) {
                return parsed.toDate();
            }
        }
        
        // Fallback to JS Date parsing
        return new Date(dateStr);
    }

    async updateBankAccountBalance(bankAccountId) {
        const BankAccount = mongoose.model('BankAccount');
        
        // Get latest transaction
        const latestTxn = await BankTransaction.findOne({
            bankAccountId,
            balance: { $ne: null }
        }).sort({ date: -1 });
        
        if (latestTxn) {
            await BankAccount.findByIdAndUpdate(bankAccountId, {
                currentBalance: latestTxn.balance,
                lastBalanceUpdate: new Date()
            });
        }
    }

    // Get reconciliation summary
    async getReconciliationSummary(bankAccountId, dateRange) {
        const query = { bankAccountId };
        
        if (dateRange) {
            query.date = {
                $gte: dateRange.start,
                $lte: dateRange.end
            };
        }
        
        const summary = await BankTransaction.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$reconciliationStatus',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' }
                }
            }
        ]);
        
        const categoryBreakdown = await BankTransaction.aggregate([
            { $match: { ...query, category: { $ne: null } } },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    totalDebits: {
                        $sum: {
                            $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0]
                        }
                    },
                    totalCredits: {
                        $sum: {
                            $cond: [{ $gt: ['$amount', 0] }, '$amount', 0]
                        }
                    }
                }
            }
        ]);
        
        return {
            reconciliationStatus: summary,
            categoryBreakdown,
            lastImport: await BankTransaction.findOne({ bankAccountId })
                .sort({ createdAt: -1 })
                .select('createdAt importBatchId')
        };
    }
}

module.exports = {
    BankSyncService,
    BankTransaction
};