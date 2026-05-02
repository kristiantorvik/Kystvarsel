import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

export function TextField({ label, value, onChange, placeholder, multiline, autoCapitalize }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline ? styles.multiline : null]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#9AA3AC"
        multiline={multiline}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 12 },
  label: { fontSize: 12, color: '#666', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#CCD3DA',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
