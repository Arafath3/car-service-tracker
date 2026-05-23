// ============================================================================
// DRIVING DETECTION STATE MACHINE
// ============================================================================
// This is the brain of the passive detection system.
// It receives GPS snapshots and decides whether the user is driving.
//
// State flow:
//   idle → monitoring → moving → driving → stopped → validating → awaiting_confirmation
//
// All decisions are based on a ROLLING WINDOW of recent snapshots,
// not single readings - this prevents false positives from GPS noise.
// ============================================================================

import { DetectionContext, DetectionState, LocationSnapshot } from '../types';

// -------- TUNABLE THRESHOLDS --------
// These can be adjusted for sensitivity vs accuracy
export const CONFIG = {
  // Movement detection
  MOVEMENT_SPEED_KMH: 5, // below this = stationary
  WALKING_MAX_KMH: 10, // walking/running upper bound
  DRIVING_MIN_KMH: 15, // above this = likely driving

  // Confirmation thresholds (require multiple consecutive readings)
  CONSECUTIVE_DRIVING_REQUIRED: 2, // snapshots in driving range to confirm
  CONSECUTIVE_STOPPED_REQUIRED: 2, // snapshots stationary to suspect stop

  // Validation phase
  VALIDATION_DURATION_MS: 5 * 60 * 1000, // 5 minutes per spec

  // Snapshot collection
  ROLLING_WINDOW_SIZE: 10, // keep last 10 snapshots
  MIN_SNAPSHOTS_FOR_DECISION: 3, // need at least 3 to classify

  // Distance compensation
  ROAD_COMPENSATION_FACTOR: 1.15, // GPS distance × this = estimated road distance

  // GPS accuracy filter
  MAX_ACCURACY_METERS: 100, // ignore snapshots with worse accuracy
  MIN_DISTANCE_BETWEEN_SNAPSHOTS_M: 5, // ignore tiny GPS jitter
};

// -------- DISTANCE / SPEED MATHS --------

/**
 * Haversine formula - distance between two GPS coords in km
 */
export const haversineKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
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

/**
 * Calculate speed (km/h) from two snapshots based on distance and time
 */
export const calculateSpeedKmh = (
  prev: LocationSnapshot,
  curr: LocationSnapshot
): number => {
  const distKm = haversineKm(
    prev.latitude,
    prev.longitude,
    curr.latitude,
    curr.longitude
  );
  const timeHours = (curr.timestamp - prev.timestamp) / (1000 * 60 * 60);
  if (timeHours <= 0) return 0;
  return distKm / timeHours;
};

// -------- ROLLING WINDOW METRICS --------

export interface WindowMetrics {
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  speedConsistency: number; // 0-1, higher = more consistent
  stopFrequency: number; // 0-1, fraction of readings stopped
  totalDistanceKm: number;
  snapshotCount: number;
  consecutiveDrivingCount: number;
  consecutiveStoppedCount: number;
}

/**
 * Compute metrics over a rolling window of snapshots.
 * This is what makes the classifier robust against noise.
 */
export const computeWindowMetrics = (snapshots: LocationSnapshot[]): WindowMetrics => {
  if (snapshots.length < 2) {
    return {
      averageSpeedKmh: 0,
      maxSpeedKmh: 0,
      speedConsistency: 0,
      stopFrequency: 1,
      totalDistanceKm: 0,
      snapshotCount: snapshots.length,
      consecutiveDrivingCount: 0,
      consecutiveStoppedCount: 0,
    };
  }

  const speeds: number[] = [];
  let totalDistanceKm = 0;

  for (let i = 1; i < snapshots.length; i++) {
    const speed = calculateSpeedKmh(snapshots[i - 1], snapshots[i]);
    speeds.push(speed);
    totalDistanceKm += haversineKm(
      snapshots[i - 1].latitude,
      snapshots[i - 1].longitude,
      snapshots[i].latitude,
      snapshots[i].longitude
    );
  }

  const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const max = Math.max(...speeds);

  // Speed consistency = 1 - normalized standard deviation
  // Lower variance relative to mean = more consistent (driving smoothly)
  const variance =
    speeds.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / speeds.length;
  const stdDev = Math.sqrt(variance);
  const speedConsistency = avg > 0 ? Math.max(0, 1 - stdDev / Math.max(avg, 1)) : 0;

  // Stop frequency = fraction of readings that were stationary
  const stopped = speeds.filter((s) => s < CONFIG.MOVEMENT_SPEED_KMH).length;
  const stopFrequency = stopped / speeds.length;

  // Consecutive driving readings (from end of window backwards)
  let consecutiveDrivingCount = 0;
  for (let i = speeds.length - 1; i >= 0; i--) {
    if (speeds[i] >= CONFIG.DRIVING_MIN_KMH) consecutiveDrivingCount++;
    else break;
  }

  // Consecutive stopped readings (from end backwards)
  let consecutiveStoppedCount = 0;
  for (let i = speeds.length - 1; i >= 0; i--) {
    if (speeds[i] < CONFIG.MOVEMENT_SPEED_KMH) consecutiveStoppedCount++;
    else break;
  }

  return {
    averageSpeedKmh: avg,
    maxSpeedKmh: max,
    speedConsistency,
    stopFrequency,
    totalDistanceKm,
    snapshotCount: snapshots.length,
    consecutiveDrivingCount,
    consecutiveStoppedCount,
  };
};

// -------- CLASSIFICATION --------

/**
 * Classify whether the user is currently driving based on window metrics.
 * Returns true if driving, false otherwise.
 *
 * Logic:
 *   - Need enough snapshots for a confident decision
 *   - Average speed must be in driving range
 *   - Multiple consecutive readings must show driving (not just one outlier)
 *   - Speed should be reasonably consistent (not random GPS errors)
 */
export const isDriving = (metrics: WindowMetrics): boolean => {
  if (metrics.snapshotCount < CONFIG.MIN_SNAPSHOTS_FOR_DECISION) {
    return false;
  }

  const hasMultipleDrivingReadings =
    metrics.consecutiveDrivingCount >= CONFIG.CONSECUTIVE_DRIVING_REQUIRED;

  const averageSpeedSuggestsDriving =
    metrics.averageSpeedKmh >= CONFIG.WALKING_MAX_KMH;

  const notMostlyStopped = metrics.stopFrequency < 0.5;

  return hasMultipleDrivingReadings && averageSpeedSuggestsDriving && notMostlyStopped;
};

/**
 * Check if the user has likely stopped driving.
 * Used during 'driving' state to detect transition to 'stopped'.
 */
export const hasStoppedDriving = (metrics: WindowMetrics): boolean => {
  return (
    metrics.consecutiveStoppedCount >= CONFIG.CONSECUTIVE_STOPPED_REQUIRED ||
    metrics.averageSpeedKmh < CONFIG.MOVEMENT_SPEED_KMH
  );
};

// -------- STATE MACHINE --------

export interface StateTransitionResult {
  newState: DetectionState;
  reason: string;
  shouldNotify: boolean;
  shouldFinalizeTrip: boolean;
}

/**
 * Process a new GPS snapshot and decide what state to be in.
 * This is the main state machine - given a current context and new snapshot,
 * it computes the next state and any side effects.
 *
 * Returns the next state + reasoning + flags for what to do.
 */
export const processSnapshot = (
  ctx: DetectionContext,
  newSnapshot: LocationSnapshot,
  now: number
): StateTransitionResult => {
  // Add new snapshot to rolling window
  const updatedSnapshots = [...ctx.recentSnapshots, newSnapshot].slice(
    -CONFIG.ROLLING_WINDOW_SIZE
  );
  const metrics = computeWindowMetrics(updatedSnapshots);

  switch (ctx.state) {
    case 'idle':
      // Should not be processing snapshots in idle state
      return {
        newState: 'idle',
        reason: 'Detection disabled',
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };

    case 'monitoring': {
      // Looking for any movement above stationary threshold
      const lastSpeed = newSnapshot.computedSpeedKmh ?? 0;
      if (lastSpeed >= CONFIG.MOVEMENT_SPEED_KMH) {
        return {
          newState: 'moving',
          reason: `Movement detected: ${lastSpeed.toFixed(1)} km/h`,
          shouldNotify: false,
          shouldFinalizeTrip: false,
        };
      }
      return {
        newState: 'monitoring',
        reason: 'No significant movement',
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };
    }

    case 'moving': {
      // Evaluating: is this driving or just walking?
      if (isDriving(metrics)) {
        return {
          newState: 'driving',
          reason: `Driving confirmed: avg ${metrics.averageSpeedKmh.toFixed(1)} km/h, ${metrics.consecutiveDrivingCount} consecutive driving readings`,
          shouldNotify: false,
          shouldFinalizeTrip: false,
        };
      }
      // If we've fully stopped, go back to monitoring
      if (metrics.consecutiveStoppedCount >= CONFIG.CONSECUTIVE_STOPPED_REQUIRED) {
        return {
          newState: 'monitoring',
          reason: 'Movement ended without reaching driving speed',
          shouldNotify: false,
          shouldFinalizeTrip: false,
        };
      }
      return {
        newState: 'moving',
        reason: `Evaluating movement (avg ${metrics.averageSpeedKmh.toFixed(1)} km/h)`,
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };
    }

    case 'driving': {
      // Already driving - check if we've stopped
      if (hasStoppedDriving(metrics)) {
        return {
          newState: 'stopped',
          reason: `Speed dropped: ${metrics.consecutiveStoppedCount} consecutive stopped readings`,
          shouldNotify: false,
          shouldFinalizeTrip: false,
        };
      }
      return {
        newState: 'driving',
        reason: `Driving continues: avg ${metrics.averageSpeedKmh.toFixed(1)} km/h`,
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };
    }

    case 'stopped': {
      // Recently stopped - has user resumed driving (e.g. just a red light)?
      const lastSpeed = newSnapshot.computedSpeedKmh ?? 0;
      if (lastSpeed >= CONFIG.DRIVING_MIN_KMH) {
        return {
          newState: 'driving',
          reason: `Resumed driving: ${lastSpeed.toFixed(1)} km/h`,
          shouldNotify: false,
          shouldFinalizeTrip: false,
        };
      }
      // Still stopped - has it been long enough to start validation phase?
      const timeSinceStopped = now - (ctx.stoppedSinceTimestamp || now);
      if (timeSinceStopped >= 2 * 60 * 1000) {
        // 2 minutes of being stopped - move to validation
        return {
          newState: 'validating',
          reason: 'Stopped for 2+ minutes, entering validation phase',
          shouldNotify: false,
          shouldFinalizeTrip: false,
        };
      }
      return {
        newState: 'stopped',
        reason: `Stopped, waiting (${Math.round(timeSinceStopped / 1000)}s)`,
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };
    }

    case 'validating': {
      // Validation phase - any movement here means trip continues
      const lastSpeed = newSnapshot.computedSpeedKmh ?? 0;
      if (lastSpeed >= CONFIG.DRIVING_MIN_KMH) {
        // False alarm - back to driving
        return {
          newState: 'driving',
          reason: `Movement during validation - resuming trip: ${lastSpeed.toFixed(1)} km/h`,
          shouldNotify: false,
          shouldFinalizeTrip: false,
        };
      }
      // Has 5 minutes passed without movement?
      const timeSinceStopped = now - (ctx.stoppedSinceTimestamp || now);
      if (timeSinceStopped >= CONFIG.VALIDATION_DURATION_MS) {
        // Trip is confirmed ended - send notification for user confirmation
        return {
          newState: 'awaiting_confirmation',
          reason: 'Validation complete - trip ended',
          shouldNotify: true,
          shouldFinalizeTrip: true,
        };
      }
      return {
        newState: 'validating',
        reason: `Validating end of trip (${Math.round(timeSinceStopped / 1000)}s / ${CONFIG.VALIDATION_DURATION_MS / 1000}s)`,
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };
    }

    case 'awaiting_confirmation':
      // Don't do anything new - waiting for user
      return {
        newState: 'awaiting_confirmation',
        reason: 'Awaiting user confirmation',
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };

    default:
      return {
        newState: 'monitoring',
        reason: 'Unknown state, resetting to monitoring',
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };
  }
};

/**
 * Helper to filter out bad GPS readings before adding to window
 */
export const isSnapshotValid = (snapshot: LocationSnapshot): boolean => {
  if (snapshot.accuracy && snapshot.accuracy > CONFIG.MAX_ACCURACY_METERS) {
    return false;
  }
  return true;
};
