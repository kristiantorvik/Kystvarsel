import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { strings } from '../i18n';

interface Props {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: Props) {
  const s = strings();
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={styles.btn}>
          <Text style={styles.btnText}>{s.common.retry}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 32, alignItems: 'center' },
  text: { color: '#A04040', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  btn: { backgroundColor: '#0E3A5F', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 },
  btnText: { color: '#fff', fontWeight: '600' },
});
