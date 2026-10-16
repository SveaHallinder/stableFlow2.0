import React from 'react';
import { TextInput, type TextInputProps } from 'react-native';

export type DateTimeFieldProps = Pick<TextInputProps,
  'style' | 'placeholder' | 'placeholderTextColor' | 'editable' | 'keyboardType' |
  'autoCapitalize' | 'accessibilityLabel' | 'testID'
> & {
  label: string;
  scopeKey: string;
  mode: 'date' | 'time';
  value: string;
  onChangeText: (value: string) => void;
  allowClear?: boolean;
  active?: boolean;
};

export function DateTimeField({
  label, value, onChangeText, style, placeholder, placeholderTextColor,
  editable, keyboardType, autoCapitalize, accessibilityLabel, testID,
}: DateTimeFieldProps) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      style={style}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      editable={editable}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
    />
  );
}
