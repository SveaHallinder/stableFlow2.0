import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Search, Plus } from 'lucide-react-native';
import { theme } from '@/components/theme';

export default function DashboardScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Image 
          source={{ uri: 'https://your-logo-url.com/logo.png' }} 
          style={styles.logo} 
        />
        <Text style={styles.title}>Todays overview</Text>
        <TouchableOpacity>
          <Search size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Alert */}
      <View style={styles.alert}>
        <Text style={styles.alertLabel}>OBS!</Text>
        <Text style={styles.alertText}>No parking by the container today.</Text>
      </View>

      {/* Weather and Schedule */}
      <View style={styles.row}>
        <View style={styles.weatherCard}>
          <Text style={styles.location}>Stockholm</Text>
          <Text style={styles.temperature}>10°</Text>
          <Text style={styles.weather}>Cloudy</Text>
          <Text style={styles.tempRange}>H:12° L:6°</Text>
        </View>

        <View style={styles.scheduleCard}>
          <Text style={styles.scheduleDay}>SATURDAY</Text>
          <Text style={styles.scheduleDate}>MAR 8</Text>
          <View style={styles.scheduleItem}>
            <Text>⚠️ Feeding ev...</Text>
          </View>
          <View style={styles.scheduleItem}>
            <Text>🧹 Cleaning day</Text>
          </View>
        </View>
      </View>

      {/* Horse Status */}
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusTitle}>Horse Status</Text>
          <TouchableOpacity>
            <Text>...</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.statusItem}>Majid - Lost shoe</Text>
        <Text style={styles.statusItem}>Cinder - Injured</Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusTitle}>Quick Actions</Text>
          <TouchableOpacity>
            <Text>...</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton}>
            <Plus size={20} color={theme.colors.primary} />
            <Text style={styles.actionButtonText}>Activity</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Plus size={20} color={theme.colors.primary} />
            <Text style={styles.actionButtonText}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  logo: {
    width: 40,
    height: 40,
  },
  title: {
    ...theme.typography.h2,
  },
  alert: {
    backgroundColor: '#FEE2E2',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
    flexDirection: 'row',
  },
  alertLabel: {
    color: '#DC2626',
    fontWeight: '700',
    marginRight: theme.spacing.sm,
  },
  alertText: {
    color: '#DC2626',
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  weatherCard: {
    flex: 1,
    backgroundColor: '#93C5FD',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  location: {
    color: theme.colors.background,
    fontWeight: '500',
  },
  temperature: {
    ...theme.typography.h1,
    color: theme.colors.background,
  },
  weather: {
    color: theme.colors.background,
  },
  tempRange: {
    color: theme.colors.background,
    fontSize: 12,
  },
  scheduleCard: {
    flex: 2,
    backgroundColor: '#F3F4F6',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  scheduleDay: {
    color: '#059669',
    fontWeight: '500',
  },
  scheduleDate: {
    ...theme.typography.h2,
    marginBottom: theme.spacing.sm,
  },
  scheduleItem: {
    marginBottom: theme.spacing.xs,
  },
  statusCard: {
    backgroundColor: '#F3F4F6',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  statusTitle: {
    ...theme.typography.h2,
  },
  statusItem: {
    marginBottom: theme.spacing.xs,
  },
  actionsCard: {
    backgroundColor: '#D1FAE5',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  actionButton: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  actionButtonText: {
    color: theme.colors.primary,
    fontWeight: '500',
  },
});