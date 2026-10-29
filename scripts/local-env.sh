#!/usr/bin/env bash
# Shared settings for the private local n8n scripts.

export N8N_VERSION="${N8N_VERSION:-2.40.6}"
export N8N_USER_FOLDER="${N8N_USER_FOLDER:-$HOME/.n8n-goodfit}"
export N8N_PORT="${N8N_PORT:-5678}"
export GENERIC_TIMEZONE="${GENERIC_TIMEZONE:-Europe/London}"
export N8N_DIAGNOSTICS_ENABLED=false

NODES_DIR="$N8N_USER_FOLDER/.n8n/nodes"

install_package_into_n8n() {
	npm run build
	local pack_dir tarball
	pack_dir="$(mktemp -d)"
	tarball="$(npm pack --silent --pack-destination "$pack_dir")"
	mkdir -p "$NODES_DIR"
	[ -f "$NODES_DIR/package.json" ] || echo '{ "name": "installed-nodes", "private": true }' > "$NODES_DIR/package.json"
	npm install --prefix "$NODES_DIR" --legacy-peer-deps --no-audit --no-fund "$pack_dir/$tarball"
}
