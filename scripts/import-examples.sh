#!/usr/bin/env bash
# Imports examples/ into the private local n8n. Stable ids make re-running update them in place.
set -euo pipefail

cd "$(dirname "$0")/.."
source scripts/local-env.sh

staging="$(mktemp -d)"
for file in examples/*.json; do
	id="$(basename "$file" .json | shasum | cut -c1-16)"
	node -e 'const [src, id, out] = process.argv.slice(1);
		const workflow = { ...JSON.parse(require("fs").readFileSync(src, "utf8")), id, active: false };
		require("fs").writeFileSync(out, JSON.stringify(workflow));' "$file" "$id" "$staging/$(basename "$file")"
done

npx --yes "n8n@${N8N_VERSION}" import:workflow --separate --input="$staging"
