import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import Purchases, { type PurchasesError } from 'react-native-purchases';

type Extra = { webUrl: string; googleWebClientId: string; googleIosClientId: string; revenueCatIosKey: string; revenueCatAndroidKey: string };
const extra = Constants.expoConfig?.extra as Extra;
const rcKey = Platform.OS === 'ios' ? extra.revenueCatIosKey : extra.revenueCatAndroidKey;
// react-native-webview 14's class typings resolve props to `never` under React 19.3 types; runtime is fine.
const WV = WebView as unknown as React.ComponentType<React.ComponentProps<any> & { ref?: React.Ref<WebView> }>;

if (extra.googleWebClientId) {
  // webClientId => Google issues the ID token for the web client, which the API already trusts.
  GoogleSignin.configure({ webClientId: extra.googleWebClientId, iosClientId: extra.googleIosClientId || undefined });
}
if (rcKey) Purchases.configure({ apiKey: rcKey });

type FromWeb = { type: 'signin'; provider: 'google' | 'apple' } | { type: 'purchase' | 'restore'; userKey: string } | { type: 'signout' };

export default function App() {
  const web = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);

  // Native -> web: the page listens for `pp-native` events (web/js/auth.js).
  const toWeb = useCallback((detail: object) => {
    web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('pp-native',{detail:${JSON.stringify(detail)}}));true;`);
  }, []);
  const fail = (message: string) => toWeb({ type: 'error', message });

  async function signIn(provider: 'google' | 'apple') {
    try {
      if (provider === 'apple') {
        if (!(await AppleAuthentication.isAvailableAsync())) return fail('Sign in with Apple is not available on this device.');
        const c = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        });
        const name = [c.fullName?.givenName, c.fullName?.familyName].filter(Boolean).join(' ');
        if (c.identityToken) toWeb({ type: 'auth', provider: 'apple', idToken: c.identityToken, name });
        return;
      }
      if (!extra.googleWebClientId) return fail('Google sign-in is not set up yet.');
      await GoogleSignin.hasPlayServices();
      const res = await GoogleSignin.signIn();
      if (isSuccessResponse(res) && res.data.idToken) toWeb({ type: 'auth', provider: 'google', idToken: res.data.idToken });
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return; // Apple: user cancelled
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return;
      fail(e?.message || 'Sign-in failed.');
    }
  }

  async function purchase(userKey: string, restore = false) {
    if (!rcKey) return fail('In-app purchases are not set up yet.');
    try {
      await Purchases.logIn(userKey); // RevenueCat app_user_id === PrepPilot user key
      if (restore) {
        await Purchases.restorePurchases();
      } else {
        const offerings = await Purchases.getOfferings();
        const pkg = offerings.current?.availablePackages[0];
        if (!pkg) return fail('Pro is not available right now. Try again later.');
        await Purchases.purchasePackage(pkg);
      }
      toWeb({ type: 'purchased' });
    } catch (e) {
      const err = e as PurchasesError & { userCancelled?: boolean };
      if (err.userCancelled) return;
      fail(err.message || 'Purchase failed.');
    }
  }

  async function onMessage(e: WebViewMessageEvent) {
    let m: FromWeb;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'signin') return signIn(m.provider);
    if (m.type === 'purchase') return purchase(m.userKey);
    if (m.type === 'restore') return purchase(m.userKey, true);
    if (m.type === 'signout') {
      GoogleSignin.signOut().catch(() => {});
      if (rcKey) Purchases.logOut().catch(() => {});
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.text}>Can't reach PrepPilot. Check your connection.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => { setFailed(false); web.current?.reload(); }}>
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WV
          ref={web}
          source={{ uri: extra.webUrl }}
          onMessage={onMessage}
          injectedJavaScriptBeforeContentLoaded={`window.PP_PLATFORM=${JSON.stringify(Platform.OS)};true;`}
          originWhitelist={['https://*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          startInLoadingState
          renderLoading={() => <View style={styles.center}><ActivityIndicator color="#6f9dff" /></View>}
          onError={() => setFailed(true)}
          setSupportMultipleWindows={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d131b' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d131b', padding: 24, gap: 16 },
  text: { color: '#e5ecf4', fontSize: 16, textAlign: 'center' },
  btn: { backgroundColor: '#1d5bd1', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '600' },
});
