import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { Vehicle, PendingTrip, Trip, RootStackParamList } from '../types';
import {
  getPendingTripById,
  getVehicles,
  removePendingTrip,
  addTrip,
  updateVehicle,
  saveDetectionContext,
  getDetectionContext,
} from '../utils/storage';
import { Button } from '../components/Button';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ConfirmTrip'>;

export const ConfirmTripScreen: React.FC<Props> = ({ route, navigation }) => {
  const { pendingTripId } = route.params;
  const [trip, setTrip] = useState<PendingTrip | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getPendingTripById(pendingTripId);
      if (!t) {
        Alert.alert('Not Found', 'This trip could not be found. It may have been already confirmed.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }
      setTrip(t);
      const all = await getVehicles();
      const v = all.find((x) => x.id === t.vehicleId);
      if (v) setVehicle(v);
      setLoading(false);
    })();
  }, [pendingTripId]);

  const resetDetectionContext = async () => {
    const ctx = await getDetectionContext();
    if (ctx) {
      await saveDetectionContext({
        ...ctx,
        state: ctx.enabled ? 'monitoring' : 'idle',
        currentTripStartTime: null,
        currentTripStartIndex: null,
        accumulatedDistanceKm: 0,
        stoppedSinceTimestamp: null,
        recentSnapshots: [],
        lastStateChangeAt: Date.now(),
      });
    }
  };

  const handleConfirm = async () => {
    if (!trip || !vehicle) return;
    setBusy(true);

    // Save trip
    const newTrip: Trip = {
      id: uuidv4(),
      vehicleId: trip.vehicleId,
      startTime: new Date(trip.startTime).toISOString(),
      endTime: new Date(trip.endTime).toISOString(),
      distanceKm: trip.distanceKm,
      startOdometer: vehicle.currentOdometer,
      endOdometer: vehicle.currentOdometer + trip.distanceKm,
      isActive: false,
      source: 'passive',
    };
    await addTrip(newTrip);

    // Update vehicle odometer
    await updateVehicle({
      ...vehicle,
      currentOdometer: vehicle.currentOdometer + trip.distanceKm,
    });

    // Remove pending trip
    await removePendingTrip(trip.id);

    // Reset detection context to monitoring
    await resetDetectionContext();

    setBusy(false);
    Alert.alert(
      'Trip Saved',
      `${trip.distanceKm.toFixed(2)} km added to ${vehicle.nickname || vehicle.make}. New odometer: ${(vehicle.currentOdometer + trip.distanceKm).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`,
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  };

  const handleReject = async () => {
    if (!trip) return;
    Alert.alert('Discard Trip', 'This trip will be permanently deleted. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          await removePendingTrip(trip.id);
          await resetDetectionContext();
          setBusy(false);
          navigation.goBack();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  if (!trip || !vehicle) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.textPrimary, padding: 20 }}>
          Trip not found.
        </Text>
      </SafeAreaView>
    );
  }

  const startDate = new Date(trip.startTime);
  const endDate = new Date(trip.endTime);
  const durationMin = Math.round((trip.endTime - trip.startTime) / 60000);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>🚗</Text>
          <Text style={styles.title}>Trip detected</Text>
          <Text style={styles.subtitle}>Was this a real drive?</Text>
        </View>

        <View style={styles.distanceCard}>
          <Text style={styles.distanceLabel}>ESTIMATED DISTANCE</Text>
          <Text style={styles.distanceValue}>{trip.distanceKm.toFixed(2)}</Text>
          <Text style={styles.distanceUnit}>kilometers</Text>
        </View>

        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Vehicle</Text>
            <Text style={styles.detailValue}>
              {vehicle.nickname || `${vehicle.make} ${vehicle.model}`}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Started</Text>
            <Text style={styles.detailValue}>
              {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Ended</Text>
            <Text style={styles.detailValue}>
              {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration</Text>
            <Text style={styles.detailValue}>{durationMin} min</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Average Speed</Text>
            <Text style={styles.detailValue}>{trip.averageSpeedKmh.toFixed(1)} km/h</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Max Speed</Text>
            <Text style={styles.detailValue}>{trip.maxSpeedKmh.toFixed(1)} km/h</Text>
          </View>
        </View>

        <View style={styles.odoCard}>
          <View style={styles.odoRow}>
            <Text style={styles.odoLabel}>Current odometer</Text>
            <Text style={styles.odoValue}>
              {vehicle.currentOdometer.toLocaleString()} km
            </Text>
          </View>
          <View style={styles.odoRow}>
            <Text style={styles.odoLabel}>If confirmed</Text>
            <Text style={[styles.odoValue, { color: theme.colors.accent }]}>
              {(vehicle.currentOdometer + trip.distanceKm).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{' '}
              km
            </Text>
          </View>
        </View>

        <Button
          title="✓  Yes, save this trip"
          onPress={handleConfirm}
          loading={busy}
          fullWidth
          size="lg"
          style={{ marginTop: theme.spacing.lg }}
        />

        <Button
          title="✗  No, discard"
          onPress={handleReject}
          variant="secondary"
          fullWidth
          size="lg"
          style={{ marginTop: theme.spacing.sm }}
        />

        <Text style={styles.footnote}>
          The estimate uses a 1.15× compensation factor for typical road curvature. You can manually adjust the odometer afterwards if needed.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl },
  header: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  headerEmoji: { fontSize: 48 },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    marginTop: theme.spacing.sm,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    marginTop: 4,
  },
  distanceCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.accent,
    marginVertical: theme.spacing.lg,
  },
  distanceLabel: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 3,
  },
  distanceValue: {
    color: theme.colors.textPrimary,
    fontSize: 64,
    fontWeight: theme.fontWeight.black,
    lineHeight: 72,
    marginTop: theme.spacing.xs,
  },
  distanceUnit: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
  detailCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  detailLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  detailValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
  },
  odoCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: theme.spacing.md,
  },
  odoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  odoLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  odoValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  footnote: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
