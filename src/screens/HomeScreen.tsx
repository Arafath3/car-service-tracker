import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { Vehicle } from '../types';
import {
  getVehiclesForUser,
  getServicesForVehicle,
  getAwaitingConfirmation,
} from '../utils/storage';
import { calculateServiceStatuses } from '../utils/serviceIntervals';
import { isPassiveDetectionActive } from '../utils/passiveDetectionService';
import { VehicleCard } from '../components/VehicleCard';
import { Button } from '../components/Button';
import { theme } from '../theme';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

interface VehicleWithDue {
  vehicle: Vehicle;
  servicesDue: number;
}

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { user, logout } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleWithDue[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [detectionActive, setDetectionActive] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const loadVehicles = useCallback(async () => {
    if (!user) return;
    const v = await getVehiclesForUser(user.id);
    const withDue: VehicleWithDue[] = await Promise.all(
      v.map(async (vehicle) => {
        const services = await getServicesForVehicle(vehicle.id);
        const statuses = calculateServiceStatuses(vehicle, services);
        const due = statuses.filter(
          (s) => s.status === 'overdue' || s.status === 'due-soon'
        ).length;
        return { vehicle, servicesDue: due };
      })
    );
    setVehicles(withDue);

    // Check passive detection
    const active = await isPassiveDetectionActive();
    setDetectionActive(active);
    const pending = await getAwaitingConfirmation();
    setPendingCount(pending.length);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadVehicles();
    setRefreshing(false);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {user?.isGuest ? 'Welcome, Guest' : `Welcome back`}
          </Text>
          <Text style={styles.username}>
            {user?.isGuest ? 'Your data stays on this device' : user?.username}
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>↗</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
          />
        }
      >
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryNumber}>{vehicles.length}</Text>
            <Text style={styles.summaryLabel}>Vehicles</Text>
          </View>
          <View style={[styles.summaryCard, { marginLeft: theme.spacing.sm }]}>
            <Text style={[styles.summaryNumber, { color: theme.colors.warning }]}>
              {vehicles.reduce((sum, v) => sum + v.servicesDue, 0)}
            </Text>
            <Text style={styles.summaryLabel}>Services Due</Text>
          </View>
        </View>

        {/* Passive detection card */}
        <TouchableOpacity
          style={[
            styles.passiveCard,
            detectionActive && styles.passiveCardActive,
          ]}
          onPress={() => navigation.navigate('PassiveDetection')}
          activeOpacity={0.85}
        >
          <View style={styles.passiveLeft}>
            <View
              style={[
                styles.passiveIcon,
                {
                  backgroundColor: detectionActive
                    ? theme.colors.successSoft
                    : theme.colors.bgInput,
                },
              ]}
            >
              <Text style={styles.passiveEmoji}>🛰️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.passiveTitle}>Auto-detect Trips</Text>
              <Text style={styles.passiveSubtitle}>
                {pendingCount > 0
                  ? `${pendingCount} trip${pendingCount > 1 ? 's' : ''} awaiting confirmation`
                  : detectionActive
                    ? 'Detection active in background'
                    : 'Tap to set up passive detection'}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.passiveStatus,
              {
                backgroundColor: detectionActive
                  ? theme.colors.success
                  : theme.colors.textMuted,
              },
            ]}
          />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>YOUR GARAGE</Text>

        {vehicles.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🚗</Text>
            <Text style={styles.emptyTitle}>No vehicles yet</Text>
            <Text style={styles.emptyText}>
              Add your first car or motorbike to start tracking services and mileage
            </Text>
          </View>
        ) : (
          vehicles.map(({ vehicle, servicesDue }) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              servicesDue={servicesDue}
              onPress={() =>
                navigation.navigate('VehicleDetail', { vehicleId: vehicle.id })
              }
            />
          ))
        )}

        <Button
          title="+  Add Vehicle"
          onPress={() => navigation.navigate('AddVehicle')}
          variant="secondary"
          fullWidth
          size="lg"
          style={{ marginTop: theme.spacing.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
  },
  username: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  scroll: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.xl,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryNumber: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.huge,
    fontWeight: theme.fontWeight.black,
    lineHeight: 48,
  },
  summaryLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
    marginBottom: theme.spacing.md,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxxl,
  },
  emptyEmoji: {
    fontSize: 60,
    marginBottom: theme.spacing.md,
    opacity: 0.5,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  passiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  passiveCardActive: {
    borderColor: theme.colors.success,
  },
  passiveLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passiveIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  passiveEmoji: { fontSize: 20 },
  passiveTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  passiveSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  passiveStatus: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: theme.spacing.sm,
  },
});
