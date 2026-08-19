#!/bin/bash
# Host bootstrap only — installs Docker and prepares /opt/app. The actual
# application deploy (compose file, secrets fetch, `docker compose up`) is
# pushed later via `aws ssm send-command` from CI, not baked in here, so a
# new release never requires relaunching the instance.
set -euo pipefail

dnf install -y docker
systemctl enable --now docker

mkdir -p /usr/local/lib/docker/cli-plugins
curl -sSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

mkdir -p /opt/app

# Production compose file: image-only (no build context — the host never
# builds, it only pulls what CI already built and pushed to ECR). CD writes
# a fresh gee-key.json here before every `docker compose up`, so it's
# bind-mounted read-only rather than baked into either image.
cat > /opt/app/docker-compose.yml <<'COMPOSE_EOF'
services:
  backend:
    image: ${BACKEND_IMAGE}
    environment:
      AWS_REGION: us-east-1
      S3_BUCKET: maize-intelligence-models-104702104957
      DYNAMODB_FARMS_TABLE: maize-intelligence-farms
      DYNAMODB_USERS_TABLE: maize-intelligence-users
      COGNITO_REGION: us-east-1
      COGNITO_USER_POOL_ID: us-east-1_vfe6JbU6G
      COGNITO_CLIENT_ID: 744ah7v7iddsshrm9mm02bnd9i
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS}
      GEE_SERVICE_ACCOUNT_KEY: /run/secrets/gee-key.json
    volumes:
      - /opt/app/gee-key.json:/run/secrets/gee-key.json:ro
    networks: [app]
    restart: unless-stopped
    expose: ["8000"]

  frontend:
    image: ${FRONTEND_IMAGE}
    environment:
      NGINX_TLS_COMMON_NAME: ${PUBLIC_IP}
    depends_on: [backend]
    networks: [app]
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"

networks:
  app: {}
COMPOSE_EOF
