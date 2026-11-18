// PrepPilot only schedules local reminders and sets the app icon badge on the device. Neither needs
// Apple's Push Notifications capability, but expo-notifications adds the `aps-environment` entitlement,
// and the App Store provisioning profile does not include push, so the build fails. Remove it.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutRemotePush(config) {
  return withEntitlementsPlist(config, cfg => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
