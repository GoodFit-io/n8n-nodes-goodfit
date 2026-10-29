#!/usr/bin/env bash
# Runs a persistent private n8n with this package installed like a community package (n8n Cloud can't load unverified nodes).
set -euo pipefail

cd "$(dirname "$0")/.."
source scripts/local-env.sh

install_package_into_n8n
echo "n8n ${N8N_VERSION} on http://localhost:${N8N_PORT} (data in ${N8N_USER_FOLDER})"
exec npx --yes "n8n@${N8N_VERSION}" start
