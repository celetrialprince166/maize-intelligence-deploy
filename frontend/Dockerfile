# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Baked into the static bundle at build time by Vite — these are public
# client-side values (API base URL, Cognito pool/client IDs), not secrets.
# Supplied via --build-arg from CI, sourced from Terraform outputs /
# GitHub Environment variables — never hardcoded here.
ARG VITE_API_URL
ARG VITE_COGNITO_REGION
ARG VITE_COGNITO_USER_POOL_ID
ARG VITE_COGNITO_CLIENT_ID
ARG VITE_MAPBOX_TOKEN
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_COGNITO_REGION=${VITE_COGNITO_REGION} \
    VITE_COGNITO_USER_POOL_ID=${VITE_COGNITO_USER_POOL_ID} \
    VITE_COGNITO_CLIENT_ID=${VITE_COGNITO_CLIENT_ID} \
    VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN}

# Node sizes its heap from *physical* RAM, so on a small instance the build
# dies with "JavaScript heap out of memory" while bundling this app's ~3,100
# modules — even when plenty of swap is available, because Node never tries
# to use it. Raising the limit explicitly lets the build spill into swap and
# succeed on a 1 GiB host; on larger hosts it simply never reaches the cap.
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN npm run build

# The master process runs as root (the official nginx:alpine image's own
# design — root is needed to bind ports 80/443 and manage worker
# processes); worker processes that actually handle requests already drop
# to the unprivileged `nginx` user by default. Not overridden here.
FROM nginx:1.27-alpine
RUN apk add --no-cache openssl curl
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/50-generate-self-signed-cert.sh
RUN chmod +x /docker-entrypoint.d/50-generate-self-signed-cert.sh
COPY --from=build /build/dist /usr/share/nginx/html

EXPOSE 80 443
# Checks nginx itself is serving, independent of backend availability —
# the end-to-end backend proxy path is verified separately via /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -kf https://localhost/ || exit 1
