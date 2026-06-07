// ============================================================================
// PASSIVE DETECTION BACKGROUND SERVICE
// ============================================================================
import BluetoothDetection from "@/../modules/bluetooth-detection/src/BluetoothDetectionModule";
import { AppState } from "react-native";
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import type {
  DetectionContext,
  LocationSnapshot,
  PendingTrip,
  DetectionConfig,
} from "@/types";
import {
  getDetectionContext,
  saveDetectionContext,
  addPendingTrip,
  appendStateLog,
  getDetectionConfig,
  getVehicles,
  getPendingTrips,
} from "./storage";
import {
  haversineKm,
  calculateSpeedKmh,
  isSnapshotValid,
  processSnapshot,
  FIXED_THRESHOLDS,
} from "./detectionEngine";

export const LOCATION_TASK_NAME = "PASSIVE_DETECTION_LOCATION_V1";

// ============================================================================
// THE BACKGROUND TASK - registered at module load
// ============================================================================
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("[BG Task]", error);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  for (const loc of locations) {
    await handleNewLocation(loc);
  }
});

// ============================================================================
// LOCATION HANDLER
// ============================================================================
export const handleNewLocation = async (
  loc: Location.LocationObject,
): Promise<void> => {
  try {
    const ctx = await getDetectionContext();
    if (!ctx || !ctx.enabled || ctx.state === "idle") return;

    const config = await getDetectionConfig();
    const now = Date.now();

    const snapshot: LocationSnapshot = {
      id: uuidv4(),
      timestamp: now,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
      speed: loc.coords.speed ?? undefined,
    };

    if (ctx.recentSnapshots.length > 0) {
      const prev = ctx.recentSnapshots[ctx.recentSnapshots.length - 1];
      snapshot.computedSpeedKmh = calculateSpeedKmh(prev, snapshot);
    } else {
      snapshot.computedSpeedKmh = (loc.coords.speed ?? 0) * 3.6;
    }

    if (!isSnapshotValid(snapshot)) {
      await appendStateLog({
        timestamp: now,
        state: ctx.state,
        reason: `Snapshot rejected (accuracy ${snapshot.accuracy?.toFixed(0)}m)`,
      });
      return;
    }

    const result = processSnapshot(ctx, snapshot, now, config);
    const updatedSnapshots = [...ctx.recentSnapshots, snapshot].slice(
      -config.rollingWindowSize,
    );

    let newCtx: DetectionContext = {
      ...ctx,
      state: result.newState,
      recentSnapshots: updatedSnapshots,
      lastStateChangeAt:
        result.newState !== ctx.state ? now : ctx.lastStateChangeAt,
      totalSnapshotsTaken: ctx.totalSnapshotsTaken + 1,
    };

    newCtx = applyStateTransitionEffects(newCtx, ctx, snapshot, now);

    await appendStateLog({
      timestamp: now,
      state: result.newState,
      reason: result.reason,
      speed: snapshot.computedSpeedKmh,
      distance: newCtx.accumulatedDistanceKm,
    });

    await saveDetectionContext(newCtx);

    if (result.shouldFinalizeTrip) {
      await finalizeTripAndNotify(newCtx, ctx, config);
    }
  } catch (e) {
    console.error("[BG] handleNewLocation failed:", e);
  }
};

// ============================================================================
// STATE TRANSITION SIDE EFFECTS
// ============================================================================
const applyStateTransitionEffects = (
  newCtx: DetectionContext,
  oldCtx: DetectionContext,
  snapshot: LocationSnapshot,
  now: number,
): DetectionContext => {
  const result = { ...newCtx };

  if (newCtx.state === "driving" && oldCtx.state !== "driving") {
    if (!result.currentTripStartTime) {
      const startSnap = result.recentSnapshots[0] || snapshot;
      result.currentTripStartTime = startSnap.timestamp;
      result.currentTripStartIndex = 0;
      result.accumulatedDistanceKm = 0;
    }
    result.stoppedSinceTimestamp = null;
  }

  if (
    newCtx.state === "driving" &&
    (oldCtx.state === "driving" ||
      oldCtx.state === "stopped" ||
      oldCtx.state === "validating")
  ) {
    const prev = oldCtx.recentSnapshots[oldCtx.recentSnapshots.length - 1];
    if (prev) {
      const distKm = haversineKm(
        prev.latitude,
        prev.longitude,
        snapshot.latitude,
        snapshot.longitude,
      );
      if (distKm * 1000 > FIXED_THRESHOLDS.MIN_DISTANCE_BETWEEN_SNAPSHOTS_M) {
        result.accumulatedDistanceKm += distKm;
      }
    }
  }

  if (newCtx.state === "stopped" && oldCtx.state !== "stopped") {
    result.stoppedSinceTimestamp = now;
  }

  if (
    (newCtx.state === "stopped" || newCtx.state === "validating") &&
    oldCtx.stoppedSinceTimestamp
  ) {
    result.stoppedSinceTimestamp = oldCtx.stoppedSinceTimestamp;
  }

  return result;
};

// ============================================================================
// FINALIZE TRIP
// ============================================================================
const finalizeTripAndNotify = async (
  newCtx: DetectionContext,
  oldCtx: DetectionContext,
  config: DetectionConfig,
): Promise<void> => {
  if (!oldCtx.currentTripStartTime || !oldCtx.selectedVehicleId) return;

  const resetCtx: DetectionContext = {
    ...newCtx,
    state: "monitoring",
    currentTripStartTime: null,
    currentTripStartIndex: null,
    accumulatedDistanceKm: 0,
    stoppedSinceTimestamp: null,
    lastStateChangeAt: Date.now(),
  };

  if (oldCtx.accumulatedDistanceKm < 0.1) {
    await saveDetectionContext(resetCtx);
    return;
  }

  const compensatedDistanceKm =
    oldCtx.accumulatedDistanceKm * config.roadCompensationFactor;

  const speeds: number[] = [];
  for (let i = 1; i < oldCtx.recentSnapshots.length; i++) {
    speeds.push(
      calculateSpeedKmh(
        oldCtx.recentSnapshots[i - 1],
        oldCtx.recentSnapshots[i],
      ),
    );
  }
  const avgSpeed =
    speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

  const pendingTrip: PendingTrip = {
    id: uuidv4(),
    vehicleId: oldCtx.selectedVehicleId,
    startTime: oldCtx.currentTripStartTime,
    endTime: oldCtx.stoppedSinceTimestamp || Date.now(),
    distanceKm: parseFloat(compensatedDistanceKm.toFixed(2)),
    snapshots: [...oldCtx.recentSnapshots],
    averageSpeedKmh: parseFloat(avgSpeed.toFixed(1)),
    maxSpeedKmh: parseFloat(maxSpeed.toFixed(1)),
    status: "awaiting_confirmation",
    createdAt: new Date().toISOString(),
  };

  await addPendingTrip(pendingTrip);
  await saveDetectionContext({ ...resetCtx, state: "awaiting_confirmation" });
  await sendTripConfirmationNotification(pendingTrip);
};

// ============================================================================
// NOTIFICATION
// ============================================================================
export const sendTripConfirmationNotification = async (
  trip: PendingTrip,
): Promise<void> => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🚗 Trip detected",
        body: `Looks like you drove ${trip.distanceKm.toFixed(2)} km. Tap to review.`,
        data: { pendingTripId: trip.id, type: "trip_confirmation" },
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
  } catch (e) {
    console.error("[BG] Notification failed:", e);
  }
};

// ============================================================================
// PUBLIC CONTROL API
// ============================================================================
export const startPassiveDetection = async (
  vehicleId: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      return { success: false, error: "Foreground location permission denied" };
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") {
      return {
        success: false,
        error:
          'Background location permission denied. On Android, please grant "Allow all the time" in app settings.',
      };
    }

    await Notifications.requestPermissionsAsync();
    await getDetectionConfig();

    const ctx: DetectionContext = {
      state: "monitoring",
      enabled: true,
      selectedVehicleId: vehicleId,
      recentSnapshots: [],
      currentTripStartTime: null,
      currentTripStartIndex: null,
      accumulatedDistanceKm: 0,
      stoppedSinceTimestamp: null,
      lastStateChangeAt: Date.now(),
      totalSnapshotsTaken: 0,
    };
    await saveDetectionContext(ctx);

    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      const existing = await getDetectionContext();
      await saveDetectionContext({
        ...(existing ?? ctx),
        enabled: true,
        state: "monitoring",
        selectedVehicleId: vehicleId,
      });
      return { success: true };
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 10,
      timeInterval: 10000,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Service Tracker — Detection Active",
        notificationBody: "Watching for trips to log automatically.",
        notificationColor: "#FF6B35",
      },
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed to start detection" };
  }
};

export const stopPassiveDetection = async (): Promise<void> => {
  try {
    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
    const ctx = await getDetectionContext();
    if (ctx) {
      await saveDetectionContext({ ...ctx, enabled: false, state: "idle" });
    }
  } catch (e) {
    console.error("[BG] Stop failed:", e);
  }
};

export const isPassiveDetectionActive = async (): Promise<boolean> => {
  try {
    const ctx = await getDetectionContext();
    if (!ctx?.enabled) return false;
    return await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
};

export const finalizeCurrentTripAndStop = async (): Promise<void> => {
  try {
    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }

    const ctx = await getDetectionContext();
    if (!ctx) return;

    const config = await getDetectionConfig();

    if (
      ctx.currentTripStartTime &&
      ctx.selectedVehicleId &&
      ctx.accumulatedDistanceKm >= 0.1
    ) {
      const compensatedDistanceKm =
        ctx.accumulatedDistanceKm * config.roadCompensationFactor;

      const speeds: number[] = [];
      for (let i = 1; i < ctx.recentSnapshots.length; i++) {
        speeds.push(
          calculateSpeedKmh(ctx.recentSnapshots[i - 1], ctx.recentSnapshots[i]),
        );
      }
      const avgSpeed = speeds.length
        ? speeds.reduce((a, b) => a + b, 0) / speeds.length
        : 0;
      const maxSpeed = speeds.length ? Math.max(...speeds) : 0;

      const pendingTrip: PendingTrip = {
        id: uuidv4(),
        vehicleId: ctx.selectedVehicleId,
        startTime: ctx.currentTripStartTime,
        endTime: Date.now(),
        distanceKm: parseFloat(compensatedDistanceKm.toFixed(2)),
        snapshots: [...ctx.recentSnapshots],
        averageSpeedKmh: parseFloat(avgSpeed.toFixed(1)),
        maxSpeedKmh: parseFloat(maxSpeed.toFixed(1)),
        status: "awaiting_confirmation",
        createdAt: new Date().toISOString(),
      };

      await addPendingTrip(pendingTrip);
      await sendTripConfirmationNotification(pendingTrip);
    }

    await saveDetectionContext({
      ...ctx,
      enabled: false,
      state: "idle",
      currentTripStartTime: null,
      currentTripStartIndex: null,
      accumulatedDistanceKm: 0,
      stoppedSinceTimestamp: null,
      recentSnapshots: [],
      lastStateChangeAt: Date.now(),
    });
  } catch (e) {
    console.error("[BG] finalizeCurrentTripAndStop failed:", e);
  }
};

// ============================================================================
// COLD-TRIP RECONCILIATION (Phase B Option 2)
// Reads GPS points buffered natively during a cold trip and turns them
// into a pending trip using the same distance math as the warm path.
// ============================================================================
const COLD_MOVEMENT_FLOOR_KMH = 3; // ignore parked GPS drift
const COLD_MAX_ACCURACY_M = 30; // reject fuzzy fixes
const COLD_MIN_SEGMENT_M = 8; // ignore sub-jitter hops
const COLD_MAX_PLAUSIBLE_KMH = 220; // drop GPS teleport glitches
const STALE_ACTIVE_TRIP_MS = 15 * 60 * 1000; // missed-disconnect rescue window

interface BufferedPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  speed?: number;
  accuracy?: number;
  address?: string;
}

const parseNdjson = (raw: string): BufferedPoint[] =>
  raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try {
        return JSON.parse(l) as BufferedPoint;
      } catch {
        return null; // tolerate a torn final line from a killed write
      }
    })
    .filter((p): p is BufferedPoint => p !== null);

export const reconcileColdTrips = async (): Promise<void> => {
  try {
    // 1. Rescue a trip whose disconnect callback was missed.
    await BluetoothDetection.sealStaleActiveTrip(STALE_ACTIVE_TRIP_MS);

    // 2. Drain every completed trip file independently — never merged.
    const files = await BluetoothDetection.getCompletedTripFiles();
    for (const name of files) {
      await reconcileOneTripFile(name);
    }
  } catch (e) {
    console.error("[ColdTrip] reconcile failed:", e);
  }
};

const reconcileOneTripFile = async (name: string): Promise<void> => {
  try {
    const raw = await BluetoothDetection.readTripFile(name);
    const points = parseNdjson(raw);

    if (points.length < 2) {
      await BluetoothDetection.deleteTripFile(name);
      return;
    }

    // Deterministic id → reconciling the same file twice can't duplicate a trip.
    const tripId = `cold-${name}`;
    const existing = await getPendingTrips();
    if (existing.some((t) => t.id === tripId)) {
      await BluetoothDetection.deleteTripFile(name);
      return;
    }

    const address = points.find((p) => p.address)?.address ?? "";
    const vehicles = await getVehicles();
    const match = vehicles.find(
      (v) => v.bluetoothAddress?.toLowerCase() === address.toLowerCase(),
    );
    if (!match) {
      await BluetoothDetection.deleteTripFile(name);
      return;
    }

    const config = await getDetectionConfig();

    let distanceKm = 0;
    const speeds: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      if (
        curr.accuracy != null &&
        curr.accuracy >= 0 &&
        curr.accuracy > COLD_MAX_ACCURACY_M
      ) {
        continue;
      }
      const segKm = haversineKm(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude,
      );
      const dtHours = (curr.timestamp - prev.timestamp) / 3_600_000;
      const segSpeedKmh = dtHours > 0 ? segKm / dtHours : 0;

      if (segKm * 1000 < COLD_MIN_SEGMENT_M) continue; // jitter hop
      if (segSpeedKmh < COLD_MOVEMENT_FLOOR_KMH) continue; // parked drift
      if (segSpeedKmh > COLD_MAX_PLAUSIBLE_KMH) continue; // GPS glitch

      distanceKm += segKm;
      speeds.push(segSpeedKmh);
    }

    if (distanceKm < 0.1) {
      await BluetoothDetection.deleteTripFile(name);
      return;
    }

    const compensatedKm = distanceKm * config.roadCompensationFactor;
    const avgSpeed = speeds.length
      ? speeds.reduce((a, b) => a + b, 0) / speeds.length
      : 0;
    const maxSpeed = speeds.length ? Math.max(...speeds) : 0;

    const pendingTrip: PendingTrip = {
      id: tripId,
      vehicleId: match.id,
      startTime: points[0].timestamp,
      endTime: points[points.length - 1].timestamp,
      distanceKm: parseFloat(compensatedKm.toFixed(2)),
      snapshots: [],
      averageSpeedKmh: parseFloat(avgSpeed.toFixed(1)),
      maxSpeedKmh: parseFloat(maxSpeed.toFixed(1)),
      status: "awaiting_confirmation",
      createdAt: new Date().toISOString(),
    };

    await addPendingTrip(pendingTrip);
    if (AppState.currentState !== "active") {
      await sendTripConfirmationNotification(pendingTrip);
    }

    // Delete ONLY after the trip is safely persisted. If anything above
    // throws, the file stays and the next reconcile retries it.
    await BluetoothDetection.deleteTripFile(name);
  } catch (e) {
    console.error(`[ColdTrip] reconcile failed for ${name}:`, e);
  }
};
