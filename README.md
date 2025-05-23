# ScaleUp Horizon - AI-Powered Financial Intelligence Platform

## 🚀 Overview

ScaleUp Horizon is a comprehensive financial management and predictive analytics platform designed specifically for startup CEOs and CFOs. It combines real-time financial tracking with AI-powered predictions to help startups optimize their runway, plan fundraising, and make data-driven decisions.

## 🎯 Key Features

### 1. **Financial Management**
- Multi-bank account tracking
- Revenue and expense categorization
- Automated financial snapshots
- Real-time cash position monitoring

### 2. **Predictive Analytics**
- AI-powered runway predictions with Monte Carlo simulations
- Fundraising timing and probability analysis
- Cash flow projections with seasonality
- Revenue cohort analysis and LTV calculations

### 3. **Strategic Planning**
- Budget creation and variance tracking
- Scenario modeling (what-if analysis)
- ESOP pool management
- Document management system

### 4. **Investor Relations**
- Automated investor update generation
- Funding round tracking
- Cap table management
- Shareable dashboards

## 🏗️ Architecture

### Backend Stack
- **Runtime**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT-based auth with bcrypt
- **File Storage**: Local storage with encryption
- **AI/ML**: Custom prediction algorithms using statistical models

### Core Models
1. **HorizonUser**: User authentication and profiles
2. **BankAccount**: Bank account tracking
3. **Revenue**: Revenue transactions
4. **Expense**: Expense transactions
5. **FundraisingRound**: Investment rounds
6. **KPISnapshot**: Daily/weekly/monthly metrics
7. **RevenueCohort**: Cohort analysis
8. **Document**: File management

## 📊 API Structure

### Authentication Endpoints
```
POST /auth/register          - Create new user account
POST /auth/login            - Login and receive JWT
GET  /auth/profile          - Get user profile
```

### Financial Management
```
# Bank Accounts
GET    /accounts            - List all bank accounts
POST   /accounts            - Add new bank account
PUT    /accounts/:id        - Update account
DELETE /accounts/:id        - Delete account

# Revenue
GET    /revenues            - List revenues (with filters)
POST   /revenues            - Add revenue entry
PUT    /revenues/:id        - Update revenue
DELETE /revenues/:id        - Delete revenue

# Expenses  
GET    /expenses            - List expenses (with filters)
POST   /expenses            - Add expense entry
PUT    /expenses/:id        - Update expense
DELETE /expenses/:id        - Delete expense
```

### KPIs and Analytics
```
# Snapshots
POST /kpis/snapshots        - Create manual snapshot
GET  /kpis/snapshots        - Get snapshots (with date range)
GET  /kpis/metrics/:metric  - Get specific metric history

# Analytics
GET  /analytics/overview    - Financial overview
GET  /analytics/burn-rate   - Burn rate analysis
GET  /analytics/runway      - Runway calculation
GET  /analytics/growth      - Growth metrics
```

### Predictive Analytics
```
# Runway Scenarios
POST /analytics/runway-scenarios        - Create scenario
GET  /analytics/runway-scenarios        - List scenarios
POST /analytics/runway-scenarios/monte-carlo - Run simulation

# Fundraising Predictions
GET  /analytics/fundraising-probability - Get raise probability
POST /analytics/fundraising-scenarios   - Model scenarios

# Cash Flow Projections
GET  /analytics/cash-flow-projection    - Get projections
POST /analytics/cash-flow-projection    - Create custom projection

# Revenue Cohorts
POST /analytics/revenue-cohorts         - Create cohort
GET  /analytics/revenue-cohorts         - List cohorts
GET  /analytics/revenue-cohorts/:id/projections - Get projections
```

## 📥 Input/Output Examples

### Creating a Revenue Entry
**Input:**
```json
POST /revenues
{
  "customerName": "Acme Corp",
  "amount": 50000,
  "currency": "USD",
  "date": "2024-03-15",
  "category": "subscription",
  "recurring": true,
  "recurringFrequency": "monthly",
  "description": "Enterprise plan - March 2024"
}
```

**Output:**
```json
{
  "_id": "65f4a2b8c1234567890abcde",
  "customerName": "Acme Corp",
  "amount": 50000,
  "currency": "USD",
  "date": "2024-03-15T00:00:00.000Z",
  "category": "subscription",
  "recurring": true,
  "recurringFrequency": "monthly",
  "description": "Enterprise plan - March 2024",
  "createdBy": "65f4a2b8c1234567890abcdf",
  "createdAt": "2024-03-15T10:30:00.000Z"
}
```

### Running Runway Scenario
**Input:**
```json
POST /analytics/runway-scenarios
{
  "name": "Aggressive Growth",
  "assumptions": {
    "revenueGrowthRate": 0.20,
    "expenseGrowthRate": 0.15,
    "hiringPlan": [
      {"month": 1, "hires": 2, "avgSalary": 120000},
      {"month": 3, "hires": 3, "avgSalary": 100000}
    ]
  }
}
```

**Output:**
```json
{
  "scenario": {
    "_id": "65f4a2b8c1234567890abce0",
    "name": "Aggressive Growth",
    "baselineRunway": 18,
    "projectedRunway": 14,
    "criticalDate": "2025-07-15",
    "monthlyProjections": [
      {
        "month": 1,
        "revenue": 150000,
        "expenses": 180000,
        "netBurn": -30000,
        "cashRemaining": 2470000
      }
      // ... more months
    ]
  }
}
```

### Revenue Cohort Analysis
**Input:**
```json
POST /analytics/revenue-cohorts
{
  "cohortName": "Q1 2024 Users",
  "cohortStartDate": "2024-01-01",
  "initialUsers": 100,
  "acquisitionCost": 50000,
  "metrics": [
    {
      "periodNumber": 0,
      "activeUsers": 100,
      "revenue": 10000,
      "retentionRate": 1.0
    },
    {
      "periodNumber": 1,
      "activeUsers": 85,
      "revenue": 8500,
      "retentionRate": 0.85
    }
  ]
}
```

**Output:**
```json
{
  "_id": "65f4a2b8c1234567890abce1",
  "cohortName": "Q1 2024 Users",
  "initialUsers": 100,
  "averageCAC": 500,
  "actualLTV": 18500,
  "projectedLTV": 45000,
  "ltcacRatio": 3.2,
  "paybackPeriod": 6,
  "metrics": [...],
  "projections": [
    {
      "month": 3,
      "projectedUsers": 72,
      "projectedRevenue": 7200,
      "confidence": 0.85
    }
    // ... more projections
  ]
}
```

## 🔐 Security Features

1. **JWT Authentication**: Secure token-based auth
2. **Password Hashing**: bcrypt with salt rounds
3. **Input Validation**: Comprehensive request validation
4. **File Encryption**: AES-256 for document storage
5. **Access Control**: User-specific data isolation

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/your-org/scaleup-horizon-backend.git

# Install dependencies
cd scaleup-horizon-backend
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start the server
npm start
```

### Environment Variables
```env
PORT=5001
MONGODB_URI=mongodb://localhost:27017/scaleup-horizon
JWT_SECRET=your-secret-key
NODE_ENV=development
```

## 📱 Frontend Integration Guide

### Authentication Flow
1. Register/login to receive JWT token
2. Include token in all API requests:
   ```
   Authorization: Bearer <jwt-token>
   ```

### Data Flow Patterns
1. **Real-time Updates**: Poll KPI endpoints every 5 minutes
2. **Financial Entries**: Submit immediately on user input
3. **Predictions**: Cache results for 1 hour
4. **Documents**: Stream large files in chunks

### Recommended UI Components
1. **Dashboard**: Real-time metrics cards
2. **Charts**: Time series for financial trends
3. **Tables**: Sortable/filterable transaction lists
4. **Forms**: Multi-step for complex entries
5. **Visualizations**: Sankey diagrams for cash flow

### State Management Suggestions
```javascript
// Example Redux/Context structure
{
  auth: { user, token, isAuthenticated },
  financial: { 
    accounts: [], 
    revenues: [], 
    expenses: [],
    totalCash: 0
  },
  kpis: {
    currentSnapshot: {},
    historicalData: [],
    runway: 0
  },
  predictions: {
    scenarios: [],
    projections: {},
    lastUpdated: null
  }
}
```

## 🧪 Testing

### Test Coverage
- Unit tests for prediction algorithms
- Integration tests for API endpoints
- End-to-end tests for critical workflows

### Running Tests
```bash
npm test                 # Run all tests
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests
```

## 📈 Performance Considerations

1. **Caching**: Implement Redis for frequently accessed data
2. **Pagination**: All list endpoints support pagination
3. **Indexing**: MongoDB indexes on date and user fields
4. **Batch Operations**: Support bulk imports for historical data

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📝 License

This project is proprietary software. All rights reserved.

## 👥 Support

For support, email support@scaleup-horizon.com or join our Slack channel.

---

## Appendix: Complete API Documentation

[See API Structure section above for detailed endpoints]

## Appendix: Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400  | Bad Request | Invalid input data |
| 401  | Unauthorized | Missing or invalid token |
| 403  | Forbidden | Access denied to resource |
| 404  | Not Found | Resource doesn't exist |
| 500  | Server Error | Internal server error |

## Appendix: Webhook Events (Future)

- `runway.critical` - Runway below 6 months
- `budget.exceeded` - Department over budget
- `fundraising.optimal` - Ideal time to raise
- `cohort.anomaly` - Unusual cohort behavior