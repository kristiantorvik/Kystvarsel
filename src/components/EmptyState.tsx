import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 32, alignItems: 'center' },
  text: { color: '#666', fontSize: 14, textAlign: 'center' },
});
