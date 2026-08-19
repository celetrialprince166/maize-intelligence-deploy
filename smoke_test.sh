#!/usr/bin/env bash
# Run after `docker compose up -d`. Fails loudly (non-zero exit) if the
# stack isn't actually serving traffic end-to-end — used locally and as a
# CI job gate before any deploy is considered successful.
set -euo pipefail

HOST="${SMOKE_TEST_HOST:-localhost}"
MAX_WAIT=60
elapsed=0

echo "Waiting for https://${HOST}/health to return 200..."
until curl -ksf "https://${HOST}/health" > /dev/null; do
    elapsed=$((elapsed + 2))
    if [ "$elapsed" -ge "$MAX_WAIT" ]; then
        echo "FAIL: https://${HOST}/health did not become healthy within ${MAX_WAIT}s"
        exit 1
    fi
    sleep 2
done
echo "PASS: /health (nginx -> backend) is healthy"

status=$(curl -ks -o /dev/null -w "%{http_code}" "https://${HOST}/")
if [ "$status" != "200" ]; then
    echo "FAIL: frontend root returned HTTP ${status}, expected 200"
    exit 1
fi
echo "PASS: frontend root serves 200"

echo "All smoke tests passed."
