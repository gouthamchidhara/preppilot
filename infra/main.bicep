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

@secure()
@description('Optional beta access code required by the API. Empty = open.')
param accessCode string = ''

@description('Email for budget alerts. Empty = no budget created.')
param budgetEmail string = ''

param budgetAmount int = 20

param budgetStartDate string = utcNow('yyyy-MM-01')

var suffix = uniqueString(resourceGroup().id)

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
  }
  dependsOn: [ realtime, transcribe ]
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
