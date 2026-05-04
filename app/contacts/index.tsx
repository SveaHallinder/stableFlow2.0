import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StableSwitcher } from '@/components/StableSwitcher';
import { theme } from '@/components/theme';
import { useToast } from '@/components/ToastProvider';
import { color, radius } from '@/design/tokens';
import {
  useAppData,
  type ExternalContact,
  type ExternalContactType,
} from '@/context/AppDataContext';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

const palette = theme.colors;

const contactTypeLabels: Record<ExternalContactType, string> = {
  farrier: 'Hovslagare',
  vet: 'Veterinär',
  trainer: 'Tränare',
  therapist: 'Terapeut',
  other: 'Annat',
};

const contactTypeOrder: ExternalContactType[] = [
  'farrier',
  'vet',
  'trainer',
  'therapist',
  'other',
];

type Draft = {
  id?: string;
  type: ExternalContactType;
  name: string;
  phone: string;
  email: string;
  note: string;
};

export default function ContactsScreen() {
  const router = useRouter();
  const isDesktopWeb = useIsDesktopWeb();
  const { state, derived, actions } = useAppData();
  const toast = useToast();
  const stableId = state.currentStableId;
  const contacts = state.externalContacts.filter((contact) => contact.stableId === stableId);
  const canEdit = derived.permissions.canManageOnboarding || derived.permissions.canManageMembers;
  const [editing, setEditing] = React.useState<Draft | null>(null);

  const handleSave = () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.showToast('Ange ett namn.', 'error');
      return;
    }
    const result = actions.upsertExternalContact({
      id: editing.id,
      stableId,
      name: editing.name,
      type: editing.type,
      phone: editing.phone,
      email: editing.email,
      note: editing.note,
    });
    if (!result.success) {
      toast.showToast(result.reason, 'error');
      return;
    }
    toast.showToast(editing.id ? 'Kontakt uppdaterad.' : 'Kontakt skapad.', 'success');
    setEditing(null);
  };

  const handleDelete = (contact: ExternalContact) => {
    const result = actions.deleteExternalContact(contact.id);
    if (!result.success) {
      toast.showToast(result.reason, 'error');
      return;
    }
    toast.showToast('Kontakt borttagen.', 'success');
  };

  const beginEdit = (contact?: ExternalContact) => {
    setEditing({
      id: contact?.id,
      type: contact?.type ?? 'farrier',
      name: contact?.name ?? '',
      phone: contact?.phone ?? '',
      email: contact?.email ?? '',
      note: contact?.note ?? '',
    });
  };

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
          title="Kontakter"
          showSearch={false}
          left={
            <HeaderIconButton accessibilityLabel="Tillbaka" onPress={() => router.back()}>
              <Feather name="arrow-left" size={18} color={palette.primaryText} />
            </HeaderIconButton>
          }
          primaryAction={
            canEdit ? (
              <HeaderIconButton accessibilityLabel="Lägg till kontakt" onPress={() => beginEdit()}>
                <Feather name="plus" size={18} color={palette.primaryText} />
              </HeaderIconButton>
            ) : undefined
          }
        />
        {!isDesktopWeb ? <StableSwitcher showAccess /> : null}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isDesktopWeb && styles.scrollContentDesktop,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Card elevated style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>
              {contacts.length ? `${contacts.length} kontakter` : 'Inga kontakter ännu'}
            </Text>
            <Text style={styles.summaryText}>
              Lägg upp hovslagare, vet, tränare och andra som du bokar mot vårdhändelser.
            </Text>
            {!canEdit ? (
              <Text style={styles.notice}>Du kan läsa detta, men inte ändra.</Text>
            ) : null}
          </Card>

          {editing ? (
            <Card elevated style={styles.formCard}>
              <Text style={styles.formTitle}>{editing.id ? 'Redigera kontakt' : 'Ny kontakt'}</Text>
              <View style={styles.typeRow}>
                {contactTypeOrder.map((type) => {
                  const active = editing.type === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      onPress={() => setEditing((prev) => (prev ? { ...prev, type } : prev))}
                      style={[styles.chip, active && styles.chipActive]}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {contactTypeLabels[type]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                value={editing.name}
                onChangeText={(text) => setEditing((prev) => (prev ? { ...prev, name: text } : prev))}
                placeholder="Namn"
                placeholderTextColor={palette.secondaryText}
                style={styles.input}
              />
              <TextInput
                value={editing.phone}
                onChangeText={(text) => setEditing((prev) => (prev ? { ...prev, phone: text } : prev))}
                placeholder="Telefon (frivilligt)"
                placeholderTextColor={palette.secondaryText}
                style={styles.input}
              />
              <TextInput
                value={editing.email}
                onChangeText={(text) => setEditing((prev) => (prev ? { ...prev, email: text } : prev))}
                placeholder="E-post (frivilligt)"
                placeholderTextColor={palette.secondaryText}
                style={styles.input}
              />
              <TextInput
                value={editing.note}
                onChangeText={(text) => setEditing((prev) => (prev ? { ...prev, note: text } : prev))}
                placeholder="Anteckning (frivilligt)"
                placeholderTextColor={palette.secondaryText}
                style={styles.input}
              />
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonSecondary]}
                  onPress={() => setEditing(null)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonSecondaryText}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.buttonPrimary]}
                  onPress={handleSave}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonPrimaryText}>Spara kontakt</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ) : null}

          {contacts.length ? (
            <View style={{ gap: 10 }}>
              {contacts.map((contact) => (
                <Card key={contact.id} elevated style={styles.contactCard}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactMeta}>
                      {[
                        contactTypeLabels[contact.type],
                        contact.phone,
                        contact.email,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {contact.note ? (
                      <Text style={styles.contactNote} numberOfLines={2}>
                        {contact.note}
                      </Text>
                    ) : null}
                  </View>
                  {canEdit ? (
                    <View style={styles.contactActions}>
                      <TouchableOpacity
                        onPress={() => beginEdit(contact)}
                        style={[styles.button, styles.buttonSecondary]}
                        activeOpacity={0.85}
                      >
                        <Feather name="edit-2" size={14} color={palette.primaryText} />
                        <Text style={styles.buttonSecondaryText}>Redigera</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(contact)}
                        style={[styles.button, styles.buttonDanger]}
                        activeOpacity={0.85}
                      >
                        <Feather name="trash-2" size={14} color={palette.inverseText} />
                        <Text style={styles.buttonPrimaryText}>Ta bort</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </Card>
              ))}
            </View>
          ) : (
            <Card elevated style={styles.emptyCard}>
              <Feather name="phone" size={22} color={palette.primary} />
              <Text style={styles.emptyTitle}>Inga kontakter ännu</Text>
              <Text style={styles.emptyText}>
                {canEdit
                  ? 'Lägg till en hovslagare eller veterinär så kan du koppla dem till vårdhändelser.'
                  : 'Be en admin att lägga till kontakter.'}
              </Text>
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: color.bg },
  pageHeader: { marginBottom: 8 },
  pageHeaderDesktop: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 36,
    marginBottom: 0,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 50,
    gap: 14,
  },
  scrollContentDesktop: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 36,
    paddingTop: 0,
    paddingBottom: 40,
    gap: 18,
  },
  summaryCard: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 8,
    borderRadius: radius.xl,
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: palette.primaryText,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.secondaryText,
  },
  notice: {
    marginTop: 6,
    fontSize: 13,
    color: palette.secondaryText,
  },
  formCard: {
    padding: 16,
    gap: 10,
    borderRadius: radius.xl,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.primaryText,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
  },
  chipActive: { backgroundColor: palette.primary },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primaryText,
  },
  chipTextActive: { color: palette.inverseText },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceTint,
    color: palette.primaryText,
    fontSize: 14,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  buttonPrimary: { backgroundColor: palette.primary },
  buttonSecondary: { backgroundColor: palette.surfaceTint },
  buttonDanger: { backgroundColor: '#B3261E' },
  buttonPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.inverseText,
  },
  buttonSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primaryText,
  },
  contactCard: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderRadius: radius.xl,
    alignItems: 'flex-start',
  },
  contactName: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.primaryText,
  },
  contactMeta: {
    fontSize: 13,
    color: palette.secondaryText,
  },
  contactNote: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.primaryText,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  emptyCard: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 10,
    borderRadius: radius.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.primaryText,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.secondaryText,
    textAlign: 'center',
  },
});
