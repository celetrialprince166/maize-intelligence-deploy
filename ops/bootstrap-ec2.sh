#!/bin/bash
# Bootstrap an Amazon Linux 2023 EC2 instance to run this app.
#
# This is the script that actually deployed the staging environment in the
# BigDataGhana assessment account (711726112778). It is idempotent — safe to
# re-run on the same instance.
#
# Usage (from a workstation with the instance's SSH key):
#   scp -i key.pem ops/bootstrap-ec2.sh ec2-user@<PUBLIC_IP>:/tmp/
#   ssh -i key.pem ec2-user@<PUBLIC_IP> \
#     "sudo MAPBOX_TOKEN=pk.xxx nohup /tmp/bootstrap-ec2.sh &"
#
# MAPBOX_TOKEN is optional (blank basemap without it); see below.
#
# It can also be pasted into the EC2 "User data" field at launch — but note
# the console's User data box did NOT reliably receive content during this
# deployment (it arrived as 0 bytes), so running it over SSH is the verified
# path. See DEPLOYMENT.md, "Issues encountered".
#
# The GEE service-account key is NOT provisioned here: this account's
# instance role lacks secretsmanager:GetSecretValue, so the script falls back
# to an empty placeholder and the key is copied in separately over SSH (see
# DEPLOYMENT.md). Everything else is fully automated.
#
# Stage markers land in /var/log/maize-stage so a failure point is obvious
# without re-reading the whole build log.
exec > >(tee -a /var/log/maize-bootstrap.log) 2>&1
set -x
stage(){ echo "$1" > /var/log/maize-stage; echo "=== STAGE: $1 ==="; }

stage swap
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi

stage install-docker
dnf install -y docker git
systemctl enable --now docker
mkdir -p /usr/local/lib/docker/cli-plugins
if [ ! -x /usr/local/lib/docker/cli-plugins/docker-compose ]; then
  curl -sSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi
docker compose version

stage clone
rm -rf /opt/src
git clone --depth 1 https://github.com/celetrialprince166/maize-intelligence-deploy.git /opt/src

stage metadata
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
PUBLIC_IP=$(curl -sH "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
echo "PUBLIC_IP=$PUBLIC_IP"

stage secret
# GEE key via the instance role; placeholder if the secret isn't in this
# account so the app still boots (only /analyze needs a real key).
aws secretsmanager get-secret-value \
  --secret-id maize-staging/gee-service-account-key \
  --region us-east-1 --query SecretString --output text > /opt/gee-key.json 2>/dev/null \
  || echo '{}' > /opt/gee-key.json
chmod 644 /opt/gee-key.json
echo "gee-key bytes: $(wc -c < /opt/gee-key.json)"

stage write-env
# Mapbox public token, passed in from the caller rather than committed:
#   sudo MAPBOX_TOKEN=pk.xxx /tmp/bootstrap-ec2.sh
# pk.* tokens are public by design (they ship in the browser bundle), but
# keeping the literal out of git avoids tripping secret scanning and lets
# each environment use its own domain-restricted token. Left empty, the map
# renders with a blank basemap and everything else works.
MAPBOX_TOKEN="${MAPBOX_TOKEN:-}"

cat > /opt/src/.env <<ENVEOF
AWS_REGION=us-east-1
S3_BUCKET=maize-intelligence-models
DYNAMODB_FARMS_TABLE=maize-intelligence-farms
DYNAMODB_USERS_TABLE=maize-intelligence-users
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_vfe6JbU6G
COGNITO_CLIENT_ID=744ah7v7iddsshrm9mm02bnd9i
ALLOWED_ORIGINS=https://${PUBLIC_IP}
GEE_KEY_HOST_PATH=/opt/gee-key.json
VITE_API_URL=/api
PUBLIC_IP=${PUBLIC_IP}
MAPBOX_TOKEN=${MAPBOX_TOKEN}
ENVEOF

stage build
cd /opt/src
docker compose build || { stage build-FAILED; exit 1; }

stage up
docker compose up -d || { stage up-FAILED; exit 1; }

stage done
docker compose ps
