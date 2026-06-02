import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
} from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import type { Vehicle, DetectionState, PendingTrip } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { BluetoothPickerModal } from "@/components/BluetoothPickerModal";
import type { PairedDevice } from "@/../modules/bluetooth-detection/src/BluetoothDetection.types";
import BluetoothDetection from "@/../modules/bluetooth-detection/src/BluetoothDetectionModule";

import {
  getVehicles,
  getDetectionContext,
  updateVehicle,
  getStateLog,
  StateLogEntry,
  clearStateLog,
  getAwaitingConfirmation,
  getDetectionConfig,
  saveDetectionConfig,
  getAutoDetectionEnabled,
  setAutoDetectionEnabled,
  DEFAULT_DETECTION_CONFIG,
  DEMO_DETECTION_CONFIG,
} from "@/lib/storage";
import {
  stopPassiveDetection,
  isPassiveDetectionActive,
  reconcileColdTrip,
} from "@/lib/passiveDetectionService";
import { theme } from "@/theme";
import { safeAwait } from "@/lib/asyncWrapper";
import { ThemedAlert, AlertButton } from "@/components/ThemedAlert";

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
  idle: "IDLE",
  monitoring: "MONITORING",
  moving: "MOVEMENT DETECTED",
  driving: "DRIVING",
  stopped: "STOPPED",
  validating: "VALIDATING END",
  awaiting_confirmation: "AWAITING CONFIRMATION",
};

const STATE_DESCRIPTIONS: Record<DetectionState, string> = {
  idle: "Detection is off. Toggle on to begin monitoring.",
  monitoring: "Waiting for movement. App will sleep until OS wakes it.",
  moving: "Movement detected — evaluating if this is driving.",
  driving: "Driving confirmed. Distance is being tracked.",
  stopped: "Speed dropped — checking if trip has ended.",
  validating: "Validation window — confirming end of trip.",
  awaiting_confirmation: "Trip ready for review. Check notifications.",
};

export default function PassiveDetectionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  const [state, setState] = useState<DetectionState>("idle");
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [accumulatedKm, setAccumulatedKm] = useState(0);
  const [stateLog, setStateLog] = useState<StateLogEntry[]>([]);
  const [pending, setPending] = useState<PendingTrip[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [linkingVehicleId, setLinkingVehicleId] = useState<string | null>(null);

  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message?: string;
    buttons?: AlertButton[];
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    reconcileColdTrip().catch((e) =>
      console.log("[ColdTrip] reconcile failed:", e),
    );

    const [
      [vError, v],
      [ctxError, ctx],
      [activeError, active],
      [cfgError, cfg],
      [logError, log],
      [pError, p],
    ] = await Promise.all([
      safeAwait(getVehicles()),
      safeAwait(getDetectionContext()),
      safeAwait(isPassiveDetectionActive()),
      safeAwait(getDetectionConfig()),
      safeAwait(getStateLog()),
      safeAwait(getAwaitingConfirmation()),
    ]);

    if (!vError && v) setVehicles(v);

    if (!ctxError) {
      if (ctx) {
        setState(ctx.state);
        setSnapshotCount(ctx.totalSnapshotsTaken);
        setAccumulatedKm(ctx.accumulatedDistanceKm);
      } else {
        setState("idle");
      }
    }

    if (!activeError) {
      setActiveVehicleId(
        active && ctx?.selectedVehicleId ? ctx.selectedVehicleId : null,
      );
    }

    setAutoEnabled(await getAutoDetectionEnabled());

    if (!cfgError && cfg) setDemoMode(cfg.drivingMinKmh < 10);

    if (!logError && log) setStateLog(log.reverse());

    if (!pError && p) setPending(p);
  }, [user?.id]);

  const refreshTelemetry = useCallback(async () => {
    const [
      [ctxError, ctx],
      [activeError, active],
      [logError, log],
      [pError, p],
    ] = await Promise.all([
      safeAwait(getDetectionContext()),
      safeAwait(isPassiveDetectionActive()),
      safeAwait(getStateLog()),
      safeAwait(getAwaitingConfirmation()),
    ]);
    if (!ctxError && ctx) {
      setState(ctx.state);
      setSnapshotCount(ctx.totalSnapshotsTaken);
      setAccumulatedKm(ctx.accumulatedDistanceKm);
    }
    if (!activeError) {
      setActiveVehicleId(
        active && ctx?.selectedVehicleId ? ctx.selectedVehicleId : null,
      );
    }
    if (!logError && log) setStateLog(log.reverse());
    if (!pError && p) setPending(p);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
      const interval = setInterval(refreshTelemetry, 3000);
      return () => clearInterval(interval);
    }, [loadData, refreshTelemetry]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAutoToggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);

    if (next) {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== "granted") {
        setAlertConfig({
          title: "Location needed",
          message:
            "Automatic detection needs location permission to track trips.",
        });
        setBusy(false);
        return;
      }
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== "granted") {
        setAlertConfig({
          title: "Background location needed",
          message:
            'Please allow location "All the time" so trips can be detected while the app is in the background.',
        });
        setBusy(false);
        return;
      }
      await Notifications.requestPermissionsAsync();
      await setAutoDetectionEnabled(true);
      BluetoothDetection.startKeepAlive();
      setAutoEnabled(true);
      setAlertConfig({
        title: "Automatic detection on",
        message:
          "Trips will start automatically when you connect to a linked vehicle's Bluetooth.",
      });
    } else {
      await setAutoDetectionEnabled(false);
      setAutoEnabled(false);
      await stopPassiveDetection();
      BluetoothDetection.stopKeepAlive();
      setActiveVehicleId(null);
    }

    await refreshTelemetry();
    setBusy(false);
  };

  const handlePickDevice = async (device: PairedDevice) => {
    setShowPicker(false);
    const vehicle = vehicles.find((v) => v.id === linkingVehicleId);

    if (vehicle) {
      const [err] = await safeAwait(
        updateVehicle({
          ...vehicle,
          bluetoothAddress: device.address,
          bluetoothName: device.name,
        }),
      );

      if (err) {
        setAlertConfig({
          title: "Couldn't link device",
          message: "Failed to save the Bluetooth link. Please try again.",
        });
        setLinkingVehicleId(null);
        return;
      }

      // Register for cold-start detection (Android 13+). The link itself is
      // already saved above, so even if this fails the warm path still works.
      try {
        await BluetoothDetection.associateVehicle(device.address);
        await BluetoothDetection.observeVehicle(device.address);
      } catch (e) {
        console.error("[CDM] association failed (warm path still works):", e);
      }

      await loadData();
    }

    setLinkingVehicleId(null);
  };
  const handleUnlink = async (vehicle: Vehicle) => {
    if (vehicle.bluetoothAddress) {
      try {
        await BluetoothDetection.disassociateVehicle(vehicle.bluetoothAddress);
      } catch (e) {
        console.log("[CDM] disassociate failed:", e);
      }
    }
    await updateVehicle({
      ...vehicle,
      bluetoothAddress: undefined,
      bluetoothName: undefined,
    });
    await loadData();
  };

  const handleSkipBluetooth = () => {
    setShowPicker(false);
    setLinkingVehicleId(null);
  };

  const handleCancelPicker = () => {
    setShowPicker(false);
    setLinkingVehicleId(null);
  };

  const handleDemoMode = async (on: boolean) => {
    if (on) {
      setAlertConfig({
        title: "Enable Demo Mode?",
        message:
          "This lowers all thresholds so walking will be detected as driving. Perfect for screen recordings. Switch back to Normal Mode when done.",
        buttons: [
          { text: "Cancel", style: "cancel" },
          {
            text: "Enable",
            style: "default",
            onPress: async () => {
              await saveDetectionConfig(DEMO_DETECTION_CONFIG);
              setDemoMode(true);
            },
          },
        ],
      });
    } else {
      await saveDetectionConfig(DEFAULT_DETECTION_CONFIG);
      setDemoMode(false);
      setAlertConfig({
        title: "Normal Mode",
        message: "Thresholds reset for real driving detection.",
      });
    }
  };

  const handleClearLog = async () => {
    await clearStateLog();
    await loadData();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  };

  const linkingVehicle =
    vehicles.find((v) => v.id === linkingVehicleId) ?? null;
  const linkingVehicleName =
    linkingVehicle?.nickname ||
    (linkingVehicle
      ? `${linkingVehicle.make} ${linkingVehicle.model}`
      : "vehicle");
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Passive Detection</Text>
        <View style={{ width: 60 }} />
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
        {pending.length > 0 && (
          <TouchableOpacity
            style={styles.pendingBanner}
            onPress={() =>
              router.push({
                pathname: "/(app)/detection/confirm",
                params: { id: pending[0].id },
              })
            }
            activeOpacity={0.85}
          >
            <View style={styles.pendingDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>
                {pending.length} trip{pending.length > 1 ? "s" : ""} awaiting
                confirmation
              </Text>
              <Text style={styles.pendingSubtitle}>Tap to review</Text>
            </View>
            <Text style={styles.pendingArrow}>→</Text>
          </TouchableOpacity>
        )}

        <View style={styles.stateCard}>
          <Text style={styles.stateLabel}>CURRENT STATE</Text>
          <View style={styles.stateRow}>
            <View
              style={[
                styles.stateDot,
                { backgroundColor: STATE_COLORS[state] },
              ]}
            />
            <Text style={[styles.stateValue, { color: STATE_COLORS[state] }]}>
              {STATE_LABELS[state]}
            </Text>
          </View>
          <Text style={styles.stateDescription}>
            {STATE_DESCRIPTIONS[state]}
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statSubLabel}>SNAPSHOTS</Text>
              <Text style={styles.statSubValue}>{snapshotCount}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statSubLabel}>TRIP DISTANCE</Text>
              <Text style={styles.statSubValue}>
                {accumulatedKm.toFixed(2)}
                <Text style={styles.statSubUnit}> km</Text>
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>YOUR VEHICLES</Text>
        {vehicles.length === 0 ? (
          <Text style={styles.emptyText}>
            Add a vehicle first from the home screen.
          </Text>
        ) : (
          vehicles.map((v) => {
            const tracking = v.id === activeVehicleId;
            return (
              <TouchableOpacity
                key={v.id}
                style={styles.vehicleItem}
                onPress={() => {
                  setLinkingVehicleId(v.id);
                  setShowPicker(true);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.vehicleEmoji}>
                  {v.type === "car" ? "🚗" : "🏍️"}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleName}>
                    {v.nickname || `${v.make} ${v.model}`}
                  </Text>
                  <Text style={styles.vehicleSub}>
                    {v.bluetoothName
                      ? `🔗 ${v.bluetoothName}`
                      : "Not linked — tap to link Bluetooth"}
                  </Text>
                </View>
                {tracking && (
                  <View style={styles.trackingBadge}>
                    <Text style={styles.trackingText}>● TRACKING</Text>
                  </View>
                )}
                <Text style={styles.linkChevron}>›</Text>
              </TouchableOpacity>
            );
          })
        )}

        <View style={styles.toggleCard}>
          <View style={{ flex: 1, marginRight: theme.spacing.md }}>
            <Text style={styles.toggleTitle}>Automatic Detection</Text>
            <Text style={styles.toggleSubtitle}>
              {autoEnabled
                ? "On — trips start automatically when you connect to a linked vehicle."
                : "Turn on to detect trips automatically via Bluetooth."}
            </Text>
          </View>
          <Switch
            value={autoEnabled}
            onValueChange={handleAutoToggle}
            disabled={busy}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.accent,
            }}
            thumbColor={autoEnabled ? "#fff" : theme.colors.textMuted}
          />
        </View>
        {/* Demo mode toggle */}
        <TouchableOpacity
          style={styles.demoToggleRow}
          onPress={() => setShowDemo(!showDemo)}
        >
          <Text style={styles.demoToggleText}>
            {showDemo ? "▼" : "▶"} DEMO MODE {demoMode ? "· ACTIVE" : ""}
          </Text>
        </TouchableOpacity>

        {showDemo && (
          <View
            style={[
              styles.demoCard,
              demoMode && { borderColor: theme.colors.purple },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.demoTitle}>
                {demoMode ? "🎬 Demo Mode Active" : "Enable Demo Mode"}
              </Text>
              <Text style={styles.demoSubtitle}>
                Lowers speed thresholds so walking triggers detection. Use for
                screen recordings.
              </Text>
              <Text style={styles.demoSpecs}>
                Driving threshold: {demoMode ? "3" : "15"} km/h{"\n"}
                Validation: {demoMode ? "30 sec" : "5 min"}
              </Text>
            </View>
            <Switch
              value={demoMode}
              onValueChange={handleDemoMode}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.purple,
              }}
              thumbColor={demoMode ? "#fff" : theme.colors.textMuted}
            />
          </View>
        )}

        {/* Debug log toggle */}
        <TouchableOpacity
          style={styles.debugToggleRow}
          onPress={() => setShowDebug(!showDebug)}
        >
          <Text style={styles.debugToggleText}>
            {showDebug ? "▼" : "▶"} STATE MACHINE LOG
          </Text>
          <Text style={styles.debugCount}>{stateLog.length} events</Text>
        </TouchableOpacity>

        {showDebug && (
          <View style={styles.debugPanel}>
            <View style={styles.debugHeader}>
              <Text style={styles.debugHeaderText}>
                Most recent transitions (newest first)
              </Text>
              {stateLog.length > 0 && (
                <TouchableOpacity onPress={handleClearLog}>
                  <Text style={styles.debugClear}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {stateLog.length === 0 ? (
              <Text style={styles.debugEmpty}>
                No events yet. Toggle detection on and move to see the state
                machine.
              </Text>
            ) : (
              stateLog.slice(0, 30).map((entry, idx) => (
                <View key={idx} style={styles.logEntry}>
                  <View style={styles.logHeader}>
                    <Text style={styles.logTime}>
                      {formatTime(entry.timestamp)}
                    </Text>
                    <View
                      style={[
                        styles.logStateBadge,
                        {
                          backgroundColor:
                            STATE_COLORS[entry.state as DetectionState] ||
                            theme.colors.textMuted,
                        },
                      ]}
                    >
                      <Text style={styles.logStateText}>
                        {entry.state.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.logReason}>{entry.reason}</Text>
                  {(entry.speed !== undefined ||
                    entry.distance !== undefined) && (
                    <View style={styles.logMetrics}>
                      {entry.speed !== undefined && (
                        <Text style={styles.logMetric}>
                          {entry.speed.toFixed(1)} km/h
                        </Text>
                      )}
                      {entry.distance !== undefined && (
                        <Text style={styles.logMetric}>
                          {entry.distance.toFixed(2)} km
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
      <BluetoothPickerModal
        visible={showPicker}
        vehicleName={linkingVehicleName}
        onSelect={handlePickDevice}
        onSkip={handleSkipBluetooth}
        onCancel={handleCancelPicker}
      />
      <ThemedAlert
        visible={!!alertConfig}
        title={alertConfig?.title ?? ""}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={() => setAlertConfig(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  linkChevron: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xl,
    marginLeft: theme.spacing.sm,
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
  scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.bgInput,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  statSubLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1,
    marginBottom: 4,
  },
  statSubValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
  },
  statSubUnit: {
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
    fontStyle: "italic",
    marginBottom: theme.spacing.lg,
  },
  vehicleItem: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
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
  demoToggleRow: {
    paddingVertical: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  demoToggleText: {
    color: theme.colors.purple,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
  },
  demoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.purpleSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  demoTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  demoSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 4,
    lineHeight: 18,
  },
  demoSpecs: {
    color: theme.colors.purple,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing.sm,
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 16,
  },
  debugToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.lg,
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
  },
  debugHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    fontStyle: "italic",
    paddingVertical: theme.spacing.md,
  },
  logEntry: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  logTime: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginRight: theme.spacing.sm,
  },
  logStateBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  logStateText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0.5,
  },
  logReason: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  logMetrics: {
    flexDirection: "row",
    marginTop: 4,
    gap: theme.spacing.md,
  },
  logMetric: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  trackingBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: theme.spacing.sm,
  },
  trackingText: {
    color: theme.colors.success,
    fontSize: 10,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0.5,
  },
});
