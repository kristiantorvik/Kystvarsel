import React, { useCallback, useEffect, useState } from 'react';
import { Alert as RNAlert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';

import { PrimaryButton } from '../components/PrimaryButton';
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  type PermissionState,
} from '../notifications/localNotifications';
import { runAlertCheck } from '../notifications/backgroundCheck';
import { settingsRepository, SETTINGS_KEYS } from '../data/settingsRepository';
import { strings } from '../i18n';
import { osloLabel } from '../utils/time';

export function SettingsScreen() {
  const s = strings();
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    setPermission(await getNotificationPermissionState());
    setLastCheck(await settingsRepository.get(SETTINGS_KEYS.lastCheckAt));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onRequestPerm = async () => {
    const state = await requestNotificationPermission();
    setPermission(state);
    if (state === 'denied') {
      RNAlert.alert(s.errors.notificationDenied, '', [
        { text: s.common.cancel, style: 'cancel' },
        { text: s.common.confirm, onPress: () => Linking.openSettings() },
      ]);
    }
  };

  const onCheckNow = async () => {
    setRunning(true);
    try {
      const r = await runAlertCheck();
      RNAlert.alert(s.alerts.checkSummary(r.matched, r.checked));
      await refresh();
    } catch (e) {
      RNAlert.alert(s.errors.fetchFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const permLabel =
    permission === 'granted' ? s.settings.notificationPermissionGranted :
    permission === 'denied' ? s.settings.notificationPermissionDenied :
    s.settings.notificationPermissionUndetermined;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>{s.settings.about}</Text>
      <Text style={styles.body}>{s.settings.aboutBody}</Text>

      <Text style={styles.h2}>{s.alerts.checkNow}</Text>
      <Text style={styles.body}>{s.settings.backgroundNote}</Text>
      {Platform.OS === 'android' && <Text style={styles.body}>{s.settings.batteryNote}</Text>}
      <Text style={styles.meta}>
        {s.settings.lastCheckLabel} {lastCheck ? osloLabel(lastCheck) : s.settings.lastCheckNever}
      </Text>
      <PrimaryButton title={s.settings.runCheckNow} onPress={onCheckNow} loading={running} style={{ marginTop: 12 }} />

      <Text style={styles.h2}>{s.settings.notificationPermission}</Text>
      <Text style={styles.body}>{permLabel}</Text>
      {permission !== 'granted' && (
        <PrimaryButton
          title={s.settings.requestNotificationPermission}
          onPress={onRequestPerm}
          variant="secondary"
          style={{ marginTop: 8 }}
        />
      )}

      <Text style={styles.h2}>{s.settings.sources}</Text>
      <Text style={styles.body}>{s.settings.metAttribution}</Text>
      <Text style={styles.body}>{s.settings.kartverketAttribution}</Text>

      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimer}>{s.settings.reliabilityDisclaimer}</Text>
      </View>

      <Text style={styles.metaSmall}>
        {s.settings.version}: {Constants.expoConfig?.version ?? '?'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', flexGrow: 1 },
  h1: { fontSize: 20, fontWeight: '700', color: '#0E3A5F', marginBottom: 8 },
  h2: { fontSize: 16, fontWeight: '600', color: '#0E3A5F', marginTop: 24, marginBottom: 8 },
  body: { fontSize: 14, color: '#333', marginBottom: 8, lineHeight: 20 },
  meta: { fontSize: 12, color: '#666', marginTop: 8 },
  metaSmall: { fontSize: 11, color: '#888', marginTop: 32, textAlign: 'center' },
  disclaimerBox: {
    marginTop: 16, padding: 12, borderRadius: 8, backgroundColor: '#FFF7E6', borderColor: '#E5B65A', borderWidth: 1,
  },
  disclaimer: { fontSize: 13, color: '#7A5520', lineHeight: 18 },
});
