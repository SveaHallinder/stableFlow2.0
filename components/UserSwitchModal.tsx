import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '@/components/theme';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { radius } from '@/design/tokens';

const palette = theme.colors;

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  staff: 'Personal',
  rider: 'Medryttare',
  farrier: 'Hovslagare',
  vet: 'Veterinär',
  trainer: 'Tränare',
  therapist: 'Massör',
  guest: 'Gäst',
};

type UserSwitchModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function UserSwitchModal({ visible, onClose }: UserSwitchModalProps) {
  const { state, actions } = useAppData();
  const { users, currentUserId, currentStableId } = state;
  const toast = useToast();

  const handleSwitch = React.useCallback(
    (userId: string) => {
      const result = actions.setCurrentUser(userId);
      if (result.success) {
        toast.showToast('Bytte användare.', 'success');
        onClose();
      } else {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, onClose, toast],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Byt användare</Text>
          <Text style={styles.text}>Välj en användare för att testa roller och behörighet.</Text>
          <View style={styles.list}>
            {Object.values(users).map((user) => {
              const membership = user.membership.find((m) => m.stableId === currentStableId);
              const roleLabel = membership?.role ? roleLabels[membership.role] ?? membership.role : 'Ingen roll';
              const accessLabel =
                membership?.access === 'owner'
                  ? 'Full'
                  : membership?.access === 'edit'
                    ? 'Redigera'
                    : membership?.access === 'view'
                      ? 'Läsa'
                      : '';
              const metaLabel = accessLabel ? `${roleLabel} · ${accessLabel}` : roleLabel;
              const active = user.id === currentUserId;
              return (
                <TouchableOpacity
                  key={user.id}
                  style={[styles.userRow, active && styles.userRowActive]}
                  onPress={() => handleSwitch(user.id)}
                  activeOpacity={0.85}
                >
                  <View>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={styles.userMeta}>{metaLabel}</Text>
                  </View>
                  {active ? <Feather name="check" size={16} color={palette.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondary} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.secondaryText}>Stäng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.primaryText,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.secondaryText,
  },
  list: {
    gap: 8,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surfaceTint,
  },
  userRowActive: {
    borderColor: 'rgba(45,108,246,0.4)',
    backgroundColor: 'rgba(45,108,246,0.08)',
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.primaryText,
  },
  userMeta: {
    fontSize: 12,
    color: palette.secondaryText,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.primaryText,
  },
});
