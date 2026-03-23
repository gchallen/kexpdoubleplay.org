#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../worker"

DB_NAME="kexpdoubleplays"
DUMP_FILE=$(mktemp /tmp/kexpdoubleplays-sync-XXXXXX.sql)

trap 'rm -f "$DUMP_FILE"' EXIT

# Warm up OAuth token (first wrangler call after expiry can fail; this forces a refresh)
wrangler whoami > /dev/null 2>&1 || true

printf '\033[1;36m==> Exporting remote D1 database...\033[0m\n'
wrangler d1 export "$DB_NAME" --remote --output "$DUMP_FILE"

# Clear local D1 state so we import into a fresh database
printf '\033[1;36m==> Clearing local D1 state...\033[0m\n'
rm -rf .wrangler/state/v3/d1

# Import the dump into the local D1 database
printf '\033[1;36m==> Importing into local D1...\033[0m\n'
wrangler d1 execute "$DB_NAME" --local --file "$DUMP_FILE"

printf '\033[1;32m==> Done! Local D1 synced from remote.\033[0m\n'
