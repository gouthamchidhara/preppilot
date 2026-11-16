// PrepPilot: Static Web App (PWA + managed Functions API) + Azure OpenAI + monthly budget alert.
targetScope = 'resourceGroup'

@description('Static Web Apps region (Free tier is available in: westus2, centralus, eastus2, westeurope, eastasia).')
param location string = 'eastus2'

@description('Azure OpenAI region.')
param aiLocation string = 'eastus2'

@description('Model name, e.g. gpt-4.1-mini. deploy.ps1 picks one that is available in aiLocation.')
param modelName string

@description('Model version, e.g. 2025-04-14.')
param modelVersion string

@description('Set true for reasoning models (gpt-5*, o-series).')
param reasoningModel bool = false

@description('Tokens-per-minute capacity in thousands. Low on purpose: it is the hard cost/abuse ceiling.')
param capacityK int = 20

@description('Realtime (speech-to-speech) model, e.g. gpt-realtime-mini. Empty = no voice mode.')
param realtimeModelName string = ''
param realtimeModelVersion string = ''
param realtimeCapacity int = 10

@description('Transcription model used to show what the user said, e.g. gpt-4o-mini-transcribe.')
param transcribeModelName string = ''
param transcribeModelVersion string = ''
param transcribeCapacity int = 50

@description('Model used offline by scripts/gen-pack.mjs to draft study content (not used by the app).')
param draftModelName string = 'gpt-4.1'
param draftModelVersion string = '2025-04-14'
param draftCapacity int = 200

@secure()
@description('Optional beta access code required by the API. Empty = open.')
param accessCode string = ''

@description('Email for budget alerts. Empty = no budget created.')
param budgetEmail string = ''

param budgetAmount int = 20

param budgetStartDate string = utcNow('yyyy-MM-01')

@secure()
@description('HMAC key for session tokens (>= 32 chars). Keep stable or every user is signed out.')
param sessionSecret string

@description('Comma-separated admin emails (unlimited AI).')
param adminEmails string = ''

@description('Comma-separated Google OAuth client IDs whose ID tokens are accepted (web + iOS + Android).')
param googleClientIds string = ''

@description('Google OAuth client ID used by the web sign-in button.')
param googleWebClientId string = ''

@description('Comma-separated Apple Sign In audiences (iOS bundle ID, web Services ID).')
param appleAudiences string = 'com.gchid.preppilot'

@secure()
param revenueCatSecretKey string = ''

@secure()
@description('Exact Authorization header value RevenueCat sends with webhooks.')
param revenueCatWebhookAuth string = ''

var suffix = uniqueString(resourceGroup().id)

// Users, daily free pool and voice calls live in Table Storage (cents per month).
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stpp${take(suffix, 18)}'
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource tables 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = [for t in [ 'ppusers', 'ppdaily', 'ppcalls', 'pproles' ]: {
  parent: tableService
  name: t
}]

var storageConn = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

resource aoai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'aoai-preppilot-${suffix}'
  location: aiLocation
  // Foundry (AIServices) kind: newer subscriptions can't create the legacy 'OpenAI' kind.
  kind: 'AIServices'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'preppilot-${suffix}'
    publicNetworkAccess: 'Enabled'
  }
}

// AIServices exposes Azure OpenAI (incl. /openai/v1/realtime) on the *.openai.azure.com host.
var openAiEndpoint = 'https://preppilot-${suffix}.openai.azure.com/'

resource model 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: aoai
  name: modelName
  sku: { name: 'GlobalStandard', capacity: capacityK }
  properties: {
    model: { format: 'OpenAI', name: modelName, version: modelVersion }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
}

// Deployments on one account must be created one at a time, hence the dependsOn chain.
resource realtime 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = if (!empty(realtimeModelName)) {
  parent: aoai
  name: empty(realtimeModelName) ? 'none-rt' : realtimeModelName
  sku: { name: 'GlobalStandard', capacity: realtimeCapacity }
  properties: {
    model: { format: 'OpenAI', name: realtimeModelName, version: realtimeModelVersion }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
  dependsOn: [ model ]
}

resource transcribe 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = if (!empty(transcribeModelName)) {
  parent: aoai
  name: empty(transcribeModelName) ? 'none-tr' : transcribeModelName
  sku: { name: 'GlobalStandard', capacity: transcribeCapacity }
  properties: {
    model: { format: 'OpenAI', name: transcribeModelName, version: transcribeModelVersion }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
  dependsOn: [ model, realtime ]
}

resource draft 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = if (!empty(draftModelName)) {
  parent: aoai
  name: empty(draftModelName) ? 'none-draft' : draftModelName
  sku: { name: 'GlobalStandard', capacity: draftCapacity }
  properties: {
    model: { format: 'OpenAI', name: draftModelName, version: draftModelVersion }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
  dependsOn: [ model, realtime, transcribe ]
}

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'swa-preppilot-${suffix}'
  location: location
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

resource swaSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: swa
  name: 'appsettings'
  properties: {
    AZURE_OPENAI_ENDPOINT: openAiEndpoint
    AZURE_OPENAI_API_KEY: aoai.listKeys().key1
    AZURE_OPENAI_DEPLOYMENT: model.name
    AZURE_OPENAI_REASONING: string(reasoningModel)
    AZURE_OPENAI_REALTIME_DEPLOYMENT: realtimeModelName
    AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT: transcribeModelName
    ACCESS_CODE: accessCode
    STORAGE_CONNECTION_STRING: storageConn
    SESSION_SECRET: sessionSecret
    ADMIN_EMAILS: adminEmails
    GOOGLE_CLIENT_IDS: googleClientIds
    GOOGLE_WEB_CLIENT_ID: googleWebClientId
    APPLE_AUDIENCES: appleAudiences
    REVENUECAT_SECRET_KEY: revenueCatSecretKey
    REVENUECAT_WEBHOOK_AUTH: revenueCatWebhookAuth
  }
  dependsOn: [ realtime, transcribe, tables ]
}

// Sweeper: a timer Function App (Flex Consumption; its free monthly grant covers a 1-minute timer)
// that hangs up voice calls whose paid time has run out. SWA's managed API only supports HTTP triggers.
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource deployContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'sweeper-deploy'
}

resource sweeperPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-pp-sweeper-${suffix}'
  location: location
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  kind: 'functionapp'
  properties: { reserved: true }
}

resource sweeper 'Microsoft.Web/sites@2023-12-01' = {
  name: 'func-pp-sweeper-${suffix}'
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: sweeperPlan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}sweeper-deploy'
          authentication: { type: 'StorageAccountConnectionString', storageAccountConnectionStringName: 'DEPLOYMENT_STORAGE_CONNECTION_STRING' }
        }
      }
      scaleAndConcurrency: { maximumInstanceCount: 40, instanceMemoryMB: 512 }
      runtime: { name: 'node', version: '20' }
    }
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        { name: 'AzureWebJobsStorage', value: storageConn }
        { name: 'DEPLOYMENT_STORAGE_CONNECTION_STRING', value: storageConn }
        { name: 'STORAGE_CONNECTION_STRING', value: storageConn }
        { name: 'AZURE_OPENAI_ENDPOINT', value: openAiEndpoint }
        { name: 'AZURE_OPENAI_API_KEY', value: aoai.listKeys().key1 }
        { name: 'AZURE_OPENAI_REALTIME_DEPLOYMENT', value: realtimeModelName }
      ]
    }
  }
  dependsOn: [ deployContainer ]
}

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = if (!empty(budgetEmail)) {
  name: 'budget-preppilot'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStartDate }
    notifications: {
      actual80: { enabled: true, operator: 'GreaterThan', threshold: 80, thresholdType: 'Actual', contactEmails: [ budgetEmail ] }
      forecast100: { enabled: true, operator: 'GreaterThan', threshold: 100, thresholdType: 'Forecasted', contactEmails: [ budgetEmail ] }
    }
  }
}

output swaName string = swa.name
output swaHostname string = swa.properties.defaultHostname
output aoaiName string = aoai.name
output sweeperName string = sweeper.name
