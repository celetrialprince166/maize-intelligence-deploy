# Maize Intelligence System

A geospatial web application for maize crop classification and yield estimation in Ghana, powered by Google Earth Engine and machine learning.

## Overview

The system uses Sentinel-2 satellite imagery processed through Google Earth Engine to:
- **Classify** farm polygons as maize or non-maize (87.7% accuracy)
- **Estimate yield** in tonnes per hectare using Random Forest regression
- **Monitor crop health** through multi-temporal vegetation indices
- **Visualize results** on an interactive map with exportable reports

## Project Structure

```
maize-intelligence-deploy/
├── backend/                 # FastAPI Python backend
│   ├── app/                 # Application code
│   │   ├── main.py          # API endpoints
│   │   ├── satellite_gee.py # Google Earth Engine processing
│   │   ├── models.py        # ML model loading and inference
│   │   ├── ancillary.py     # Environmental data fetchers
│   │   ├── farms.py         # Farm CRUD (DynamoDB)
│   │   ├── config.py        # Configuration
│   │   └── ...
│   ├── models/              # Model metadata (actual .joblib files go to S3)
│   ├── requirements.txt     # Python dependencies
│   ├── Dockerfile           # Container build file
│   └── .env.example         # Environment variable template
├── frontend/                # React TypeScript frontend
│   ├── src/                 # Source code
│   ├── public/              # Static assets
│   ├── package.json         # Node dependencies
│   ├── vite.config.ts       # Vite build configuration
│   ├── index.html           # Entry HTML
│   ├── .env.example         # Dev environment template
│   └── .env.production.example  # Production environment template
├── DEPLOYMENT_GUIDE.md      # Step-by-step deployment instructions
├── TECHNICAL_REPORT.md      # Full technical documentation
└── README.md                # This file
```

## Prerequisites

- **Python 3.11+** (backend)
- **Node.js 18+** (frontend)
- **AWS Account** with: EC2, DynamoDB, S3, Cognito configured
- **Google Earth Engine** service account with access to ghana-project-73326

## Quick Start (Local Development)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env with your values (GEE key path, AWS credentials, etc.)

# Place your GEE service account JSON key in the backend directory

# Run the server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your Cognito and API URL values

# Run dev server
npm run dev -- --port 5174
```

The frontend will be available at http://localhost:5174

## Environment Variables

### Backend (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| AWS_REGION | AWS region | us-east-1 |
| S3_BUCKET | S3 bucket for ML models | maize-intelligence-models-104702104957 |
| GEE_SERVICE_ACCOUNT_KEY | Path to GEE JSON key file | ./gee-service-account-key.json |
| MODEL_VERSION_PATH | S3 prefix for model files | models/v1 |

### Frontend (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| VITE_API_URL | Backend API URL | http://127.0.0.1:8000 |
| VITE_COGNITO_REGION | Cognito region | us-east-1 |
| VITE_COGNITO_USER_POOL_ID | Cognito User Pool ID | us-east-1_GnqgOdGme |
| VITE_COGNITO_CLIENT_ID | Cognito App Client ID | (from AWS Console) |

## Required Files (Not in Repo)

The following files contain secrets and must be provided separately:

1. **GEE Service Account Key** (`gee-service-account-key.json`) — Place in `backend/` directory
2. **ML Model Files** — Upload to S3 bucket:
   - `models/v1/maize_classifier.joblib`
   - `models/v1/yield_regressor.joblib`
   - `models/v1/model_metadata.json`

## Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for full production deployment instructions.

### Quick Deploy (EC2 + Docker)

```bash
# On EC2 instance
git clone https://github.com/bigdataghana/maize-intelligence-deploy.git
cd maize-intelligence-deploy/backend

# Configure environment
cp .env.example .env
# Edit .env with production values
# Place GEE key file

# Build and run
docker build -t maize-api .
docker run -d -p 8000:8000 --env-file .env maize-api
```

For the frontend, build and serve with nginx:
```bash
cd frontend
npm install
cp .env.production.example .env.production
# Edit .env.production with production API URL
npm run build
# Serve dist/ folder with nginx
```

## API Documentation

Once the backend is running, visit http://localhost:8000/docs for the interactive Swagger API documentation.

## Technology Stack

- **Backend:** FastAPI, Python, Google Earth Engine, scikit-learn
- **Frontend:** React, TypeScript, Mapbox GL, Recharts, Tailwind CSS
- **Infrastructure:** AWS (EC2, DynamoDB, S3, Cognito), GEE
- **ML:** Random Forest (classification + regression), Sentinel-2 imagery

## License

Proprietary — Ghana Space Science and Technology Institute / Big Data Ghana
