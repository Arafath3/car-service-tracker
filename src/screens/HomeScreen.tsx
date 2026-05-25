import React, { useState, useCallback } from 'react';
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
import { useVehicles } from '../utils/useVehicles'; // Our reactive data layer hook
import {
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

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { user, logout } = useAuth();
  
  // Connect to our global, reactive stream of vehicles
  const { vehicles, loading: loadingVehicles, refreshVehicles } = useVehicles();
  
  // Localized state for secondary calculations and telemetry background context
  const [servicesDueMap, setServicesDueMap] = useState<Record<string, number>>({});
  const [detectionActive, setDetectionActive] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Calculate maintenance due states reactively when the vehicle list streams modifications
  React.useEffect(() => {
    let isMounted = true;
    
    const evaluateAllServiceIntervals = async () => {
      const updatedMap: Record<string, number> = {};
      
      await Promise.all(
        vehicles.map(async (v) => {
          try {
            const services = await getServicesForVehicle(v.id);
            const statuses = calculateServiceStatuses(v, services);
            const dueCount = statuses.filter(
              (s) => s.status === 'overdue' || s.status === 'due-soon'
            ).length;
            updatedMap[v.id] = dueCount;
          } catch (err) {
            console.error(`Failed to process service intervals for vehicle ${v.id}:`, err);
            updatedMap[v.id] = 0;
          }
        })
      );

      if (isMounted) {
        setServicesDueMap(updatedMap);
      }
    };

    if (vehicles.length > 0) {
      evaluateAllServiceIntervals();
    } else {
      setServicesDueMap({});
    }

    return () => { isMounted = false; };
  }, [vehicles]);

  // Sync background sensor activity updates cleanly when screen shifts into view
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const checkTelemetryStatus = async () => {
        try {
          const active = await isPassiveDetectionActive();
          const pending = await getAwaitingConfirmation();
          
          if (isMounted) {
            setDetectionActive(active);
            setPendingCount(pending.length);
          }
        } catch (err) {
          console.error('Error synchronizing background telemetry monitoring status:', err);
        }
      };

      checkTelemetryStatus();
      return () => { isMounted = false; };
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    // Explicitly triggers a cache-bust refresh down our hook's stream pipeline
    await refreshVehicles(); 
    
    // Re-check background engine status
    const active = await isPassiveDetectionActive();
    const pending = await getAwaitingConfirmation();
    setDetectionActive(active);
    setPendingCount(pending.length);
    
    setRefreshing(false);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  // Compute total aggregate items safely from our local mapping state
  const totalServicesDue = vehicles.reduce((sum, v) => sum + (servicesDueMap[v.id] || 0), 0);

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
            refreshing={refreshing || (loadingVehicles && vehicles.length === 0)}
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
              {totalServicesDue}
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

        {vehicles.length === 0 && !loadingVehicles ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🚗</Text>
            <Text style={styles.emptyTitle}>No vehicles yet</Text>
            <Text style={styles.emptyText}>
              Add your first car or motorbike to start tracking services and mileage
            </Text>
          </View>
        ) : (
          vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              servicesDue={servicesDueMap[vehicle.id] || 0}
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