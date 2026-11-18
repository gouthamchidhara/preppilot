#!/usr/bin/env bash
# Read-only check of why the site returns Azure's generic 404. Changes nothing.
# Run where `az login` is done:  bash scripts/diagnose-azure.sh
set -u
RG=${RG:-rg-preppilot}
SWA=${SWA:-swa-preppilot-cmncqy5swqngi}
echo "== Subscription";        az account show --query "{name:name, state:state, id:id}" -o table
echo "== Static Web App";      az staticwebapp show -n "$SWA" -g "$RG" --query "{host:defaultHostname, sku:sku.name, branch:branch, provider:provider, state:provisioningState}" -o table
echo "== Environments";        az staticwebapp environment list -n "$SWA" -g "$RG" --query "[].{name:name, status:status, built:lastUpdatedOn, host:hostname, source:sourceBranch}" -o table
echo "== Custom domains";      az staticwebapp hostname list -n "$SWA" -g "$RG" --query "[].{domain:domainName, status:status}" -o table
echo "== All Static Web Apps in the subscription (look for a second copy)"; az staticwebapp list --query "[].{name:name, rg:resourceGroup, host:defaultHostname}" -o table
echo "== Activity log since 17 Nov 18:00 UTC"; az monitor activity-log list -g "$RG" --start-time 2026-11-17T18:00:00Z --query "[].{time:eventTimestamp, what:operationName.localizedValue, who:caller, status:status.value}" -o table
echo "== Live check";          for u in https://preppilot.us/ https://preppilot.us/api/health "https://$(az staticwebapp show -n "$SWA" -g "$RG" --query defaultHostname -o tsv)/"; do printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"; done
