#!/bin/sh
# ponytail: self-signed cert, generated fresh per container start since no
# CA-signed cert is available until DNS is mapped and ACM/Let's Encrypt can
# issue one against a real domain. Upgrade path: mount an ACM/Let's Encrypt
# cert at these same paths once the domain exists, and drop this script.
set -eu

CERT_DIR="/etc/nginx/ssl"
CERT_CN="${NGINX_TLS_COMMON_NAME:-localhost}"

mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
        -keyout "$CERT_DIR/privkey.pem" \
        -out "$CERT_DIR/fullchain.pem" \
        -subj "/CN=${CERT_CN}" \
        -addext "subjectAltName=IP:${CERT_CN}" 2>/dev/null || \
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
        -keyout "$CERT_DIR/privkey.pem" \
        -out "$CERT_DIR/fullchain.pem" \
        -subj "/CN=${CERT_CN}"
    echo "Generated self-signed TLS cert for CN=${CERT_CN}"
fi
