import React from 'react';
import { generateId } from '@/lib/ids';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DataSyncStatus } from '@/components/DataSyncStatus';
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
  const [search, setSearch] = React.useState('');
  const pending = React.useRef(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState('');
  const query = search.trim().toLowerCase();
  const visibleContacts = contacts.filter((contact) =>
    [contact.name, contactTypeLabels[contact.type], contact.phone, contact.email]
      .some((value) => value?.toLowerCase().includes(query)),
  );

  const handleSave = async () => {
    if (!editing || pending.current) return;
    if (!editing.name.trim()) {
      toast.showToast('Ange ett namn.', 'error');
      return;
    }
    pending.current = true;
    setPendingId(editing.id ?? null);
    setSaveError('');
    const result = await actions.upsertExternalContact({
      id: editing.id,
      stableId,
      name: editing.name,
      type: editing.type,
      phone: editing.phone,
      email: editing.email,
      note: editing.note,
    });
    pending.current = false;
    setPendingId(null);
    if (!result.success) {
      setSaveError(result.reason);
      toast.showToast(result.reason, 'error');
      return;
    }
    toast.showToast(contacts.some((contact) => contact.id === editing.id) ? 'Kontakt uppdaterad.' : 'Kontakt skapad.', 'success');
    setEditing(null);
  };

  const handleDelete = async (contact: ExternalContact) => {
    if (pending.current) return;
    pending.current = true;
    setPendingId(contact.id);
    setSaveError('');
    const result = await actions.deleteExternalContact(contact.id);
    pending.current = false;
    setPendingId(null);
    if (!result.success) {
      setSaveError(result.reason);
      toast.showToast(result.reason, 'error');
      return;
    }
    toast.showToast('Kontakt borttagen.', 'success');
  };

  const beginEdit = (contact?: ExternalContact) => {
    if (pending.current) return;
    setSaveError('');
    setEditing({
      id: contact?.id ?? generateId(),
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
            <HeaderIconButton style={styles.iconButton} accessibilityLabel="Tillbaka" onPress={() => router.back()}>
              <Feather name="arrow-left" size={18} color={palette.primaryText} />
            </HeaderIconButton>
          }
          primaryAction={
            canEdit ? (
              <HeaderIconButton style={styles.iconButton} accessibilityLabel="Lägg till kontakt" onPress={() => beginEdit()}>
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
          <DataSyncStatus />
          {saveError ? <Text style={{ color: palette.error, fontSize: 14 }}>{saveError}</Text> : null}
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

          {contacts.length ? (
            <View style={styles.searchRow}>
              <Feather name="search" size={18} color={palette.secondaryText} />
              <TextInput
                accessibilityLabel="Sök kontakt"
                placeholder="Sök namn eller kontakttyp"
                placeholderTextColor={palette.secondaryText}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                style={styles.searchInput}
              />
              {search ? (
                <HeaderIconButton style={styles.iconButton} accessibilityLabel="Rensa kontaktsökning" onPress={() => setSearch('')}>
                  <Feather name="x" size={18} color={palette.primaryText} />
                </HeaderIconButton>
              ) : null}
            </View>
          ) : null}

          {editing ? (
            <Card elevated style={styles.formCard}>
              <Text style={styles.formTitle}>{contacts.some((contact) => contact.id === editing.id) ? 'Redigera kontakt' : 'Ny kontakt'}</Text>
              <View style={styles.typeRow}>
                {contactTypeOrder.map((type) => {
                  const active = editing.type === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      {...(Platform.OS === 'web' ? { 'aria-pressed': active } : {})}
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
                accessibilityLabel="Namn"
                editable={pendingId === null}
                value={editing.name}
                onChangeText={(text) => setEditing((prev) => (prev ? { ...prev, name: text } : prev))}
                placeholder="Namn"
                placeholderTextColor={palette.secondaryText}
                style={styles.input}
              />
              <TextInput
                accessibilityLabel="Telefon (frivilligt)"
                keyboardType="phone-pad"
                editable={pendingId === null}
                value={editing.phone}
                onChangeText={(text) => setEditing((prev) => (prev ? { ...prev, phone: text } : prev))}
                placeholder="Telefon (frivilligt)"
                placeholderTextColor={palette.secondaryText}
                style={styles.input}
              />
              <TextInput
                accessibilityLabel="E-post (frivilligt)"
                keyboardType="email-address"
                autoCapitalize="none"
                editable={pendingId === null}
                value={editing.email}
                onChangeText={(text) => setEditing((prev) => (prev ? { ...prev, email: text } : prev))}
                placeholder="E-post (frivilligt)"
                placeholderTextColor={palette.secondaryText}
                style={styles.input}
              />
              <TextInput
                accessibilityLabel="Anteckning (frivilligt)"
                editable={pendingId === null}
                value={editing.note}
                onChangeText={(text) => setEditing((prev) => (prev ? { ...prev, note: text } : prev))}
                placeholder="Anteckning (frivilligt)"
                placeholderTextColor={palette.secondaryText}
                style={styles.input}
              />
              <View style={styles.formActions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.button, styles.buttonSecondary]}
                  disabled={pendingId !== null}
                  onPress={() => setEditing(null)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonSecondaryText}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.button, styles.buttonPrimary]}
                  disabled={pendingId !== null}
                  onPress={handleSave}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonPrimaryText}>{pendingId ? 'Sparar kontakt…' : 'Spara kontakt'}</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ) : null}

          {visibleContacts.length ? (
            <View style={{ gap: 10 }}>
              {visibleContacts.map((contact) => (
                <Card key={contact.id} elevated style={styles.contactCard}>
                  <View style={styles.contactDetails}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactMeta}>{contactTypeLabels[contact.type]}</Text>
                    {contact.phone ? (
                      <Link href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} asChild>
                        <TouchableOpacity
                          accessibilityRole="link"
                          accessibilityLabel={`Ring ${contact.name}: ${contact.phone}`}
                          style={styles.contactLink}
                          activeOpacity={0.85}
                        >
                          <Feather name="phone" size={16} color={palette.primary} />
                          <Text style={styles.contactLinkText}>{contact.phone}</Text>
                        </TouchableOpacity>
                      </Link>
                    ) : null}
                    {contact.email ? (
                      <Link href={`mailto:${contact.email.trim()}`} asChild>
                        <TouchableOpacity
                          accessibilityRole="link"
                          accessibilityLabel={`Skicka e-post till ${contact.name}: ${contact.email}`}
                          style={styles.contactLink}
                          activeOpacity={0.85}
                        >
                          <Feather name="mail" size={16} color={palette.primary} />
                          <Text style={styles.contactLinkText}>{contact.email}</Text>
                        </TouchableOpacity>
                      </Link>
                    ) : null}
                    {!contact.phone && !contact.email ? (
                      <Text style={styles.contactMeta}>Telefon och e-post saknas.</Text>
                    ) : null}
                    {contact.note ? (
                      <Text style={styles.contactNote}>
                        {contact.note}
                      </Text>
                    ) : null}
                  </View>
                  {canEdit ? (
                    <View style={styles.contactActions}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Redigera ${contact.name}`}
                        disabled={pendingId !== null}
                        onPress={() => beginEdit(contact)}
                        style={[styles.button, styles.buttonSecondary]}
                        activeOpacity={0.85}
                      >
                        <Feather name="edit-2" size={14} color={palette.primaryText} />
                        <Text style={styles.buttonSecondaryText}>Redigera</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Ta bort ${contact.name}`}
                        disabled={pendingId !== null}
                        onPress={() => handleDelete(contact)}
                        style={styles.button}
                        activeOpacity={0.85}
                      >
                        <Feather name="trash-2" size={14} color="#B3261E" />
                        <Text style={styles.buttonDangerText}>{pendingId === contact.id && !editing ? 'Tar bort…' : 'Ta bort'}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </Card>
              ))}
            </View>
          ) : (
            <Card elevated style={styles.emptyCard}>
              <Feather name="phone" size={22} color={palette.primary} />
              <Text style={styles.emptyTitle}>
                {contacts.length ? 'Inga kontakter matchar sökningen.' : 'Inga kontakter ännu'}
              </Text>
              <Text style={styles.emptyText}>
                {contacts.length
                  ? 'Prova ett annat namn eller en annan kontakttyp.'
                  : canEdit
                  ? 'Lägg till en hovslagare eller veterinär så kan du koppla dem till vårdhändelser.'
                  : 'Be en admin att lägga till kontakter.'}
              </Text>
              {contacts.length ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.button, styles.buttonSecondary]}
                  onPress={() => setSearch('')}
                >
                  <Text style={styles.buttonSecondaryText}>Visa alla kontakter</Text>
                </TouchableOpacity>
              ) : canEdit ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.button, styles.buttonPrimary]}
                  onPress={() => beginEdit()}
                >
                  <Text style={styles.buttonPrimaryText}>Lägg till kontakt</Text>
                </TouchableOpacity>
              ) : null}
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
  iconButton: { width: 44, height: 44 },
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    fontSize: 14,
    color: palette.primaryText,
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
    minHeight: 44,
    justifyContent: 'center',
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
    minHeight: 44,
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
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  buttonPrimary: { backgroundColor: palette.primary },
  buttonSecondary: { backgroundColor: palette.surfaceTint },
  buttonDangerText: { color: '#B3261E', fontSize: 12, fontWeight: '700' },
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
    padding: 16,
    gap: 12,
    borderRadius: radius.xl,
  },
  contactDetails: {
    minWidth: 0,
    gap: 4,
  },
  contactLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contactLinkText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    color: palette.primary,
    textDecorationLine: 'underline',
  },
  contactName: {
    lineHeight: 22,
    fontSize: 16,
    fontWeight: '800',
    color: palette.primaryText,
  },
  contactMeta: {
    lineHeight: 18,
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
    justifyContent: 'flex-start',
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
