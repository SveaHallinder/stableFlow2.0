import { InviteReceipt } from '@/components/InviteReceipt';
import { StableInviteList } from '@/components/StableInviteList';
import type { InviteConfirmation } from '@/context/AppDataContext';
import React from 'react';
import { generateId } from '@/lib/ids';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DesktopNav } from '@/components/DesktopNav';
import { StableSwitcher } from '@/components/StableSwitcher';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { radius } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import { canOpenOwnerWorkspace } from '@/lib/onboarding-flow';

const palette = theme.colors;

type AdminLink = {
  title: string;
  description: string;
  route: string;
  params?: Record<string, string>;
  action: string;
};

const adminLinks: AdminLink[] = [
  { title: 'Säsongsschema', description: 'Datumperioder, dagliga pass och återkommande veckofördelning.', route: '/season-schedule', action: 'Planera fasta pass' },
  {
    title: 'Stall & inställningar',
    description: 'Skapa stall/gårdar, sätt event-synlighet, ridhus och ridpass-typer.',
    route: '/stables',
    action: 'Öppna stalladmin',
  },
  {
    title: 'Medlemmar & roller',
    description: 'Bjud in, ändra roller och koppla hästar till medlemmar.',
    route: '/members',
    action: 'Öppna medlemmar',
  },
  {
    title: 'Hästar & boxar',
    description: 'Lägg till hästar, ägare och boxinfo.',
    route: '/stables',
    action: 'Öppna hästar',
  },
  {
    title: 'Hagar',
    description: 'Skapa hagar och koppla hästar till rätt hage.',
    route: '/paddocks',
    action: 'Öppna hagar',
  },
  {
    title: 'Ridhus & bokning',
    description: 'Bokningar, status och schema för ridhus.',
    route: '/calendar',
    params: { section: 'arena' },
    action: 'Öppna ridhus',
  },
  {
    title: 'Schema & händelser',
    description: 'Pass, händelser och uppgifter i stallet.',
    route: '/calendar',
    params: { section: 'pass' },
    action: 'Öppna schema',
  },
  {
    title: 'Kontakter',
    description: 'Hovslagare, veterinärer och tränare som vården bokas mot.',
    route: '/contacts',
    action: 'Öppna kontakter',
  },
  {
    title: 'Rapporter & moderering',
    description: 'Granska och lös rapporterat innehåll från medlemmar.',
    route: '/admin/reports',
    action: 'Öppna rapporter',
  },
];

type QuickRole = 'admin' | 'staff' | 'rider';

const quickRoleOptions: {
  id: QuickRole;
  label: string;
  customRole: string;
  access: 'owner' | 'edit' | 'view';
  riderRole: 'owner' | 'medryttare' | 'other';
}[] = [
  { id: 'admin', label: 'Admin', customRole: 'Admin', access: 'owner', riderRole: 'owner' },
  { id: 'staff', label: 'Personal', customRole: 'Personal', access: 'edit', riderRole: 'other' },
  { id: 'rider', label: 'Medryttare', customRole: 'Medryttare', access: 'view', riderRole: 'medryttare' },
];

export default function AdminDashboard() {
  const router = useRouter();
  const toast = useToast();
  const { state, actions, derived } = useAppData();
  const isDesktopWeb = useIsDesktopWeb();

  const currentUser = state.users[state.currentUserId];
  const [activeQuickAction, setActiveQuickAction] = React.useState<'stable' | 'invite' | 'horse' | 'paddock' | null>(null);
  const canManageOnboarding = canOpenOwnerWorkspace(derived);
  const stableCount = state.stables.length;
  const farmCount = state.farms.length;
  const currentStableId = state.currentStableId;
  const memberCount = React.useMemo(
    () =>
      Object.values(state.users).filter((user) =>
        user.membership.some((entry) => entry.stableId === currentStableId),
      ).length,
    [currentStableId, state.users],
  );
  const horseCount = React.useMemo(
    () => state.horses.filter((horse) => horse.stableId === currentStableId).length,
    [currentStableId, state.horses],
  );
  const fallbackQuickStableId = currentStableId || state.stables[0]?.id || '';
  const [quickStableId, setQuickStableId] = React.useState(fallbackQuickStableId);
  const creatingStableRef = React.useRef(false);
  const newStableIdRef = React.useRef<string | null>(null);
  const [creatingStable, setCreatingStable] = React.useState(false);
  const [stableCreateError, setStableCreateError] = React.useState<string | null>(null);
  const [quickStableDraft, setQuickStableDraft] = React.useState({
    name: '',
    location: '',
    farmId: '',
  });
  const [savingHorse, setSavingHorse] = React.useState(false);
  const savingHorseRef = React.useRef(false);
  const newHorseIdRef = React.useRef<string | null>(null);
  const [horseSaveError, setHorseSaveError] = React.useState<string | null>(null);
  const [quickHorseDraft, setQuickHorseDraft] = React.useState({ name: '' });
  const savingPaddockRef = React.useRef(false);
  const newPaddockIdRef = React.useRef<string | null>(null);
  const [savingPaddock, setSavingPaddock] = React.useState(false);
  const [paddockError, setPaddockError] = React.useState<string | null>(null);
  const [quickPaddockDraft, setQuickPaddockDraft] = React.useState({
    name: '',
    horseIds: [] as string[],
  });
  const [savingInvite, setSavingInvite] = React.useState(false);
  const savingInviteRef = React.useRef(false);
  const [inviteReceipt, setInviteReceipt] = React.useState<InviteConfirmation | null>(null);
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [quickMemberDraft, setQuickMemberDraft] = React.useState({
    name: '',
    email: '',
  });
  const [quickMemberRole, setQuickMemberRole] = React.useState<QuickRole>('rider');
  const selectedQuickRole = React.useMemo(
    () => quickRoleOptions.find((option) => option.id === quickMemberRole) ?? quickRoleOptions[2],
    [quickMemberRole],
  );
  const quickStableHorses = React.useMemo(
    () => state.horses.filter((horse) => horse.stableId === quickStableId),
    [quickStableId, state.horses],
  );

  React.useEffect(() => {
    if (!quickStableId && fallbackQuickStableId) {
      setQuickStableId(fallbackQuickStableId);
      return;
    }
    if (quickStableId && !state.stables.some((stable) => stable.id === quickStableId)) {
      setQuickStableId(fallbackQuickStableId);
    }
  }, [fallbackQuickStableId, quickStableId, state.stables]);

  React.useEffect(() => {
    setQuickPaddockDraft((prev) => ({ ...prev, horseIds: [] }));
  }, [quickStableId]);

  React.useEffect(() => {
    setQuickStableDraft((prev) => {
      if (!prev.farmId) {
        return prev;
      }
      return state.farms.some((farm) => farm.id === prev.farmId)
        ? prev
        : { ...prev, farmId: '' };
    });
  }, [state.farms]);

  const handleExitAdmin = React.useCallback(() => {
    router.replace('/');
  }, [router]);

  const handleStartOnboarding = React.useCallback(() => {
    actions.setOnboardingDismissed(false);
    router.push('/(onboarding)');
  }, [actions, router]);

  const handleDismissOnboarding = React.useCallback(() => {
    const result = actions.setOnboardingDismissed(true);
    if (!result.success) {
      toast.showToast(result.reason, 'error');
      return;
    }
    toast.showToast('Onboarding är nu dold.', 'success');
  }, [actions, toast]);

  const handleSelectQuickStable = React.useCallback(
    (stableId: string) => {
      if (savingPaddockRef.current) return;
      newPaddockIdRef.current = null;
      setPaddockError(null);
      setQuickStableId(stableId);
      actions.setCurrentStable(stableId);
    },
    [actions],
  );

  const handleQuickCreateStable = React.useCallback(async () => {
    if (creatingStableRef.current) return;
    const name = quickStableDraft.name.trim();
    if (!name) {
      toast.showToast('Stallnamn krävs.', 'error');
      return;
    }
    creatingStableRef.current = true;
    setCreatingStable(true);
    setStableCreateError(null);
    newStableIdRef.current ??= generateId();
    const result = await actions.upsertStable({
      requestId: newStableIdRef.current,
      name,
      location: quickStableDraft.location.trim() || undefined,
      farmId: quickStableDraft.farmId || undefined,
    });
    creatingStableRef.current = false;
    setCreatingStable(false);
    if (!result.success || !result.data) {
      setStableCreateError(result.success ? 'Servern bekräftade inte stallet. Försök igen.' : result.reason);
      return;
    }
    newStableIdRef.current = null;
    actions.setCurrentStable(result.data.id);
    setQuickStableId(result.data.id);
    setQuickStableDraft((prev) => ({
      ...prev,
      name: '',
      location: '',
    }));
    toast.showToast('Stall skapat.', 'success');
  }, [actions, quickStableDraft.farmId, quickStableDraft.location, quickStableDraft.name, toast]);

  const handleQuickAddHorse = React.useCallback(async () => {
    if (savingHorseRef.current) return;
    if (!quickStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return;
    }
    const name = quickHorseDraft.name.trim();
    if (!name) {
      toast.showToast('Hästens namn krävs.', 'error');
      return;
    }
    savingHorseRef.current = true;
    setSavingHorse(true);
    setHorseSaveError(null);
    newHorseIdRef.current ??= generateId();
    const result = await actions.upsertHorse({
      id: newHorseIdRef.current,
      name,
      stableId: quickStableId,
      gender: 'unknown',
    });
    savingHorseRef.current = false;
    setSavingHorse(false);
    if (!result.success) {
      setHorseSaveError(result.reason);
      toast.showToast(result.reason, 'error');
      return;
    }
    newHorseIdRef.current = null;
    setQuickHorseDraft({ name: '' });
    toast.showToast('Häst tillagd.', 'success');
  }, [actions, quickHorseDraft.name, quickStableId, toast]);

  const handleToggleQuickHorse = React.useCallback((horseId: string) => {
    setQuickPaddockDraft((prev) => {
      const exists = prev.horseIds.includes(horseId);
      return {
        ...prev,
        horseIds: exists ? prev.horseIds.filter((id) => id !== horseId) : [...prev.horseIds, horseId],
      };
    });
  }, []);

  const handleQuickAddPaddock = React.useCallback(async () => {
    if (savingPaddockRef.current || !state.paddockLinksReady) return;
    if (!quickStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return;
    }
    const name = quickPaddockDraft.name.trim();
    if (!name) {
      toast.showToast('Hagens namn krävs.', 'error');
      return;
    }
    savingPaddockRef.current = true;
    setSavingPaddock(true);
    setPaddockError(null);
    newPaddockIdRef.current ??= generateId();
    try {
      const result = await actions.upsertPaddock({
        id: newPaddockIdRef.current,
        stableId: quickStableId,
        name,
        horseIds: [...quickPaddockDraft.horseIds],
        expectedRevision: null,
        season: 'yearRound',
      });
      if (!result.success) {
        setPaddockError(result.reason);
        return;
      }
      newPaddockIdRef.current = null;
      setQuickPaddockDraft({ name: '', horseIds: [] });
      toast.showToast('Hage skapad.', 'success');
    } catch (error) {
      setPaddockError(error instanceof Error ? error.message : 'Hagen kunde inte sparas. Dina val finns kvar.');
    } finally {
      savingPaddockRef.current = false;
      setSavingPaddock(false);
    }
  }, [actions, quickPaddockDraft.horseIds, quickPaddockDraft.name, quickStableId, state.paddockLinksReady, toast]);

  const handleQuickInviteMember = React.useCallback(async () => {
    if (savingInviteRef.current) return;
    if (!quickStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return;
    }
    const name = quickMemberDraft.name.trim();
    const email = quickMemberDraft.email.trim();
    if (!name || !email) {
      toast.showToast('Namn och e-post krävs.', 'error');
      return;
    }
    savingInviteRef.current = true;
    setSavingInvite(true);
    setInviteError(null);
    const result = await actions.addMember({
      name,
      email,
      stableId: quickStableId,
      stableIds: [quickStableId],
      role: selectedQuickRole.id,
      customRole: selectedQuickRole.customRole,
      access: selectedQuickRole.access,
      riderRole: selectedQuickRole.riderRole,
    });
    savingInviteRef.current = false;
    setSavingInvite(false);
    if (!result.success) {
      setInviteError(result.reason);
      toast.showToast(result.reason, 'error');
      return;
    }
    setInviteReceipt(result.data ?? null);
    setQuickMemberDraft({ name: '', email: '' });
    toast.showToast('Inbjudan skapad.', 'success');
  }, [actions, quickMemberDraft.email, quickMemberDraft.name, quickStableId, selectedQuickRole, toast]);

  const wrapDesktop = (content: React.ReactNode) => {
    if (!isDesktopWeb) {
      return content;
    }
    return (
      <View style={styles.desktopShell}>
        <View style={styles.desktopSidebar}>
          <DesktopNav variant="sidebar" />
        </View>
        <View style={styles.desktopMain}>{content}</View>
      </View>
    );
  };

  const canQuickCreateStable = !creatingStable && quickStableDraft.name.trim().length > 0;
  const canQuickAddHorse = Boolean(!savingHorse && quickStableId && quickHorseDraft.name.trim().length > 0);
  const canQuickAddPaddock = Boolean(!savingPaddock && state.paddockLinksReady && quickStableId && quickPaddockDraft.name.trim().length > 0);
  const canQuickInvite = Boolean(
    !savingInvite &&
    quickStableId &&
      quickMemberDraft.name.trim().length > 0 &&
      quickMemberDraft.email.trim().length > 0,
  );

  if (!canManageOnboarding) {
    return (
      <LinearGradient colors={theme.gradients.background} style={styles.background}>
        <SafeAreaView style={styles.safeArea}>
          {wrapDesktop(
            <View style={styles.centerState}>
              <Text style={styles.centerTitle}>Du har inte adminbehörighet.</Text>
              <Text style={styles.centerSubtitle}>Kontakta en admin om du behöver ändra stallinställningar.</Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.replace('/')}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryLabel}>Till överblick</Text>
              </TouchableOpacity>
            </View>,
          )}
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        {wrapDesktop(
          <>
            <ScreenHeader
              style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
              title="Mitt stall"
              left={
                <HeaderIconButton
                  accessibilityRole="button"
                  accessibilityLabel="Till överblick"
                  onPress={handleExitAdmin}
                  style={styles.headerIconButton}
                >
                  <Text style={styles.headerIcon}>‹</Text>
                </HeaderIconButton>
              }
              showSearch={false}
              showLogo={false}
            />
            {!isDesktopWeb && stableCount > 0 ? <StableSwitcher /> : null}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.workspaceIntro}>
                <Text style={styles.workspaceTitle}>{state.stables.find(stable => stable.id === currentStableId)?.name || 'Din stallverksamhet'}</Text>
                <Text style={styles.sectionHint}>{memberCount} {memberCount === 1 ? 'medlem' : 'medlemmar'} · {horseCount} {horseCount === 1 ? 'häst' : 'hästar'} · {stableCount} stall{farmCount ? ` · ${farmCount} ${farmCount === 1 ? 'gård' : 'gårdar'}` : ''}</Text>
              </View>
              {!derived.onboardingComplete ? <Card style={styles.card}>
                <Text style={styles.sectionTitle}>Gör klart ditt stall</Text>
                <Text style={styles.sectionHint}>Fortsätt där du slutade. Dina sparade stall, hästar och pass finns kvar.</Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={handleStartOnboarding} activeOpacity={0.85}>
                    <Text style={styles.primaryLabel}>Fortsätt komma igång</Text>
                  </TouchableOpacity>
                  {!currentUser?.onboardingDismissed ? <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={handleDismissOnboarding} activeOpacity={0.85}><Text style={styles.secondaryLabel}>Påminn mig senare</Text></TouchableOpacity> : null}
                </View>
              </Card> : <TouchableOpacity accessibilityRole="button" style={styles.onboardingLink} onPress={handleStartOnboarding}><Text style={styles.linkCardCta}>Visa stallets introduktion</Text></TouchableOpacity>}
              <Card tone="muted" style={styles.card}>
                <Text style={styles.sectionTitle}>Vad vill du göra?</Text>
                <Text style={styles.sectionHint}>Välj en uppgift. Du kan ändra detaljer och roller i respektive verktyg nedanför.</Text>
                <View style={styles.quickActionGrid}>
                  {([
                    { id: 'invite', title: 'Bjud in medlem', description: 'Få med hela stallet', icon: 'user-plus' },
                    { id: 'horse', title: 'Lägg till häst', description: 'En ny häst i stallet', icon: 'plus-circle' },
                    { id: 'paddock', title: 'Skapa hage', description: 'Fördela stallets hästar', icon: 'map' },
                    { id: 'stable', title: 'Skapa stall', description: 'Utöka din verksamhet', icon: 'home' },
                  ] as const).map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityState={{ expanded: activeQuickAction === item.id }} style={[styles.quickActionTile, activeQuickAction === item.id && styles.quickActionTileActive]} disabled={creatingStable || savingInvite || savingHorse || savingPaddock} onPress={() => setActiveQuickAction(activeQuickAction === item.id ? null : item.id)}>
                    <Feather name={item.icon} size={21} color={palette.primaryText} />
                    <Text style={styles.quickActionTitle}>{item.title}</Text>
                    <Text style={styles.sectionHint}>{item.description}</Text>
                  </TouchableOpacity>)}
                </View>
                {activeQuickAction ? <View style={styles.formHeading}><Text style={styles.sectionHint}>Formuläret sparas först när du väljer knappen nedan.</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Stäng formulär" style={styles.closeForm} disabled={creatingStable || savingInvite || savingHorse || savingPaddock} onPress={() => setActiveQuickAction(null)}><Feather name="x" size={20} color={palette.primaryText} /></TouchableOpacity></View> : null}
                {activeQuickAction && state.stables.length > 0 ? (
                  <View style={styles.chipRow}>
                    {state.stables.map((stable) => {
                      const active = stable.id === quickStableId;
                      return (
                        <TouchableOpacity
                          key={stable.id}
                          style={[styles.chip, active && styles.chipActive]}
                          disabled={savingInvite || savingHorse || savingPaddock}
                            onPress={() => handleSelectQuickStable(stable.id)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {stable.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : state.stables.length === 0 ? (
                  <Text style={styles.sectionHint}>Skapa ditt första stall för att bjuda in medlemmar och lägga till hästar.</Text>
                ) : null}

                <View style={[styles.quickStack, isDesktopWeb && styles.quickStackDesktop]}>
                  {activeQuickAction === 'stable' ? <View style={styles.quickSection}>
                    <Text style={styles.quickTitle}>Skapa stall</Text>
                    {stableCreateError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{stableCreateError}</Text> : null}
                    {creatingStable ? <Text accessibilityLiveRegion="polite">Skapar stallet…</Text> : null}
                    <Text style={styles.fieldLabel}>Stallets namn</Text>
                    <TextInput
                      accessibilityLabel="Stallets namn"
                      placeholder="Stallnamn"
                      placeholderTextColor={palette.mutedText}
                      editable={!creatingStable}
                      value={quickStableDraft.name}
                      onChangeText={(text) =>
                        setQuickStableDraft((prev) => ({ ...prev, name: text }))
                      }
                      style={styles.input}
                    />
                    <Text style={styles.fieldLabel}>Plats (valfritt)</Text>
                    <TextInput
                      accessibilityLabel="Plats (valfritt)"
                      placeholder="Plats (valfritt)"
                      placeholderTextColor={palette.mutedText}
                      editable={!creatingStable}
                      value={quickStableDraft.location}
                      onChangeText={(text) =>
                        setQuickStableDraft((prev) => ({ ...prev, location: text }))
                      }
                      style={styles.input}
                    />
                    {state.farms.length > 0 ? (
                      <>
                        <Text style={styles.sectionHint}>Koppla till gård (valfritt)</Text>
                        <View style={styles.chipRow}>
                          {state.farms.map((farm) => {
                            const active = farm.id === quickStableDraft.farmId;
                            return (
                              <TouchableOpacity
                                key={farm.id}
                                style={[styles.chip, active && styles.chipActive]}
                                onPress={() =>
                                  setQuickStableDraft((prev) => ({
                                    ...prev,
                                    farmId: active ? '' : farm.id,
                                  }))
                                }
                                activeOpacity={0.85}
                              >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                  {farm.name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </>
                    ) : null}
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        styles.buttonFull,
                        !canQuickCreateStable && styles.primaryButtonDisabled,
                      ]}
                      onPress={handleQuickCreateStable}
                      activeOpacity={0.85}
                      disabled={!canQuickCreateStable}
                    >
                      <Text style={styles.primaryLabel}>Skapa stall</Text>
                    </TouchableOpacity>
                  </View> : null}

                  {activeQuickAction === 'invite' ? <View style={styles.quickSection}>
                    <Text style={styles.quickTitle}>Bjud in medlem</Text>
                    {!quickStableId ? (
                      <Text style={styles.sectionHint}>Välj ett stall först.</Text>
                    ) : null}
                    <View style={styles.chipRow}>
                      {quickRoleOptions.map((option) => {
                        const active = option.id === quickMemberRole;
                        return (
                          <TouchableOpacity
                            key={option.id}
                            style={[styles.chip, active && styles.chipActive]}
                            disabled={savingInvite}
                            onPress={() => setQuickMemberRole(option.id)}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <InviteReceipt confirmation={inviteReceipt} />
                    {inviteError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{inviteError}</Text>}
                    <Text style={styles.fieldLabel}>Medlemmens namn</Text>
                    <TextInput
                      accessibilityLabel="Medlemmens namn"
                      placeholder="Namn"
                      placeholderTextColor={palette.mutedText}
                      value={quickMemberDraft.name}
                      editable={!savingInvite}
                      onChangeText={(text) =>
                        setQuickMemberDraft((prev) => ({ ...prev, name: text }))
                      }
                      style={styles.input}
                    />
                    <Text style={styles.fieldLabel}>E-postadress</Text>
                    <TextInput
                      accessibilityLabel="E-postadress"
                      placeholder="E-post"
                      placeholderTextColor={palette.mutedText}
                      value={quickMemberDraft.email}
                      editable={!savingInvite}
                      onChangeText={(text) =>
                        setQuickMemberDraft((prev) => ({ ...prev, email: text }))
                      }
                      style={styles.input}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        styles.buttonFull,
                        !canQuickInvite && styles.primaryButtonDisabled,
                      ]}
                      onPress={handleQuickInviteMember}
                      activeOpacity={0.85}
                      disabled={!canQuickInvite}
                    >
                      <Text style={styles.primaryLabel}>{savingInvite ? 'Skapar inbjudan…' : 'Skapa inbjudan'}</Text>
                    </TouchableOpacity>
                  </View> : null}

                  {activeQuickAction === 'horse' ? <View style={styles.quickSection}>
                    <Text style={styles.quickTitle}>Lägg till häst</Text>
                    {!quickStableId ? (
                      <Text style={styles.sectionHint}>Välj ett stall först.</Text>
                    ) : null}
                    {horseSaveError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{horseSaveError}</Text>}
                    <Text style={styles.fieldLabel}>Hästens namn</Text>
                    <TextInput
                      accessibilityLabel="Hästens namn"
                      placeholder="Hästens namn"
                      placeholderTextColor={palette.mutedText}
                      value={quickHorseDraft.name}
                      editable={!savingHorse}
                      onChangeText={(text) => setQuickHorseDraft({ name: text })}
                      style={styles.input}
                    />
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        styles.buttonFull,
                        !canQuickAddHorse && styles.primaryButtonDisabled,
                      ]}
                      onPress={handleQuickAddHorse}
                      activeOpacity={0.85}
                      disabled={!canQuickAddHorse}
                    >
                      <Text style={styles.primaryLabel}>{savingHorse ? 'Sparar…' : 'Lägg till häst'}</Text>
                    </TouchableOpacity>
                  </View> : null}

                  {activeQuickAction === 'paddock' ? <View style={styles.quickSection}>
                    <Text style={styles.quickTitle}>Skapa hage</Text>
                    {paddockError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{paddockError}</Text> : null}
                    {savingPaddock ? <Text accessibilityLiveRegion="polite">Sparar hagen…</Text> : null}
                    {!state.paddockLinksReady ? (
                      <Text style={styles.sectionHint}>Hästkopplingarna är inte aktiverade ännu. Hagar kan inte skapas, ändras eller tas bort.</Text>
                    ) : null}
                    {!quickStableId ? (
                      <Text style={styles.sectionHint}>Välj ett stall först.</Text>
                    ) : null}
                    <Text style={styles.fieldLabel}>Hagens namn</Text>
                    <TextInput
                      accessibilityLabel="Hagens namn"
                      placeholder="Namn på hage"
                      placeholderTextColor={palette.mutedText}
                      editable={!savingPaddock && state.paddockLinksReady}
                      value={quickPaddockDraft.name}
                      onChangeText={(text) =>
                        setQuickPaddockDraft((prev) => ({ ...prev, name: text }))
                      }
                      style={styles.input}
                    />
                    <Text style={styles.sectionHint}>Välj hästar (valfritt)</Text>
                    <View style={styles.chipRow}>
                      {quickStableHorses.map((horse) => {
                        const active = quickPaddockDraft.horseIds.includes(horse.id);
                        const label = [horse.name, horse.boxNumber ? `Box ${horse.boxNumber}` : '',
                          horse.ownerUserId ? state.users[horse.ownerUserId]?.name : '',
                          quickStableHorses.some((other) => other.id !== horse.id && other.name === horse.name) ? horse.id : '',
                        ].filter(Boolean).join(' · ');
                        return (
                          <TouchableOpacity
                            key={horse.id}
                            style={[styles.chip, active && styles.chipActive]}
                            disabled={savingPaddock || !state.paddockLinksReady}
                            accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
                            {...(Platform.OS === 'web' ? { 'aria-pressed': active } : {})}
                            onPress={() => handleToggleQuickHorse(horse.id)}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      {quickStableId && quickStableHorses.length === 0 ? (
                        <Text style={styles.sectionHint}>Inga hästar i stallet ännu.</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        styles.buttonFull,
                        !canQuickAddPaddock && styles.primaryButtonDisabled,
                      ]}
                      onPress={handleQuickAddPaddock}
                      activeOpacity={0.85}
                      disabled={!canQuickAddPaddock}
                    >
                      <Text style={styles.primaryLabel}>Skapa hage</Text>
                    </TouchableOpacity>
                  </View> : null}
                </View>
              </Card>

              <StableInviteList confirmation={inviteReceipt} />

              <View style={styles.toolsHeading}><Text style={styles.sectionTitle}>Hantera stallet</Text><Text style={styles.sectionHint}>Medlemmar, planering och allt runt hästarna.</Text></View>
              <View style={[styles.cardGrid, isDesktopWeb && styles.cardGridDesktop]}>
                {adminLinks.map((link) => (
                  <TouchableOpacity
                    key={link.title}
                    style={[styles.linkCard, isDesktopWeb && styles.linkCardDesktop]}
                    onPress={() =>
                      router.push(
                        (link.params ? { pathname: link.route, params: link.params } : link.route) as Href,
                      )
                    }
                    activeOpacity={0.85}
                  >
                    <Feather
                      name={
                        link.route === '/stables' ? 'home' :
                        link.route === '/members' ? 'users' :
                        link.route === '/paddocks' ? 'map' :
                        link.route === '/calendar' && link.params?.section === 'arena' ? 'columns' :
                        link.route === '/calendar' ? 'calendar' : 'settings'
                      }
                      size={20}
                      color={palette.primaryText}
                    />
                    <Text style={styles.linkCardTitle}>{link.title}</Text>
                    <Text style={styles.linkCardDesc} numberOfLines={2}>{link.description}</Text>
                    <Text style={styles.linkCardCta}>{link.action} →</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 13, fontFamily: 'Inter-Medium', color: palette.primaryText },
  workspaceIntro: { gap: 8, paddingVertical: 12 },
  workspaceTitle: { fontSize: 28, lineHeight: 34, letterSpacing: -0.8, fontFamily: 'Inter-SemiBold', color: palette.primaryText },
  onboardingLink: { minHeight: 44, justifyContent: 'center' },
  quickActionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickActionTile: { flexBasis: '46%', flexGrow: 1, minWidth: 130, padding: 18, gap: 8, minHeight: 140, borderWidth: 1, borderColor: palette.border, borderRadius: radius.lg, backgroundColor: palette.surface },
  quickActionTileActive: { borderColor: palette.primaryText, backgroundColor: palette.surfaceMuted },
  quickActionTitle: { fontSize: 15, fontFamily: 'Inter-SemiBold', color: palette.primaryText },
  formHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  closeForm: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 'auto' },
  toolsHeading: { gap: 6, paddingTop: 12 },
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: palette.background },
  pageHeader: { marginBottom: 8 },
  pageHeaderDesktop: { paddingHorizontal: 0 },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  headerIcon: {
    fontSize: 18,
    color: palette.secondaryText,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
  contentDesktop: { paddingHorizontal: 0, paddingBottom: 40, maxWidth: 960 },
  card: { padding: 16, gap: 12, borderRadius: radius.lg },
  cardGrid: { gap: 16 },
  cardGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  linkCard: {
    padding: 16,
    gap: 8,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  linkCardDesktop: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 200,
  },
  linkCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.primaryText,
    marginTop: 4,
  },
  linkCardDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: palette.secondaryText,
  },
  linkCardCta: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primary,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  sectionHint: { fontSize: 13, color: palette.secondaryText, lineHeight: 18 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    minWidth: 90,
  },
  statValue: { fontSize: 18, fontWeight: '700', color: palette.primaryText },
  statLabel: { fontSize: 12, color: palette.secondaryText },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primaryButton: {
    minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  buttonFull: {
    alignSelf: 'stretch',
    maxWidth: 400,
  },
  primaryLabel: { color: palette.primaryText, fontWeight: '600' },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
  },
  secondaryLabel: { color: palette.primaryText, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: palette.primaryText,
    backgroundColor: palette.surface,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44, justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  chipActive: { backgroundColor: palette.surface, borderColor: palette.primary },
  chipText: { fontSize: 12, color: palette.primaryText },
  chipTextActive: { color: palette.primaryText, fontWeight: '600' },
  quickStack: { gap: 16 },
  quickStackDesktop: { maxWidth: 620 },
  quickSection: {
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: 10,
  },
  quickSectionDesktop: { maxWidth: 620 },
  quickTitle: { fontSize: 14, fontWeight: '600', color: palette.primaryText },
  desktopShell: { flex: 1, flexDirection: 'row' },
  desktopSidebar: { width: 280, paddingHorizontal: 24, paddingTop: 24 },
  desktopMain: { flex: 1, paddingRight: 24 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  centerTitle: { fontSize: 20, fontWeight: '700', color: palette.primaryText, textAlign: 'center' },
  centerSubtitle: { fontSize: 14, color: palette.secondaryText, textAlign: 'center' },
});
