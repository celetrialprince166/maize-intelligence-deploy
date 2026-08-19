# Maize Intelligence — EC2 Deployment Guide

## Quick Fix: GEE Key

The analyze endpoint returns: `GEE service account key not found`

**Fix:** Set the environment variable to point to wherever you placed the key file:

```bash
export GEE_SERVICE_ACCOUNT_KEY=/path/to/your/gee-key.json
```

Then restart the backend. To make it permanent, add it to your `.env` file or systemd service.

## Full Backend Setup (EC2)

### 1. Clone and install

```bash
git clone https://github.com/bigdataghana/maize-yield.git
cd maize-yield/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install "python-jose[cryptography]"
```

### 2. Place the GEE service account key

Copy `ghana-project-73326-a4029e2e713f (1).json` to the server. Example:

```bash
# Place it anywhere, e.g.:
cp ghana-project-73326-a4029e2e713f\ \(1\).json /home/ubuntu/gee-key.json
```

### 3. Set environment variables

Create a `.env` file in the `backend/` directory:

```
AWS_REGION=us-east-1
S3_BUCKET=maize-intelligence-models-104702104957
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_GnqgOdGme
COGNITO_CLIENT_ID=3fqt7gncdijpoen8c7dmb0e8b6
GEE_SERVICE_ACCOUNT_KEY=/home/ubuntu/gee-key.json
```

### 4. Ensure AWS credentials

The EC2 instance needs DynamoDB access. Either:
- Attach an IAM role with `AmazonDynamoDBFullAccess` to the EC2 instance, OR
- Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` env vars

Test with: `aws dynamodb list-tables --region us-east-1`

### 5. Run the backend

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

For production, use a process manager:

```bash
# Using nohup
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 &

# Or using systemd (recommended)
# Create /etc/systemd/system/maize-api.service
```

### 6. Test

```bash
# Health check
curl http://localhost:8000/health

# GEE test (should return classification results)
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[-0.85,9.40],[-0.845,9.40],[-0.845,9.405],[-0.85,9.405],[-0.85,9.40]]]},"name":"Test","season_year":2023}'
```

## Frontend Setup

The frontend is a Vite React app. For production:

```bash
cd "Finalize Maize Intelligence UI_UX"
npm install
npm run build
```

The build output is in `dist/`. Serve it with nginx or any static file server.

The `.env.production` file sets:
```
VITE_API_URL=https://maizeyieldhub.bigdataghana.com/api
```

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| GEE key not found | Env var not set | Set `GEE_SERVICE_ACCOUNT_KEY` path |
| Farms don't save | No DynamoDB access | Attach IAM role to EC2 |
| Signup fails | Cognito env vars wrong | Check `COGNITO_*` in backend .env |
| Analysis times out | API Gateway 29s limit | Use EC2 directly (no API Gateway) |
