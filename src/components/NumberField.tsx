import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

interface Props {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  step?: 'integer' | 'decimal';
}

/**
 * Keeps the raw input string in local state so a trailing decimal point
 * ("60.") survives mid-keystroke. The parent only sees parsed numbers.
 * Comma and period are both accepted as decimal separators.
 */
export function NumberField({ label, value, onChange, placeholder, step = 'decimal' }: Props) {
  const [text, setText] = useState<string>(value == null ? '' : String(value));
  const lastEmitted = useRef<number | undefined>(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(value == null ? '' : String(value));
      lastEmitted.current = value;
    }
  }, [value]);

  const handleChange = (raw: string) => {
    setText(raw);
    const trimmed = raw.trim().replace(',', '.');
    if (trimmed === '') {
      onChange(undefined);
      lastEmitted.current = undefined;
      return;
    }
    const n = step === 'integer' ? parseInt(trimmed, 10) : parseFloat(trimmed);
    if (isNaN(n)) return;
    onChange(n);
    lastEmitted.current = n;
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType={step === 'integer' ? 'number-pad' : 'decimal-pad'}
        value={text}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor="#9AA3AC"
        underlineColorAndroid="transparent"
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
    // Explicit text colour so dark-mode systems don't paint white on white.
    color: '#222',
  },
});
