import React, { useCallback, useEffect, useState } from 'react';
import { Alert as RNAlert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
// `expo-file-system` v19+ (Expo SDK 55) split into a new top-level API and
// a legacy API. We use the legacy one — it still exposes
// `cacheDirectory`, `EncodingType`, `StorageAccessFramework`, and the simple
// `readAsStringAsync` / `writeAsStringAsync` helpers that this screen needs.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { PrimaryButton } from '../components/PrimaryButton';
import { NumberField } from '../components/NumberField';
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  type PermissionState,
} from '../notifications/localNotifications';
import { runAlertCheck } from '../notifications/backgroundCheck';
import {
  settingsRepository,
  SETTINGS_KEYS,
  getDailyCheckHour,
  setDailyCheckHour,
  DEFAULT_DAILY_CHECK_HOUR,
} from '../data/settingsRepository';
import {
  applyImport,
  buildExport,
  defaultExportFilename,
  parseImport,
  type ImportMode,
} from '../data/exportImport';
import { strings } from '../i18n';
import { osloLabel } from '../utils/time';

export function SettingsScreen() {
  const s = strings();
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  // Daily-check hour, edited as a single integer field. `undefined` while
  // the field is empty mid-edit; we only push to storage when the value
  // parses to a valid in-range hour.
  const [dailyHour, setDailyHour] = useState<number | undefined>(DEFAULT_DAILY_CHECK_HOUR);

  const refresh = useCallback(async () => {
    setPermission(await getNotificationPermissionState());
    setLastCheck(await settingsRepository.get(SETTINGS_KEYS.lastCheckAt));
    setDailyHour(await getDailyCheckHour());
  }, []);

  const onDailyHourChange = useCallback(async (v: number | undefined) => {
    setDailyHour(v);
    if (v == null || !Number.isFinite(v) || v < 0 || v > 23) return;
    await setDailyCheckHour(v);
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
      const r = await runAlertCheck({ manual: true });
      RNAlert.alert(s.alerts.checkSummary(r.matched, r.checked));
      await refresh();
    } catch (e) {
      RNAlert.alert(s.errors.fetchFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  /**
   * Build the export payload, write it to a temp file in the cache directory,
   * and hand the file URI to the system share sheet. The user picks the
   * destination (Drive, Files, email, Bluetooth, …).
   */
  const onExportShare = async () => {
    setExporting(true);
    try {
      const payload = await buildExport();
      const json = JSON.stringify(payload, null, 2);
      const filename = defaultExportFilename();
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        RNAlert.alert(s.settings.exportFailed, s.settings.exportNothingToShare);
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: s.settings.exportShare,
        UTI: 'public.json',
      });
    } catch (e) {
      RNAlert.alert(s.settings.exportFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  /**
   * Same payload, but the user picks a folder via Storage Access Framework
   * and we write the JSON file directly there. Lands somewhere they can find
   * later in their file manager — useful for "I want a known backup file".
   */
  const onExportSave = async () => {
    setExporting(true);
    try {
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return;
      const payload = await buildExport();
      const json = JSON.stringify(payload, null, 2);
      const filename = defaultExportFilename();
      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        perm.directoryUri,
        filename,
        'application/json',
      );
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
    } catch (e) {
      RNAlert.alert(s.settings.exportFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  /**
   * Pick a JSON file, validate it, then ask the user how to import — replace
   * everything or merge into existing data. Two-step UX (validate, then
   * confirm) so we never wipe data without showing what's about to come in.
   */
  const onImport = async () => {
    setImporting(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const uri = picked.assets[0].uri;
      const text = await FileSystem.readAsStringAsync(uri);
      const parsed = parseImport(text);
      if (!parsed.ok) {
        const msg =
          parsed.reason === 'unsupportedVersion'
            ? s.settings.importTooNew
            : s.settings.importInvalidBody(parsed.detail ?? parsed.reason);
        RNAlert.alert(s.settings.importInvalid, msg);
        return;
      }

      const { spots, alerts } = parsed.payload;
      RNAlert.alert(
        s.settings.importChooseTitle,
        s.settings.importChooseBody(spots.length, alerts.length),
        [
          { text: s.common.cancel, style: 'cancel' },
          {
            text: s.settings.importMerge,
            onPress: () => runImport(parsed.payload, 'merge'),
          },
          {
            text: s.settings.importReplaceAll,
            style: 'destructive',
            onPress: () => runImport(parsed.payload, 'replace'),
          },
        ],
      );
    } catch (e) {
      RNAlert.alert(s.settings.importFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const runImport = async (payload: Awaited<ReturnType<typeof buildExport>>, mode: ImportMode) => {
    setImporting(true);
    try {
      const summary = await applyImport(payload, mode);
      const skippedTotal = summary.spotsSkipped + summary.alertsSkipped + summary.tagsSkipped;
      RNAlert.alert(
        s.settings.title,
        s.settings.importDone(
          summary.spotsImported,
          summary.alertsImported,
          summary.tagsImported,
          skippedTotal,
        ),
      );
    } catch (e) {
      RNAlert.alert(s.settings.importFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
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

      <Text style={styles.label}>{s.settings.dailyCheckTitle}</Text>
      <Text style={styles.body}>{s.settings.dailyCheckBody}</Text>
      <View style={styles.timeRow}>
        <View style={styles.timeField}>
          <NumberField
            label={s.settings.dailyCheckHour}
            value={dailyHour}
            onChange={onDailyHourChange}
            step="integer"
            placeholder="0–23"
          />
        </View>
      </View>

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

      <Text style={styles.h2}>{s.settings.dataSection}</Text>
      <View style={styles.row}>
        <PrimaryButton
          title={exporting ? s.settings.exportRunning : s.settings.exportShare}
          onPress={onExportShare}
          loading={exporting}
          variant="secondary"
          style={styles.exportBtn}
        />
        {/* "Lagre til Filer" relies on Android's Storage Access Framework
            (FileSystem.StorageAccessFramework). On iOS this API is absent
            and would crash; iOS users save to Files via the share sheet
            already exposed by "Del fil". */}
        {Platform.OS === 'android' && (
          <PrimaryButton
            title={exporting ? s.settings.exportRunning : s.settings.exportSave}
            onPress={onExportSave}
            loading={exporting}
            variant="secondary"
            style={styles.exportBtn}
          />
        )}
      </View>
      <PrimaryButton
        title={importing ? s.settings.importRunning : s.settings.importButton}
        onPress={onImport}
        loading={importing}
        variant="secondary"
        style={{ marginTop: 8 }}
      />

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
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  exportBtn: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: '#0E3A5F', marginTop: 16, marginBottom: 4 },
  timeRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  timeField: { flex: 1 },
});
