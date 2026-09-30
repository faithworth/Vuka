import React, { useRef } from 'react';
import { BackHandler, Linking, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const VUKA_URL = 'https://www.vukamusic.com';
const VUKA_HOSTS = new Set(['vukamusic.com', 'www.vukamusic.com']);

export default function App() {
  const webViewRef = useRef(null);

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

  React.useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <WebView
        ref={webViewRef}
        source={{ uri: VUKA_URL }}
        originWhitelist={['https://*']}
        onShouldStartLoadWithRequest={handleNavigation}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        startInLoadingState
        style={styles.webview}
      />
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
  }
});
