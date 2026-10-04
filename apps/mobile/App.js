import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const VUKA_URL = 'https://www.vukamusic.com';
const VUKA_HOSTS = new Set(['vukamusic.com', 'www.vukamusic.com']);

export default function App() {
  const webViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleNavigation = request => {
    try {
      const url = new URL(request.url);
      if (url.protocol === 'https:' && VUKA_HOSTS.has(url.hostname)) {
        return true;
      }
      Linking.openURL(request.url).catch(() => {});
      return false;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Only swallow the back press when the page can actually go back;
      // otherwise let Android close the app as users expect.
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [canGoBack]);

  const retry = useCallback(() => {
    setFailed(false);
    webViewRef.current?.reload();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <WebView
        ref={webViewRef}
        source={{ uri: VUKA_URL }}
        originWhitelist={['https://*']}
        onShouldStartLoadWithRequest={handleNavigation}
        onNavigationStateChange={state => setCanGoBack(!!state.canGoBack)}
        onError={() => setFailed(true)}
        onLoadStart={() => setFailed(false)}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        startInLoadingState
        style={styles.webview}
      />
      {failed && (
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>Can't reach Vuka Music</Text>
          <Text style={styles.errorBody}>Check your internet connection and try again.</Text>
          <Pressable style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808'
  },
  webview: {
    flex: 1,
    backgroundColor: '#080808'
  },
  errorScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8
  },
  errorBody: {
    color: '#9CA3AF',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24
  },
  retryButton: {
    backgroundColor: '#A0E87C',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12
  },
  retryText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 16
  }
});
