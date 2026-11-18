// Dynamic Expo config. Public IDs live in app.settings.json (OAuth client IDs and RevenueCat
// *public* SDK keys are designed to ship inside apps; no secrets here).
const s = require('./app.settings.json');

// Google Sign-In on iOS needs the reversed iOS client ID as a URL scheme.
const iosUrlScheme = s.googleIosClientId
  ? `com.googleusercontent.apps.${s.googleIosClientId.replace('.apps.googleusercontent.com', '')}`
  : null;

module.exports = {
  expo: {
    name: 'PrepPilot',
    slug: 'preppilot',
    owner: 'gchid',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    backgroundColor: '#eceeed',
    splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#1c2426' },
    ios: {
      bundleIdentifier: s.bundleId,
      buildNumber: '1',
      supportsTablet: true,
      usesAppleSignIn: true,
      infoPlist: {
        NSMicrophoneUsageDescription: 'PrepPilot streams microphone audio to Azure OpenAI for voice practice and Live AI sessions. Audio may include other people nearby; get their permission before sharing it.',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: s.bundleId,
      versionCode: 1,
      permissions: ['android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'],
      adaptiveIcon: {
        backgroundColor: '#1c2426',
        foregroundImage: './assets/android-icon-foreground.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
    },
    plugins: [
      'expo-apple-authentication',
      // Listed before expo-notifications on purpose: Expo runs these mods in reverse order, so this
      // one runs after expo-notifications has added aps-environment, and removes it.
      './plugins/no-remote-push',
      'expo-notifications',
      ...(iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }]] : []),
    ],
    extra: {
      webUrl: s.webUrl,
      googleWebClientId: s.googleWebClientId,
      googleIosClientId: s.googleIosClientId,
      revenueCatIosKey: s.revenueCatIosKey,
      revenueCatAndroidKey: s.revenueCatAndroidKey,
      eas: { projectId: '2d0fc27c-f525-4610-895b-72c66b08815b' },
    },
  },
};
