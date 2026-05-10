import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';

import { initDatabase } from './src/data/db';
import { registerBackgroundCheck } from './src/notifications/backgroundCheck';
import { configureNotifications } from './src/notifications/localNotifications';
import { RootNavigator } from './src/navigation/RootNavigator';
import { t } from './src/i18n';

// Tell the OS to keep the native splash up until we explicitly hide it.
// Called at module top level (not inside the component) so it runs before
// the first render — otherwise we'd race against React drawing a blank
// screen between the bundle eval and the first frame. Wrapped in try/catch
// because a hot-reload during development can call it twice; the second
// call rejects.
try {
  SplashScreen.preventAutoHideAsync();
} catch {
  // ignore
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        await configureNotifications();
        await registerBackgroundCheck();
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        // Always release the splash, even on init failure — otherwise the
        // user sees the splash forever and our error UI never paints.
        try {
          await SplashScreen.hideAsync();
        } catch {
          // ignore
        }
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>{t('errors.startupFailed')}</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  errorBody: { fontSize: 14, color: '#444', textAlign: 'center' },
});
