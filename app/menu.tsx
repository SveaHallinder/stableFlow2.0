import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { AppIcon } from '@/components/AppIcon';
import { Avatar } from '@/components/Avatar';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DesktopNav } from '@/components/DesktopNav';
import { theme } from '@/components/theme';
import { useAppData } from '@/context/AppDataContext';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

const palette = theme.colors;
type MenuItem = { title: string; description: string; route: Href; icon: keyof typeof Ionicons.glyphMap; horse?: boolean };

const stableItems: MenuItem[] = [
  { title: 'Hästar', description: 'Alla hästar, foder, ridning och vård', route: '/stable-horses', icon: 'list-outline', horse: true },
  { title: 'Medlemmar', description: 'Hitta personer, kontaktuppgifter och privat chatt', route: '/members', icon: 'people-outline' },
  { title: 'Schema', description: 'Stallpass, ridning, ridhus och händelser', route: '/calendar', icon: 'calendar-outline' },
  { title: 'Chatt', description: 'Stallchatt, egna grupper och privata samtal', route: '/messages', icon: 'chatbubbles-outline' },
  { title: 'Flöde', description: 'Stallets uppdateringar och inlägg', route: '/feed', icon: 'newspaper-outline' },
  { title: 'Hagar', description: 'Se vilka hästar som går tillsammans', route: '/paddocks', icon: 'map-outline' },
  { title: 'Kontakter', description: 'Veterinär, hovslagare och andra kontakter', route: '/contacts', icon: 'call-outline' },
];
const accountItems: MenuItem[] = [
  { title: 'Mina fasta pass', description: 'Dina återkommande veckodagar', route: '/season-schedule', icon: 'repeat-outline' },
  { title: 'Kontoinställningar', description: 'Redigera profil, lösenord och logga ut', route: '/settings/account', icon: 'settings-outline' },
  { title: 'Notiser', description: 'Push och påminnelser', route: '/settings/notifications', icon: 'notifications-outline' },
  { title: 'Gå med i ett annat stall', description: 'Använd en inbjudan eller stallkod', route: '/(onboarding)/join', icon: 'enter-outline' },
];

export default function MenuScreen() {
  const router = useRouter();
  const { state, derived } = useAppData();
  const isDesktopWeb = useIsDesktopWeb();
  const user = state.users[state.currentUserId];
  const stable = state.stables.find(item => item.id === state.currentStableId);
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/');
  const renderItem = (item: MenuItem) => (
    <TouchableOpacity key={item.title} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => router.push(item.route)} style={styles.row} activeOpacity={0.8}>
      <View style={styles.icon}>{item.horse ? <AppIcon name="horse" size={23} /> : <Ionicons name={item.icon} size={22} color={palette.primaryText} />}</View>
      <View style={styles.rowText}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.description}>{item.description}</Text></View>
      <Ionicons name="chevron-forward" size={17} color={palette.secondaryText} />
    </TouchableOpacity>
  );
  const content = (
    <SafeAreaView style={styles.page}>
      <ScreenHeader title="Meny" left={<HeaderIconButton accessibilityLabel="Tillbaka" onPress={goBack}><Ionicons name="arrow-back" size={21} color={palette.primaryText} /></HeaderIconButton>} />
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Min profil" onPress={() => router.push('/profile')} style={styles.profile} activeOpacity={0.8}>
          <Avatar source={user?.avatar} style={styles.avatar} />
          <View style={styles.rowText}><Text style={styles.rowTitle}>Min profil</Text><Text style={styles.description}>{user?.name || 'Ditt konto'}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={palette.secondaryText} />
        </TouchableOpacity>
        <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>{stable?.name || 'Stallet'}</Text><Card style={styles.list}>{stableItems.map(renderItem)}</Card></View>
        {derived.permissions.canManageOnboarding ? <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>För dig som stallägare</Text><Card style={styles.list}>{renderItem({ title: 'Mitt stall', description: 'Bjud in, hantera medlemmar och ställ in stallet', route: '/admin', icon: 'business-outline' })}</Card></View> : null}
        <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>Ditt konto</Text><Card style={styles.list}>{accountItems.map(renderItem)}</Card></View>
      </ScrollView>
    </SafeAreaView>
  );
  if (!isDesktopWeb) return content;
  return <View style={styles.desktop}><View style={styles.sidebar}><DesktopNav variant="sidebar" /></View><View style={styles.main}>{content}</View></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, paddingBottom: 48, gap: 28, width: '100%', maxWidth: 800, alignSelf: 'center' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 82, padding: 18, borderWidth: 1, borderColor: palette.border, borderRadius: 20 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  section: { gap: 12 },
  sectionTitle: { fontFamily: theme.fonts.semibold, fontSize: 17, lineHeight: 25, color: palette.primaryText },
  list: { paddingHorizontal: 16, paddingVertical: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  icon: { width: 30, alignItems: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontFamily: theme.fonts.semibold, fontSize: 15, lineHeight: 21, color: palette.primaryText },
  description: { fontFamily: theme.fonts.regular, fontSize: 12, lineHeight: 18, color: palette.secondaryText },
  desktop: { flex: 1, flexDirection: 'row', backgroundColor: palette.background },
  sidebar: { width: 238, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, borderRightWidth: 1, borderRightColor: palette.border },
  main: { flex: 1, minWidth: 0 },
});
