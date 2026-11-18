#!/usr/bin/env bash
# Gives Claude a login that can manage only the PrepPilot resource group (Contributor on rg-preppilot).
# Run on macOS/Linux (or Git Bash) where `az login` is done:   bash scripts/grant-claude-azure.sh
# Safe to run again: if the login already exists, it gets a fresh password instead of a duplicate.
set -euo pipefail
RG=${RG:-rg-preppilot}
NAME=${NAME:-preppilot-claude}

az account show -o none 2>/dev/null || az login -o none
read -r SUB_ID SUB_NAME SUB_STATE < <(az account show --query "[id, name, state]" -o tsv | tr '\n' ' ')
echo "Subscription: $SUB_NAME ($SUB_ID), state: $SUB_STATE"
[ "$SUB_STATE" = "Enabled" ] || { echo "The subscription is not Enabled. Fix billing first."; exit 1; }
SCOPE=$(az group show -n "$RG" --query id -o tsv) || { echo "Resource group $RG not found. Run 'az account set -s <subscription>' and retry."; exit 1; }

APP=$(az ad sp list --display-name "$NAME" --query "[0].appId" -o tsv)
if [ -n "$APP" ]; then
  echo "Login '$NAME' exists ($APP). Making sure it has Contributor on $RG and issuing a new password."
  az role assignment create --assignee "$APP" --role Contributor --scope "$SCOPE" -o none 2>/dev/null || true
  OUT=$(az ad sp credential reset --id "$APP" --years 1 --query "[appId, password, tenant]" -o tsv)
else
  echo "Creating login '$NAME' with Contributor on $RG only..."
  OUT=$(az ad sp create-for-rbac --name "$NAME" --role Contributor --scopes "$SCOPE" --years 1 --query "[appId, password, tenant]" -o tsv)
fi
APP_ID=$(sed -n 1p <<<"$OUT"); PASS=$(sed -n 2p <<<"$OUT"); TENANT=$(sed -n 3p <<<"$OUT")

echo
echo "================ Done ================"
echo "1) Paste this in the chat (not secret):  tenant = $TENANT"
echo "2) In the secure form Claude opens (NOT in the chat):"
echo "     Username: $APP_ID"
echo "     Password: $PASS"
echo "The password is valid for 1 year. Remove access any time: Entra ID > App registrations > $NAME > Delete."
