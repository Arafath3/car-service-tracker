import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Vehicle, RootStackParamList, DetectionState, PendingTrip } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  getVehiclesForUser,
  getDetectionContext,
  getStateLog,
  StateLogEntry,
  clearStateLog,
  getAwaitingConfirmation,
} from '../utils/storage';
import {
  startPassiveDetection,
  stopPassiveDetection,
  isPassiveDetectionActive,
} from '../utils/passiveDetectionService';
import { Button } from '../components/Button';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PassiveDetection'>;

const STATE_COLORS: Record<DetectionState, string> = {
  idle: theme.colors.textMuted,
  monitoring: theme.colors.info,
  moving: theme.colors.warning,
  driving: theme.colors.success,
  stopped: theme.colors.warning,
  validating: theme.colors.warning,
  awaiting_confirmation: theme.colors.accent,
};

const STATE_LABELS: Record<DetectionState, string> = {
  idle: 'IDLE',
  monitoring: 'MONITORING',
  moving: 'MOVEMENT DETECTED',
  driving: 'DRIVING',
  stopped: 'STOPPED',
  validating: 'VALIDATING END',
  awaiting_confirmation: 'AWAITING CONFIRMATION',
};

const STATE_DESCRIPTIONS: Record<DetectionState, string> = {
  idle: 'Detection is off. Toggle on to begin monitoring.',
  monitoring: 'Waiting for movement. App will sleep until OS wakes it.',
  moving: 'Movement detected — evaluating if this is driving.',
  driving: 'Driving confirmed. Distance is being tracked.',
  stopped: 'Speed dropped — checking if trip has ended.',
  validating: '5-minute validation window — confirming end of trip.',
  awaiting_confirmation: 'Trip ready for review. Check your notifications.',
};

export const PassiveDetectionScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<DetectionState>('idle');
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [accumulatedKm, setAccumulatedKm] = useState(0);
  const [stateLog, setStateLog] = useState<StateLogEntry[]>([]);
  const [pending, setPending] = useState<PendingTrip[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    const v = await getVehiclesForUser(user.id);
    setVehicles(v);

    const ctx = await getDetectionContext();
    const active = await isPassiveDetectionActive();
    setEnabled(active);
    if (ctx) {
      setState(ctx.state);
      setSnapshotCount(ctx.totalSnapshotsTaken);
      setAccumulatedKm(ctx.accumulatedDistanceKm);
      if (ctx.selectedVehicleId) setSelectedVehicleId(ctx.selectedVehicleId);
    } else {
      setState('idle');
    }

    const log = await getStateLog();
    setStateLog(log.reverse()); // newest first

    const p = await getAwaitingConfirmation();
    setPending(p);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      // Poll every 3 seconds while screen is focused so user can see live updates
      const interval = setInterval(loadData, 3000);
      return () => clearInterval(interval);
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleToggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    if (next) {
      if (!selectedVehicleId) {
        Alert.alert('Select a vehicle', 'Please select which vehicle to track first.');
        setBusy(false);
        return;
      }
      const result = await startPassiveDetection(selectedVehicleId);
      if (!result.success) {
        Alert.alert('Could not start detection', result.error || 'Unknown error');
        setBusy(false);
        return;
      }
      setEnabled(true);
      Alert.alert(
        'Detection Active',
        'The app will monitor for driving in the background. You can close the app — a notification will appear when a trip is detected.'
      );
    } else {
      await stopPassiveDetection();
      setEnabled(false);
    }
    await loadData();
    setBusy(false);
  };

  const handleClearLog = async () => {
    await clearStateLog();
    await loadData();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Passive Detection</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        {/* Pending trips banner */}
        {pending.length > 0 && (
          <TouchableOpacity
            style={styles.pendingBanner}
            onPress={() =>
              navigation.navigate('ConfirmTrip', { pendingTripId: pending[0].id })
            }
            activeOpacity={0.85}
          >
            <View style={styles.pendingDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>
                {pending.length} trip{pending.length > 1 ? 's' : ''} awaiting confirmation
              </Text>
              <Text style={styles.pendingSubtitle}>
                Tap to review and confirm
              </Text>
            </View>
            <Text style={styles.pendingArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* State display */}
        <View style={styles.stateCard}>
          <Text style={styles.stateLabel}>CURRENT STATE</Text>
          <View style={styles.stateRow}>
            <View style={[styles.stateDot, { backgroundColor: STATE_COLORS[state] }]} />
            <Text style={[styles.stateValue, { color: STATE_COLORS[state] }]}>
              {STATE_LABELS[state]}
            </Text>
          </View>
          <Text style={styles.stateDescription}>{STATE_DESCRIPTIONS[state]}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>SNAPSHOTS</Text>
              <Text style={styles.statValue}>{snapshotCount}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>TRIP DISTANCE</Text>
              <Text style={styles.statValue}>{accumulatedKm.toFixed(2)}<Text style={styles.statUnit}> km</Text></Text>
            </View>
          </View>
        </View>

        {/* Vehicle selection */}
        <Text style={styles.sectionTitle}>VEHICLE TO TRACK</Text>
        {vehicles.length === 0 ? (
          <Text style={styles.emptyText}>
            Add a vehicle first from the home screen.
          </Text>
        ) : (
          <View>
            {vehicles.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[
                  styles.vehicleItem,
                  selectedVehicleId === v.id && styles.vehicleItemActive,
                ]}
                onPress={() => !enabled && setSelectedVehicleId(v.id)}
                activeOpacity={enabled ? 1 : 0.85}
                disabled={enabled}
              >
                <Text style={styles.vehicleEmoji}>{v.type === 'car' ? '🚗' : '🏍️'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleName}>
                    {v.nickname || `${v.make} ${v.model}`}
                  </Text>
                  <Text style={styles.vehicleSub}>
                    {v.year} · {v.currentOdometer.toLocaleString()} km
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    selectedVehicleId === v.id && styles.radioActive,
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Toggle */}
        <View style={styles.toggleCard}>
          <View style={{ flex: 1, marginRight: theme.spacing.md }}>
            <Text style={styles.toggleTitle}>Background Detection</Text>
            <Text style={styles.toggleSubtitle}>
              {enabled
                ? 'Active — close the app and drive somewhere to test'
                : 'Disabled — toggle on to start monitoring'}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            disabled={busy || vehicles.length === 0 || !selectedVehicleId}
            trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            thumbColor={enabled ? '#fff' : theme.colors.textMuted}
          />
        </View>

        {/* Debug toggle */}
        <TouchableOpacity
          style={styles.debugToggleRow}
          onPress={() => setShowDebug(!showDebug)}
        >
          <Text style={styles.debugToggleText}>
            {showDebug ? '▼' : '▶'} STATE MACHINE LOG
          </Text>
          <Text style={styles.debugCount}>{stateLog.length} events</Text>
        </TouchableOpacity>

        {showDebug && (
          <View style={styles.debugPanel}>
            <View style={styles.debugHeader}>
              <Text style={styles.debugHeaderText}>
                Most recent state transitions (newest first)
              </Text>
              {stateLog.length > 0 && (
                <TouchableOpacity onPress={handleClearLog}>
                  <Text style={styles.debugClear}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {stateLog.length === 0 ? (
              <Text style={styles.debugEmpty}>
                No events yet. Toggle detection on and move around to see the state machine in action.
              </Text>
            ) : (
              stateLog.slice(0, 20).map((entry, idx) => (
                <View key={idx} style={styles.logEntry}>
                  <View style={styles.logHeader}>
                    <Text style={styles.logTime}>{formatTime(entry.timestamp)}</Text>
                    <View
                      style={[
                        styles.logStateBadge,
                        { backgroundColor: STATE_COLORS[entry.state as DetectionState] || theme.colors.textMuted },
                      ]}
                    >
                      <Text style={styles.logStateText}>{entry.state.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.logReason}>{entry.reason}</Text>
                  {(entry.speed !== undefined || entry.distance !== undefined) && (
                    <View style={styles.logMetrics}>
                      {entry.speed !== undefined && (
                        <Text style={styles.logMetric}>
                          {entry.speed.toFixed(1)} km/h
                        </Text>
                      )}
                      {entry.distance !== undefined && (
                        <Text style={styles.logMetric}>
                          {entry.distance.toFixed(2)} km accumulated
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>HOW IT WORKS</Text>
          <Text style={styles.infoText}>
            <Text style={{ color: theme.colors.accent, fontWeight: theme.fontWeight.bold }}>1.</Text> The OS wakes the app every ~30 seconds OR when you've moved 50m{'\n'}
            <Text style={{ color: theme.colors.accent, fontWeight: theme.fontWeight.bold }}>2.</Text> A GPS snapshot is taken and added to a 10-snapshot rolling window{'\n'}
            <Text style={{ color: theme.colors.accent, fontWeight: theme.fontWeight.bold }}>3.</Text> The state machine evaluates speed, consistency, and stops{'\n'}
            <Text style={{ color: theme.colors.accent, fontWeight: theme.fontWeight.bold }}>4.</Text> If 2+ consecutive readings show 15+ km/h → DRIVING{'\n'}
            <Text style={{ color: theme.colors.accent, fontWeight: theme.fontWeight.bold }}>5.</Text> Distance accumulates only while in DRIVING state{'\n'}
            <Text style={{ color: theme.colors.accent, fontWeight: theme.fontWeight.bold }}>6.</Text> When stopped 5+ min → notification asks for confirmation{'\n'}
            <Text style={{ color: theme.colors.accent, fontWeight: theme.fontWeight.bold }}>7.</Text> Confirmed trips update your vehicle's odometer
          </Text>
        </View>

        {/* Battery note */}
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>⚠ NOTE</Text>
          <Text style={styles.warningText}>
            Background detection requires a custom dev build (npx expo prebuild). It does not work in Expo Go. The app must remain installed and not force-killed.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    width: 60,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  scroll: {
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  pendingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
    marginRight: theme.spacing.md,
  },
  pendingTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  pendingSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  pendingArrow: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
  },
  stateCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  stateLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  stateDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: theme.spacing.sm,
  },
  stateValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.black,
    letterSpacing: 1,
  },
  stateDescription: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.sm,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.bgInput,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1,
    marginBottom: 4,
  },
  statValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
  },
  statUnit: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.regular,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontStyle: 'italic',
    marginBottom: theme.spacing.lg,
  },
  vehicleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  vehicleItemActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  vehicleEmoji: { fontSize: 28, marginRight: theme.spacing.md },
  vehicleName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  vehicleSub: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  radioActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  toggleSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 4,
  },
  debugToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  debugToggleText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
  },
  debugCount: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  debugPanel: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  debugHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  debugHeaderText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  debugClear: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
  },
  debugEmpty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontStyle: 'italic',
    paddingVertical: theme.spacing.md,
  },
  logEntry: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  logTime: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: 'monospace' as any,
    marginRight: theme.spacing.sm,
  },
  logStateBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  logStateText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0.5,
  },
  logReason: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  logMetrics: {
    flexDirection: 'row',
    marginTop: 4,
    gap: theme.spacing.md,
  },
  logMetric: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  infoBox: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.info,
    marginBottom: theme.spacing.md,
  },
  infoTitle: {
    color: theme.colors.info,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1.5,
    marginBottom: theme.spacing.sm,
  },
  infoText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 22,
  },
  warningBox: {
    backgroundColor: theme.colors.warningSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning,
  },
  warningTitle: {
    color: theme.colors.warning,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1.5,
    marginBottom: theme.spacing.sm,
  },
  warningText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 19,
  },
});
