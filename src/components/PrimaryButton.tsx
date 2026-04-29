import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}

export function PrimaryButton({ title, onPress, loading, disabled, variant = 'primary', style }: Props) {
  const v =
    variant === 'danger' ? styles.danger :
    variant === 'secondary' ? styles.secondary : styles.primary;
  const tv =
    variant === 'secondary' ? styles.textSecondary : styles.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.base, v, disabled || loading ? styles.disabled : null, style]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={tv}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center' },
  primary: { backgroundColor: '#0E3A5F' },
  secondary: { backgroundColor: '#E0E6EE' },
  danger: { backgroundColor: '#B33A3A' },
  disabled: { opacity: 0.55 },
  textPrimary: { color: '#fff', fontWeight: '600', fontSize: 15 },
  textSecondary: { color: '#0E3A5F', fontWeight: '600', fontSize: 15 },
});
