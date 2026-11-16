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
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'preppilot-${suffix}'
    publicNetworkAccess: 'Enabled'
  }
}

resource model 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: aoai
  name: modelName
  sku: { name: 'GlobalStandard', capacity: capacityK }
  properties: {
    model: { format: 'OpenAI', name: modelName, version: modelVersion }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
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
    AZURE_OPENAI_ENDPOINT: aoai.properties.endpoint
    AZURE_OPENAI_API_KEY: aoai.listKeys().key1
    AZURE_OPENAI_DEPLOYMENT: model.name
    AZURE_OPENAI_REASONING: string(reasoningModel)
    ACCESS_CODE: accessCode
  }
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
