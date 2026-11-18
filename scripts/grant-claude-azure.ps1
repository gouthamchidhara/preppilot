# Gives Claude a login that can manage only the PrepPilot resource group (Contributor on rg-preppilot).
# Run in PowerShell on a computer where `az login` is done:   ./scripts/grant-claude-azure.ps1
# Safe to run again: if the login already exists, it gets a fresh password instead of a duplicate.
param(
  [string]$ResourceGroup = 'rg-preppilot',
  [string]$Name = 'preppilot-claude'
)
$ErrorActionPreference = 'Stop'

$account = az account show -o json 2>$null | ConvertFrom-Json
if (-not $account) { Write-Host 'Not signed in. Running az login...'; az login | Out-Null; $account = az account show -o json | ConvertFrom-Json }
Write-Host "Subscription: $($account.name) ($($account.id)), state: $($account.state)"
if ($account.state -ne 'Enabled') { throw 'The subscription is not Enabled. Fix billing first.' }

$rg = az group show -n $ResourceGroup -o json 2>$null | ConvertFrom-Json
if (-not $rg) { throw "Resource group $ResourceGroup not found in this subscription. Run 'az account set -s <subscription>' and try again." }
$scope = $rg.id

$existing = az ad sp list --display-name $Name --query "[0].appId" -o tsv
if ($existing) {
  Write-Host "Login '$Name' exists ($existing). Making sure it has Contributor on $ResourceGroup and issuing a new password."
  az role assignment create --assignee $existing --role Contributor --scope $scope -o none 2>$null
  $cred = az ad sp credential reset --id $existing --years 1 -o json | ConvertFrom-Json
} else {
  Write-Host "Creating login '$Name' with Contributor on $ResourceGroup only..."
  $cred = az ad sp create-for-rbac --name $Name --role Contributor --scopes $scope --years 1 -o json | ConvertFrom-Json
}

Write-Host ''
Write-Host '================ Done ================'
Write-Host "1) Paste this in the chat (not secret):  tenant = $($cred.tenant)"
Write-Host '2) In the secure form Claude opens (NOT in the chat):'
Write-Host "     Username: $($cred.appId)"
Write-Host "     Password: $($cred.password)"
Write-Host 'The password is valid for 1 year. Remove access any time: Entra ID > App registrations > preppilot-claude > Delete.'
