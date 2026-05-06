// ============================================================================
// PASSIVE DETECTION SERVICE
// ============================================================================
// Bridges OS background task scheduling with the detection state machine.
//
// How it works (Android):
//   1. We register a TaskManager task that the OS calls with location updates
//   2. When OS wakes our task, we get a fresh GPS location
//   3. Feed it into the detection state machine
//   4. Persist updated state to AsyncStorage
//   5. Send notification if state machine says so
//   6. Return - app goes back to sleep
//
// This is event-driven: we don't poll, the OS calls us when location changes.
// The OS decides when based on time/distance thresholds we set.
// ============================================================================

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import {
  DetectionContext,
  DetectionState,
  LocationSnapshot,
  PendingTrip,
} from '../types';
import {
  getDetectionContext,
  saveDetectionContext,
  addPendingTrip,
  appendStateLog,
} from './storage';
import {
  CONFIG,
  calculateSpeedKmh,
  isSnapshotValid,
  processSnapshot,
} from './detectionEngine';

export const LOCATION_TASK_NAME = 'PASSIVE_DETECTION_LOCATION';

// ============================================================================
// THE BACKGROUND TASK
// ============================================================================
// This function is called by the OS - not by us directly.
// It must be defined at module load time.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[BG] Task error:', error);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  // Process each location update
  for (const loc of locations) {
    await handleNewLocation(loc);
  }
});

// ============================================================================
// LOCATION HANDLER - the heart of the detection flow
// ============================================================================
export const handleNewLocation = async (
  loc: Location.LocationObject
): Promise<void> => {
  try {
    // 1. Load current detection context from disk
    const ctx = await getDetectionContext();
    if (!ctx || !ctx.enabled || ctx.state === 'idle') {
      return; // detection turned off
    }

    const now = Date.now();

    // 2. Build snapshot from location
    const snapshot: LocationSnapshot = {
      id: uuidv4(),
      timestamp: now,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
      speed: loc.coords.speed ?? undefined,
    };

    // Compute speed from previous snapshot if available
    if (ctx.recentSnapshots.length > 0) {
      const prev = ctx.recentSnapshots[ctx.recentSnapshots.length - 1];
      snapshot.computedSpeedKmh = calculateSpeedKmh(prev, snapshot);
    } else {
      snapshot.computedSpeedKmh = (loc.coords.speed ?? 0) * 3.6;
    }

    // 3. Filter out bad GPS readings
    if (!isSnapshotValid(snapshot)) {
      await appendStateLog({
        timestamp: now,
        state: ctx.state,
        reason: `Snapshot rejected (accuracy ${snapshot.accuracy?.toFixed(0)}m)`,
      });
      return;
    }

    // 4. Run state machine
    const result = processSnapshot(ctx, snapshot, now);

    // 5. Build updated context
    const updatedSnapshots = [...ctx.recentSnapshots, snapshot].slice(
      -CONFIG.ROLLING_WINDOW_SIZE
    );

    let newCtx: DetectionContext = {
      ...ctx,
      state: result.newState,
      recentSnapshots: updatedSnapshots,
      lastStateChangeAt: result.newState !== ctx.state ? now : ctx.lastStateChangeAt,
      totalSnapshotsTaken: ctx.totalSnapshotsTaken + 1,
    };

    // 6. Handle state transitions
    newCtx = applyStateTransitionEffects(newCtx, ctx, snapshot, now);

    // 7. Log the transition for the debug panel
    await appendStateLog({
      timestamp: now,
      state: result.newState,
      reason: result.reason,
      speed: snapshot.computedSpeedKmh,
      distance: newCtx.accumulatedDistanceKm,
    });

    // 8. Save updated context
    await saveDetectionContext(newCtx);

    // 9. Side effects: finalize trip, send notification
    if (result.shouldFinalizeTrip) {
      await finalizeTripAndNotify(newCtx, ctx);
    }
  } catch (e) {
    console.error('[BG] handleNewLocation failed:', e);
  }
};

// ============================================================================
// STATE TRANSITION SIDE EFFECTS
// ============================================================================
const applyStateTransitionEffects = (
  newCtx: DetectionContext,
  oldCtx: DetectionContext,
  snapshot: LocationSnapshot,
  now: number
): DetectionContext => {
  const result = { ...newCtx };

  // Entered driving state - mark trip start
  if (newCtx.state === 'driving' && oldCtx.state !== 'driving') {
    if (!result.currentTripStartTime) {
      // Find when motion started in the snapshot history
      const startSnap = result.recentSnapshots[0] || snapshot;
      result.currentTripStartTime = startSnap.timestamp;
      result.currentTripStartIndex = 0;
      result.accumulatedDistanceKm = 0;
    }
    result.stoppedSinceTimestamp = null;
  }

  // Continuing in driving state - accumulate distance
  if (newCtx.state === 'driving' && oldCtx.state === 'driving') {
    const prev = oldCtx.recentSnapshots[oldCtx.recentSnapshots.length - 1];
    if (prev) {
      const distKm = haversineKm(
        prev.latitude,
        prev.longitude,
        snapshot.latitude,
        snapshot.longitude
      );
      // Filter out tiny GPS jitter
      if (distKm * 1000 > CONFIG.MIN_DISTANCE_BETWEEN_SNAPSHOTS_M) {
        result.accumulatedDistanceKm += distKm;
      }
    }
  }

  // Just transitioned to driving from stopped (resumed) - capture continuing distance
  if (newCtx.state === 'driving' && oldCtx.state === 'stopped') {
    const prev = oldCtx.recentSnapshots[oldCtx.recentSnapshots.length - 1];
    if (prev) {
      const distKm = haversineKm(
        prev.latitude,
        prev.longitude,
        snapshot.latitude,
        snapshot.longitude
      );
      if (distKm * 1000 > CONFIG.MIN_DISTANCE_BETWEEN_SNAPSHOTS_M) {
        result.accumulatedDistanceKm += distKm;
      }
    }
  }

  // Entered stopped state - mark stopped time
  if (newCtx.state === 'stopped' && oldCtx.state !== 'stopped') {
    result.stoppedSinceTimestamp = now;
  }

  // Stayed stopped or in validation - keep stopped timestamp
  if (
    (newCtx.state === 'stopped' || newCtx.state === 'validating') &&
    oldCtx.stoppedSinceTimestamp
  ) {
    result.stoppedSinceTimestamp = oldCtx.stoppedSinceTimestamp;
  }

  return result;
};

// Helper - duplicate from engine for closure
const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ============================================================================
// FINALIZE TRIP - called when state machine says trip is over
// ============================================================================
const finalizeTripAndNotify = async (
  newCtx: DetectionContext,
  oldCtx: DetectionContext
): Promise<void> => {
  if (!oldCtx.currentTripStartTime || !oldCtx.selectedVehicleId) return;
  if (oldCtx.accumulatedDistanceKm < 0.5) {
    // Trip too short to be worth confirming - just reset
    await saveDetectionContext({
      ...newCtx,
      state: 'monitoring',
      currentTripStartTime: null,
      currentTripStartIndex: null,
      accumulatedDistanceKm: 0,
      stoppedSinceTimestamp: null,
      lastStateChangeAt: Date.now(),
    });
    return;
  }

  // Apply road compensation factor (straight-line GPS underestimates road distance)
  const compensatedDistanceKm =
    oldCtx.accumulatedDistanceKm * CONFIG.ROAD_COMPENSATION_FACTOR;

  // Compute trip stats
  const speeds: number[] = [];
  for (let i = 1; i < oldCtx.recentSnapshots.length; i++) {
    speeds.push(calculateSpeedKmh(oldCtx.recentSnapshots[i - 1], oldCtx.recentSnapshots[i]));
  }
  const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

  // Create pending trip
  const pendingTrip: PendingTrip = {
    id: uuidv4(),
    vehicleId: oldCtx.selectedVehicleId,
    startTime: oldCtx.currentTripStartTime,
    endTime: oldCtx.stoppedSinceTimestamp || Date.now(),
    distanceKm: parseFloat(compensatedDistanceKm.toFixed(2)),
    snapshots: [...oldCtx.recentSnapshots],
    averageSpeedKmh: parseFloat(avgSpeed.toFixed(1)),
    maxSpeedKmh: parseFloat(maxSpeed.toFixed(1)),
    status: 'awaiting_confirmation',
    createdAt: new Date().toISOString(),
  };

  await addPendingTrip(pendingTrip);

  // Send confirmation notification
  await sendTripConfirmationNotification(pendingTrip);
};

// ============================================================================
// NOTIFICATION
// ============================================================================
export const sendTripConfirmationNotification = async (
  trip: PendingTrip
): Promise<void> => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🚗 Trip detected',
        body: `Looks like you drove ${trip.distanceKm.toFixed(1)} km. Was this a real trip?`,
        data: { pendingTripId: trip.id, type: 'trip_confirmation' },
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // immediate
    });
  } catch (e) {
    console.error('[BG] Failed to send notification:', e);
  }
};

// ============================================================================
// PUBLIC CONTROL API
// ============================================================================

export const startPassiveDetection = async (vehicleId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // Request permissions
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      return { success: false, error: 'Foreground location permission denied' };
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      return {
        success: false,
        error: 'Background location permission denied. Detection will only run while app is open.',
      };
    }

    // Request notification permission (Android 13+)
    const notif = await Notifications.requestPermissionsAsync();
    if (notif.status !== 'granted') {
      console.warn('Notification permission not granted - will track but cannot notify');
    }

    // Initialize detection context
    const ctx: DetectionContext = {
      state: 'monitoring',
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

    // Start background location updates
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 50, // wake every 50m moved
        timeInterval: 30000, // or every 30 seconds
        deferredUpdatesInterval: 30000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Service Tracker — Driving Detection Active',
          notificationBody: 'Watching for trips to log automatically. Tap to manage.',
          notificationColor: '#FF6B35',
        },
      });
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to start detection' };
  }
};

export const stopPassiveDetection = async (): Promise<void> => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
    const ctx = await getDetectionContext();
    if (ctx) {
      await saveDetectionContext({ ...ctx, enabled: false, state: 'idle' });
    }
  } catch (e) {
    console.error('[BG] Failed to stop detection:', e);
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
