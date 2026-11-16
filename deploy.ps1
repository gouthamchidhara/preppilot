<#
.SYNOPSIS
  Deploys PrepPilot to YOUR PERSONAL Azure subscription: Static Web App (Free) + Azure OpenAI + budget alert.
.EXAMPLE
  ./deploy.ps1 -BudgetEmail you@example.com
  ./deploy.ps1 -BudgetEmail you@example.com -AccessCode "beta-2026"     # lock AI to people you give the code to
#>
param(
  [string]$ResourceGroup = 'rg-preppilot',
  [string]$Location = 'eastus2',
  [string]$AiLocation = 'eastus2',
  [string]$BudgetEmail = '',
  [int]$BudgetAmount = 20,
  [string]$AccessCode = '',
  [string[]]$PreferredModels = @('gpt-4.1-mini', 'gpt-4o-mini', 'gpt-5-mini'),
  [string[]]$RealtimeModels = @('gpt-realtime-mini', 'gpt-realtime-2.1-mini', 'gpt-realtime'),
  [string[]]$TranscribeModels = @('gpt-4o-mini-transcribe', 'gpt-4o-transcribe'),
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# 1. Make sure this is a personal subscription, not an employer one.
$acct = az account show -o json | ConvertFrom-Json
Write-Host "Subscription: $($acct.name) ($($acct.id))`nSigned in as:  $($acct.user.name)"
$blocked = @($env:PREPPILOT_BLOCKED_DOMAINS -split ',') + @(if (Test-Path private/blocked-domains.txt) { Get-Content private/blocked-domains.txt }) | Where-Object { $_ }
foreach ($d in $blocked) { if ($acct.user.name -like "*@$($d.Trim())") { throw 'Signed in with an employer account. Run: az login (personal account), then az account set -s <personal-sub>.' } }
if (-not $Yes) { if ((Read-Host 'Deploy PrepPilot here? (y/N)') -ne 'y') { exit 1 } }

# 2. Pick models that are actually available in the region (versions retire over time).
$models = az cognitiveservices model list -l $AiLocation -o json | ConvertFrom-Json
function Select-Model([string[]]$names) {
  foreach ($name in $names) {
    $cands = $models | Where-Object { $_.model.format -eq 'OpenAI' -and $_.model.name -eq $name -and
      ($_.model.skus | Where-Object { $_.name -eq 'GlobalStandard' -and (-not $_.deprecationDate -or [datetime]$_.deprecationDate -gt (Get-Date).AddDays(30)) }) }
    if ($cands) { return ($cands | Sort-Object { $_.model.version } -Descending | Select-Object -First 1).model }
  }
  return $null
}
$pick = Select-Model $PreferredModels
if (-not $pick) {
  Write-Host 'None of the preferred models are available. Candidates in this region:'
  $models | Where-Object { $_.model.name -match 'mini' } | ForEach-Object { "  $($_.model.name) $($_.model.version)" } | Sort-Object -Unique
  throw 'Re-run with -PreferredModels <name>.'
}
$modelName = $pick.name; $modelVersion = $pick.version
$reasoning = [bool]($modelName -match '^(gpt-5|o\d)')
Write-Host "Chat model:     $modelName $modelVersion (reasoning=$reasoning)"
$rt = Select-Model $RealtimeModels
$tr = Select-Model $TranscribeModels
if ($rt) { Write-Host "Realtime voice: $($rt.name) $($rt.version)" } else { Write-Warning 'No realtime model available: voice mode will be off.' }
if ($tr) { Write-Host "Transcription:  $($tr.name) $($tr.version)" }

# 3. Infrastructure.
az group create -n $ResourceGroup -l $Location -o none

# Non-secret settings (committed) + secrets (git-ignored, generated once so sessions survive redeploys).
$settings = Get-Content deploy.settings.json -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force private | Out-Null
$secretsFile = 'private/secrets.json'
$secrets = if (Test-Path $secretsFile) { Get-Content $secretsFile -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
$rand = { -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }) }
foreach ($k in 'sessionSecret', 'revenueCatWebhookAuth', 'revenueCatSecretKey', 'adminEmails') { if (-not ($secrets.PSObject.Properties.Name -contains $k)) { $secrets | Add-Member $k '' } }
if (-not $secrets.sessionSecret) { $secrets.sessionSecret = & $rand }
if (-not $secrets.revenueCatWebhookAuth) { $secrets.revenueCatWebhookAuth = "Bearer $(& $rand)" }
$secrets | ConvertTo-Json | Set-Content $secretsFile

$p = @{
  location = $Location; aiLocation = $AiLocation; modelName = $modelName; modelVersion = $modelVersion
  reasoningModel = $reasoning; accessCode = $AccessCode; budgetEmail = $BudgetEmail; budgetAmount = $BudgetAmount
  realtimeModelName = $(if ($rt) { $rt.name } else { '' }); realtimeModelVersion = $(if ($rt) { $rt.version } else { '' })
  transcribeModelName = $(if ($rt -and $tr) { $tr.name } else { '' }); transcribeModelVersion = $(if ($rt -and $tr) { $tr.version } else { '' })
  sessionSecret = $secrets.sessionSecret; revenueCatWebhookAuth = $secrets.revenueCatWebhookAuth; revenueCatSecretKey = $secrets.revenueCatSecretKey
  adminEmails = (@($settings.adminEmails, $secrets.adminEmails) | Where-Object { $_ }) -join ','; googleClientIds = $settings.googleClientIds; googleWebClientId = $settings.googleWebClientId; appleAudiences = $settings.appleAudiences
}
$paramFile = Join-Path ([IO.Path]::GetTempPath()) "preppilot-params-$PID.json"
@{ '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'; contentVersion = '1.0.0.0'
   parameters = @{} + ($p.GetEnumerator() | ForEach-Object -Begin { $h = @{} } -Process { $h[$_.Key] = @{ value = $_.Value } } -End { $h }) } |
  ConvertTo-Json -Depth 5 | Set-Content $paramFile
try {
  $out = az deployment group create -g $ResourceGroup -n "preppilot-$(Get-Date -Format yyyyMMddHHmmss)" -f infra/main.bicep -p "@$paramFile" `
    --query properties.outputs -o json | ConvertFrom-Json
} finally { Remove-Item $paramFile -ErrorAction SilentlyContinue }
if (-not $out) { throw 'Infrastructure deployment failed (see error above).' }
$swa = $out.swaName.value; $hostName = $out.swaHostname.value
Write-Host "Static Web App: $swa  https://$hostName"

# 4. Point the native (iOS/Android) shell at the deployed API.
$cfg = 'web/js/config.js'
(Get-Content $cfg -Raw) -replace "export const REMOTE_API_BASE = '.*?';", "export const REMOTE_API_BASE = 'https://$hostName';" | Set-Content $cfg -NoNewline

# 5. Ship web + API.
Push-Location api; npm install --omit=dev --no-audit --no-fund; Pop-Location
$token = az staticwebapp secrets list -n $swa -g $ResourceGroup --query properties.apiKey -o tsv
npx --yes @azure/static-web-apps-cli@2 deploy ./web --api-location ./api --api-language node --api-version 20 --deployment-token $token --env production
if ($LASTEXITCODE -ne 0) { throw 'SWA deploy failed.' }

# 6. Sweeper Function App (hangs up voice calls past their paid time).
$build = Join-Path ([IO.Path]::GetTempPath()) "pp-sweeper-$PID"
Remove-Item $build -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item sweeper $build -Recurse
Copy-Item api/src/lib "$build/src/lib" -Recurse
Push-Location $build; npm install --omit=dev --no-audit --no-fund | Out-Null; Pop-Location
$zip = "$build.zip"; Remove-Item $zip -ErrorAction SilentlyContinue
# tar writes forward-slash paths; Compress-Archive (PS 5.1) writes backslashes that Linux treats as file names.
$items = Get-ChildItem $build -Name
tar.exe -a -cf $zip -C $build @items
az functionapp deployment source config-zip -g $ResourceGroup -n $out.sweeperName.value --src $zip --timeout 900 -o none
if ($LASTEXITCODE -ne 0) { Write-Warning 'Sweeper deploy failed; voice limits are then only enforced by the app and opportunistic sweeps.' }
Remove-Item $build, $zip -Recurse -Force -ErrorAction SilentlyContinue

# 7. Verify.
Start-Sleep 15
try { $h = Invoke-RestMethod "https://$hostName/api/health"; Write-Host "Health: $($h | ConvertTo-Json -Compress)" }
catch { Write-Warning "Health check failed (cold start?). Retry: curl https://$hostName/api/health" }
Write-Host "`nDone: https://$hostName"
