import React from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid, type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { color, radius, space } from '@/design/tokens';
import { isValidISODate, isValidTime } from '@/lib/dateValidation';
import { toISODate } from '@/lib/schedule';
import type { DateTimeFieldProps } from './DateTimeField';

type FieldContext = Readonly<{
  mode: 'date' | 'time'; value: string; scopeKey: string; editable?: boolean; active: boolean;
}>;
type PickerRequest = Readonly<{ mode: 'date' | 'time'; value: string; scopeKey: string; context: FieldContext }>;
let androidRequest: PickerRequest | null = null;

function dismissAndroid(request: PickerRequest | null) {
  if (!request || androidRequest !== request) return;
  androidRequest = null;
  void DateTimePickerAndroid.dismiss(request.mode).catch(() => {
    console.warn('[date time field] Datum-/tidsdialogen kunde inte stängas.');
  });
}

function pickerValue(mode: PickerRequest['mode'], value: string) {
  if (mode === 'date') {
    return isValidISODate(value) ? new Date(`${value}T12:00:00`) : new Date();
  }
  const now = new Date();
  const [hours, minutes] = isValidTime(value)
    ? value.split(':').map(Number) : [now.getHours(), now.getMinutes()];
  // Time-only values use a neutral date rather than a daylight-saving transition.
  return new Date(2000, 0, 15, hours, minutes);
}

function pickerText(mode: PickerRequest['mode'], value: Date) {
  return mode === 'date' ? toISODate(value).padStart(10, '0')
    : `${value.getHours()}`.padStart(2, '0') + ':' + `${value.getMinutes()}`.padStart(2, '0');
}

export function DateTimeField({
  label, mode, value, scopeKey, onChangeText, style, placeholder, placeholderTextColor,
  editable, accessibilityLabel, testID, allowClear = false, active = true,
}: DateTimeFieldProps) {
  const [editor, setEditor] = React.useState<{ request: PickerRequest; selection: Date } | null>(null);
  const [error, setError] = React.useState('');
  const fieldContext = React.useMemo(() => ({ mode, value, scopeKey, editable, active }),
    [mode, value, scopeKey, editable, active]);
  const requestRef = React.useRef<PickerRequest | null>(null);
  const selectionRef = React.useRef<Date | null>(null);
  const mountedRef = React.useRef(false);
  const latest = React.useRef({ mode, value, scopeKey, onChangeText, editable, active, context: fieldContext });
  const disabled = editable === false || !active;

  const cancel = React.useCallback(() => {
    dismissAndroid(requestRef.current);
    requestRef.current = null;
    selectionRef.current = null;
    setEditor(null);
    setError('');
  }, []);

  React.useLayoutEffect(() => {
    latest.current = { mode, value, scopeKey, onChangeText, editable, active, context: fieldContext };
  });

  React.useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      dismissAndroid(requestRef.current);
      requestRef.current = null;
      selectionRef.current = null;
    };
  }, []);

  React.useLayoutEffect(() => { cancel(); }, [mode, value, scopeKey, editable, active, cancel]);

  const isCurrent = (request: PickerRequest) => mountedRef.current &&
    requestRef.current === request && latest.current.context === request.context && latest.current.mode === request.mode &&
    latest.current.scopeKey === request.scopeKey &&
    latest.current.value === request.value && latest.current.active && latest.current.editable !== false &&
    (Platform.OS !== 'android' || androidRequest === request);

  const isFieldCurrent = () => mountedRef.current && latest.current.context === fieldContext &&
    latest.current.active && latest.current.editable !== false;

  const commit = (request: PickerRequest, date: Date) => {
    if (!isCurrent(request) || !Number.isFinite(date.getTime())) return;
    const next = pickerText(request.mode, date);
    if (!(request.mode === 'date' ? isValidISODate(next) : isValidTime(next))) return;
    requestRef.current = null;
    selectionRef.current = null;
    if (androidRequest === request) androidRequest = null;
    setEditor(null);
    latest.current.onChangeText(next);
  };

  const open = () => {
    if (!isFieldCurrent()) return;
    cancel();
    const request: PickerRequest = { mode, value, scopeKey, context: fieldContext };
    const seed = pickerValue(mode, value);
    requestRef.current = request;
    selectionRef.current = seed;
    if (Platform.OS === 'ios') {
      setEditor({ request, selection: seed });
      return;
    }
    const fail = () => {
      if (!isCurrent(request)) return;
      requestRef.current = null;
      selectionRef.current = null;
      if (androidRequest === request) androidRequest = null;
      setError('Datum-/tidsväljaren kunde inte öppnas. Försök igen.');
      console.warn('[date time field] Native datum-/tidsväljare misslyckades.');
    };
    androidRequest = request;
    try {
      DateTimePickerAndroid.open({
        mode, value: seed, display: 'default', is24Hour: true,
        positiveButton: { label: 'Klar' }, negativeButton: { label: 'Avbryt' },
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (!isCurrent(request)) return;
          if (event.type === 'set' && date && Number.isFinite(date.getTime())) commit(request, date);
          else {
            requestRef.current = null;
            selectionRef.current = null;
            if (androidRequest === request) androidRequest = null;
          }
        },
        onError: fail,
      });
    } catch { fail(); }
  };

  const request = editor?.request;
  const cancelEditor = () => { if (request && isCurrent(request)) cancel(); };
  const changeSelection = (event: DateTimePickerEvent, date?: Date) => {
    if (!request || !isCurrent(request) || event.type !== 'set' || !date || !Number.isFinite(date.getTime())) return;
    const next = new Date(date.getTime());
    selectionRef.current = next;
    setEditor({ request, selection: next });
  };
  const inputStyle = StyleSheet.flatten(style);
  const buttonStyle = inputStyle ? { ...inputStyle, cursor: undefined } : undefined;
  const textStyle = {
    fontSize: inputStyle?.fontSize ?? 14,
    fontWeight: inputStyle?.fontWeight,
    fontFamily: inputStyle?.fontFamily,
    lineHeight: inputStyle?.lineHeight,
    color: value ? inputStyle?.color ?? color.text : placeholderTextColor ?? color.textMuted,
  };

  return (
    <View>
      <TouchableOpacity
        onPress={open}
        disabled={disabled}
        style={buttonStyle}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityValue={{ text: value || placeholder || 'Inget värde valt' }}
        accessibilityState={{ disabled }}
        accessibilityHint={mode === 'date' ? 'Öppnar datumväljaren.' : 'Öppnar tidsväljaren.'}
        testID={testID}
      >
        <Text style={textStyle}>{value || placeholder || 'Välj'}</Text>
      </TouchableOpacity>
      {allowClear && value ? (
        <TouchableOpacity
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${label}, rensa`}
          accessibilityState={{ disabled }}
          style={styles.clear}
          onPress={() => {
            if (!isFieldCurrent()) return;
            cancel();
            latest.current.onChangeText('');
          }}
        >
          <Text style={styles.clearText}>Rensa tid</Text>
        </TouchableOpacity>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Modal
        transparent
        animationType="fade"
        visible={Platform.OS === 'ios' && editor !== null && !disabled}
        onRequestClose={cancelEditor}
      >
        <View style={styles.backdrop}>
          <View style={styles.card} accessibilityViewIsModal>
            <Text style={styles.title}>{label}</Text>
            {editor ? (
              <DateTimePicker
                value={editor.selection}
                mode={mode}
                display="spinner"
                themeVariant="light"
                minuteInterval={1}
                disabled={disabled}
                onChange={changeSelection}
                accessibilityLabel={`${label}, välj värde`}
              />
            ) : null}
            <View style={styles.actions}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}, avbryt`} onPress={cancelEditor} style={styles.button}>
                <Text style={styles.cancelText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${label}, klar`}
                disabled={disabled}
                accessibilityState={{ disabled }}
                onPress={() => { if (request && selectionRef.current) commit(request, selectionRef.current); }}
                style={[styles.button, styles.primary]}
              >
                <Text style={styles.primaryText}>Klar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  clear: { alignSelf: 'flex-start', paddingVertical: space.xs },
  clearText: { color: color.textMuted, fontSize: 13 },
  error: { color: '#F95F5F', fontSize: 13, marginTop: space.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 22, 34, 0.35)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: { width: '100%', maxWidth: 380, padding: space.md, borderRadius: radius.md, backgroundColor: color.card },
  title: { color: color.text, fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  button: { flex: 1, padding: space.md, borderRadius: radius.sm, alignItems: 'center' },
  primary: { backgroundColor: color.tint },
  cancelText: { color: color.text },
  primaryText: { color: '#FFFFFF', fontWeight: '600' },
});
