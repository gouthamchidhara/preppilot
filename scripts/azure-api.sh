#!/usr/bin/env bash
# Call the Azure management API as the preppilot-claude login (Contributor on rg-preppilot).
# The login's username/password are stored as a network secret for login.microsoftonline.com in the
# Claude environment; the proxy adds them, so nothing secret lives in this file.
#   scripts/azure-api.sh GET  /resourceGroups/rg-preppilot/resources?api-version=2021-04-01
#   scripts/azure-api.sh POST /resourceGroups/rg-preppilot/providers/Microsoft.Web/staticSites/swa-preppilot-cmncqy5swqngi/listFunctionAppSettings?api-version=2023-12-01 '{}'
# Paths are relative to the subscription. Token is cached for 50 minutes.
set -euo pipefail
TENANT=dcc24b58-eee5-4239-889b-6c8a379c2e33
SUB=c3514a59-2641-4ae2-91b1-30364f9631c6
CACHE=${TMPDIR:-/tmp}/preppilot-azure-token.json
if [ ! -s "$CACHE" ] || [ $(( $(date +%s) - $(stat -c %Y "$CACHE") )) -gt 3000 ]; then
  curl -s -X POST "https://login.microsoftonline.com/$TENANT/oauth2/v2.0/token" -H 'content-type: application/x-www-form-urlencoded' \
    --data 'grant_type=client_credentials&scope=https%3A%2F%2Fmanagement.azure.com%2F.default' -o "$CACHE"
  chmod 600 "$CACHE"
fi
TOK=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['access_token'])" "$CACHE")
M=$1; P=$2; B=${3:-}
args=(-s -X "$M" "https://management.azure.com/subscriptions/$SUB$P" -H "authorization: Bearer $TOK")
[ -n "$B" ] && args+=(-H 'content-type: application/json' -d "$B")
curl "${args[@]}"
