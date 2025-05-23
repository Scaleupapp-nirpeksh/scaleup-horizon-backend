ScaleUp Horizon v2.0 - Enhanced Financial Intelligence Platform 🚀
🌟 New Features Overview
1. ML-Powered Transaction Categorization
Automatically categorizes expenses and revenue using Natural Language Processing
Learns from corrections to improve accuracy over time
Supports Indian vendors and payment methods
95%+ accuracy after initial training
2. Bank Statement Import & Reconciliation
Import statements from HDFC, ICICI, SBI, Axis banks
Automatic transaction matching with expenses/revenue
Smart reconciliation with fuzzy matching
Duplicate detection and prevention
3. Custom KPI Builder
Create any KPI with drag-and-drop formula builder
Built-in KPIs: Burn Rate, Runway, LTV:CAC, Growth Rate
Real-time calculations with historical tracking
Visual dashboards with alerts
4. Recurring Transactions
Automatic creation of recurring expenses/revenue
Flexible scheduling (daily, weekly, monthly, custom)
Variable amount support with ranges
Notification system for upcoming transactions
5. Automated Report Generation
Pre-built templates for investor updates, board reports
Scheduled generation (weekly, monthly, quarterly)
Multiple output formats (PDF, HTML, DOCX)
Email distribution with tracking
6. Advanced ML Analytics
Expense prediction for next 30-90 days
Anomaly detection for unusual transactions
Cash flow optimization recommendations
Spending pattern analysis
🚀 Quick Start
Installation
bash
# Clone the repository
git clone https://github.com/scaleup/horizon-backend.git
cd horizon-backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Initialize database
npm run migrate

# Start the server
npm run dev
Environment Variables
env
# Database
HORIZON_MONGODB_URI=mongodb://localhost:27017/scaleup-horizon

# Authentication
HORIZON_JWT_SECRET=your-super-secret-jwt-key

# AWS (for file storage)
HORIZON_AWS_ACCESS_KEY_ID=your-aws-access-key
HORIZON_AWS_SECRET_ACCESS_KEY=your-aws-secret-key
HORIZON_AWS_REGION=ap-south-1
HORIZON_S3_BUCKET_NAME=scaleup-horizon-documents

# Email (for notifications)
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=notifications@scaleup.com

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Port
HORIZON_PORT=5001
📚 API Documentation
Transaction Categorization
Auto-categorize Transaction
http
POST /api/horizon/enhanced/transactions/categorize
Authorization: Bearer <token>
Content-Type: application/json

{
  "description": "Payment to AWS for cloud services",
  "amount": 45000,
  "vendor": "Amazon Web Services"
}

Response:
{
  "category": "Tech Infrastructure",
  "confidence": 0.95,
  "allScores": [
    { "category": "Tech Infrastructure", "score": 0.95 },
    { "category": "Software & Subscriptions", "score": 0.03 }
  ],
  "requiresReview": false
}
Train Model with Correction
http
POST /api/horizon/enhanced/transactions/:id/correct-category
Authorization: Bearer <token>
Content-Type: application/json

{
  "correctCategory": "Software & Subscriptions"
}
Bank Sync
Import Bank Statement
http
POST /api/horizon/enhanced/bank/import
Authorization: Bearer <token>
Content-Type: multipart/form-data

Fields:
- statement: CSV file
- bankAccountId: "64a1b2c3d4e5f6789"
- bankFormat: "hdfc" | "icici" | "sbi" | "axis" | "generic"

Response:
{
  "success": true,
  "importBatchId": "IMPORT_1234567890_abc123",
  "imported": 156,
  "errors": 2,
  "summary": {
    "totalDebits": 2450000,
    "totalCredits": 180000,
    "dateRange": {
      "from": "2025-04-01",
      "to": "2025-04-30"
    }
  }
}
Custom KPIs
Create Custom KPI
http
POST /api/horizon/enhanced/kpis/custom
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "customer_acquisition_efficiency",
  "displayName": "Customer Acquisition Efficiency",
  "category": "Sales",
  "formula": "(new_customers / marketing_spend) * 1000",
  "formulaVariables": [
    {
      "variable": "new_customers",
      "source": "custom_metric",
      "aggregation": "count",
      "timeframe": "current_month"
    },
    {
      "variable": "marketing_spend",
      "source": "expense",
      "filter": {
        "field": "category",
        "operator": "equals",
        "value": "Marketing & Sales"
      },
      "aggregation": "sum",
      "timeframe": "current_month"
    }
  ],
  "displayFormat": {
    "type": "number",
    "decimals": 2,
    "suffix": " customers/lakh"
  },
  "targets": [
    {
      "period": "2025-05",
      "value": 50,
      "type": "min"
    }
  ]
}
Get KPI Dashboard
http
GET /api/horizon/enhanced/kpis/dashboard
Authorization: Bearer <token>

Response:
{
  "categories": {
    "Financial": [
      {
        "id": "64a1b2c3d4e5f6789",
        "name": "Monthly Burn Rate",
        "value": 2450000,
        "formattedValue": "₹24.5L",
        "trend": -8.5,
        "target": 2000000,
        "visualization": {
          "chartType": "gauge",
          "color": "#F53F6E"
        }
      }
    ]
  },
  "summary": {
    "total": 12,
    "improving": 7,
    "declining": 3,
    "onTarget": 8,
    "offTarget": 4
  }
}
Recurring Transactions
Create Recurring Transaction
http
POST /api/horizon/enhanced/recurring-transactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "AWS Monthly Bill",
  "type": "expense",
  "amount": 45000,
  "isVariableAmount": true,
  "amountVariation": {
    "type": "percentage",
    "value": 10
  },
  "category": "Tech Infrastructure",
  "vendor": "Amazon Web Services",
  "frequency": "monthly",
  "dayOfMonth": 1,
  "startDate": "2025-06-01",
  "autoCreate": true,
  "notifications": {
    "enabled": true,
    "daysBefore": 3
  }
}
Get Upcoming Transactions
http
GET /api/horizon/enhanced/recurring-transactions/upcoming?days=30
Authorization: Bearer <token>

Response:
{
  "upcoming": [
    {
      "date": "2025-05-25",
      "transactions": [
        {
          "recurringId": "64a1b2c3d4e5f6789",
          "name": "Office Rent",
          "type": "expense",
          "amount": 150000,
          "category": "Rent & Utilities",
          "requiresApproval": false
        }
      ],
      "totalExpenses": 150000,
      "totalRevenue": 0
    }
  ],
  "summary": {
    "totalUpcoming": 28,
    "totalExpenses": 3450000,
    "totalRevenue": 500000,
    "requiresApproval": 2
  }
}
Report Generation
Generate Report
http
POST /api/horizon/enhanced/reports/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "templateId": "64a1b2c3d4e5f6789",
  "periodStart": "2025-05-01",
  "periodEnd": "2025-05-31"
}

Response:
{
  "_id": "64b2c3d4e5f67890",
  "title": "May 2025 Investor Update",
  "reportType": "investor_update",
  "content": {
    "sections": [...],
    "summary": "Strong revenue growth of 25% with improving unit economics.",
    "highlights": [
      "Achieved ₹25L in revenue",
      "Reduced CAC by 30%",
      "12 KPIs meeting targets"
    ]
  },
  "files": [
    {
      "format": "pdf",
      "url": "https://s3.ap-south-1.amazonaws.com/scaleup-horizon/reports/...",
      "size": 245678
    }
  ]
}
ML Analytics
Predict Expenses
http
GET /api/horizon/enhanced/ml/predict-expenses?days=30
Authorization: Bearer <token>

Response:
[
  {
    "date": "2025-05-24",
    "predictedAmount": 85000,
    "confidence": 0.92
  },
  {
    "date": "2025-05-25",
    "predictedAmount": 42000,
    "confidence": 0.89
  }
]
Optimize Cash Flow
http
POST /api/horizon/enhanced/ml/optimize-cashflow
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentState": {
    "currentCash": 5000000,
    "monthlyBurn": 2500000,
    "upcomingExpenses": {...},
    "expectedRevenue": {...}
  },
  "constraints": {
    "minCashBalance": 1000000,
    "maxPaymentDelay": 30
  }
}

Response:
{
  "recommendations": [
    {
      "type": "payment_timing",
      "category": "Marketing & Sales",
      "action": "delay",
      "days": 15,
      "impact": "high",
      "description": "Delay Marketing & Sales payments by 15 days to optimize cash flow"
    },
    {
      "type": "expense_reduction",
      "category": "Software & Subscriptions",
      "percentage": "12.5",
      "impact": "medium",
      "description": "Reduce Software & Subscriptions expenses by 12.5% to improve runway"
    }
  ],
  "projectedImpact": {
    "runwayExtension": 1.8,
    "cashFlowImprovement": 450000,
    "riskReduction": 23.5
  }
}
🎯 Best Practices
1. Initial Setup
Import at least 3 months of bank statements for better categorization
Set up all recurring transactions to avoid manual entry
Configure KPIs relevant to your business model
Create report templates for regular updates
2. Daily Usage
Review and correct any miscategorized transactions
Check anomaly alerts for unusual spending
Monitor KPI dashboard for trends
Approve pending recurring transactions
3. Weekly Tasks
Import latest bank statements
Review cash flow predictions
Check upcoming recurring transactions
Generate weekly reports if configured
4. Monthly Tasks
Reconcile all bank accounts
Review and update KPI targets
Generate investor updates
Analyze spending patterns
🔧 Troubleshooting
Common Issues
Categorization Accuracy Low
Solution: Correct more transactions to train the model
Use bulk categorization for historical data
Bank Import Fails
Check CSV format matches the selected bank
Ensure date format is correct
Remove any header/footer rows
KPI Not Calculating
Verify all formula variables have data
Check timeframe settings
Ensure dependent KPIs are calculated first
Reports Not Generating
Check template configuration
Verify data exists for the period
Check S3 permissions for file storage
🚦 Performance Tips
Database Indexes
javascript
// Add these indexes for better performance
db.expenses.createIndex({ date: -1, category: 1 })
db.banktransactions.createIndex({ bankAccountId: 1, date: -1 })
db.customkpis.createIndex({ createdBy: 1, isActive: 1 })
Caching
KPI values are cached for 1 hour
Report templates are cached in memory
ML model predictions are cached for 24 hours
Batch Operations
Use bulk APIs for importing transactions
Schedule heavy operations during off-peak hours
Limit report generation to 5 concurrent jobs
🛡️ Security
API Rate Limiting
100 requests per minute per user
1000 requests per hour per user
Bulk operations count as 10 requests
Data Encryption
All bank data encrypted at rest
SSL/TLS for all API communications
Sensitive fields encrypted in database
Access Control
JWT tokens expire after 5 hours
Role-based permissions (coming soon)
Audit logs for all modifications
📈 Roadmap
Coming Soon (v2.1)
 Multi-user support with roles
 Mobile app
 Direct bank API integration
 Advanced forecasting models
 Industry benchmarking
Future (v3.0)
 AI-powered insights
 Automated fundraising assistance
 Integration with accounting software
 Blockchain-based audit trail
 International currency support
🤝 Contributing
We welcome contributions! Please see CONTRIBUTING.md for guidelines.

📄 License
This project is licensed under the ISC License - see LICENSE.md for details.

🆘 Support
Email: support@scaleup.com
Documentation: https://docs.scaleup.com/horizon
Community: https://community.scaleup.com
Built with ❤️ by the ScaleUp Team for startup founders worldwide!

