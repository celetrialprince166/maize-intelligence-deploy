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
