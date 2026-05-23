// ============================================================================
// DRIVING DETECTION STATE MACHINE
// ============================================================================
// Pure logic - takes a DetectionConfig and a stream of LocationSnapshots,
// outputs state transitions. No side effects, fully testable.
//
// State flow:
//   idle → monitoring → moving → driving → stopped → validating → awaiting_confirmation
//
// All decisions use a ROLLING WINDOW of recent snapshots for noise resistance.
// ============================================================================

import type {
  DetectionContext,
  DetectionState,
  LocationSnapshot,
  DetectionConfig,
} from '@/types';

// GPS accuracy filter and minimum movement filter are not user-tunable
export const FIXED_THRESHOLDS = {
  MAX_ACCURACY_METERS: 100,
  MIN_DISTANCE_BETWEEN_SNAPSHOTS_M: 3,
  STOPPED_TIME_BEFORE_VALIDATION_MS: 60 * 1000, // 1 min stopped → validation
};

// -------- DISTANCE / SPEED MATHS --------

/** Haversine formula - distance between two GPS coords in km */
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

/** Calculate speed (km/h) from two snapshots based on distance and time */
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

/** Compute metrics over a rolling window of snapshots */
export const computeWindowMetrics = (
  snapshots: LocationSnapshot[],
  config: DetectionConfig
): WindowMetrics => {
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

  const variance =
    speeds.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / speeds.length;
  const stdDev = Math.sqrt(variance);
  const speedConsistency = avg > 0 ? Math.max(0, 1 - stdDev / Math.max(avg, 1)) : 0;

  const stopped = speeds.filter((s) => s < config.movementSpeedKmh).length;
  const stopFrequency = stopped / speeds.length;

  let consecutiveDrivingCount = 0;
  for (let i = speeds.length - 1; i >= 0; i--) {
    if (speeds[i] >= config.drivingMinKmh) consecutiveDrivingCount++;
    else break;
  }

  let consecutiveStoppedCount = 0;
  for (let i = speeds.length - 1; i >= 0; i--) {
    if (speeds[i] < config.movementSpeedKmh) consecutiveStoppedCount++;
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

const MIN_SNAPSHOTS_FOR_DECISION = 2;

/** Classify whether the user is currently driving */
export const isDriving = (metrics: WindowMetrics, config: DetectionConfig): boolean => {
  if (metrics.snapshotCount < MIN_SNAPSHOTS_FOR_DECISION) return false;
  const hasMultipleDrivingReadings =
    metrics.consecutiveDrivingCount >= config.consecutiveDrivingRequired;
  const averageSpeedSuggestsDriving = metrics.averageSpeedKmh >= config.walkingMaxKmh;
  const notMostlyStopped = metrics.stopFrequency < 0.5;
  return hasMultipleDrivingReadings && averageSpeedSuggestsDriving && notMostlyStopped;
};

/** Check if user has likely stopped driving */
export const hasStoppedDriving = (metrics: WindowMetrics, config: DetectionConfig): boolean => {
  return (
    metrics.consecutiveStoppedCount >= config.consecutiveStoppedRequired ||
    metrics.averageSpeedKmh < config.movementSpeedKmh
  );
};

// -------- STATE MACHINE --------

export interface StateTransitionResult {
  newState: DetectionState;
  reason: string;
  shouldNotify: boolean;
  shouldFinalizeTrip: boolean;
}

/** Process a new GPS snapshot and decide next state */
export const processSnapshot = (
  ctx: DetectionContext,
  newSnapshot: LocationSnapshot,
  now: number,
  config: DetectionConfig
): StateTransitionResult => {
  const updatedSnapshots = [...ctx.recentSnapshots, newSnapshot].slice(
    -config.rollingWindowSize
  );
  const metrics = computeWindowMetrics(updatedSnapshots, config);

  switch (ctx.state) {
    case 'idle':
      return {
        newState: 'idle',
        reason: 'Detection disabled',
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };

    case 'monitoring': {
      const lastSpeed = newSnapshot.computedSpeedKmh ?? 0;
      if (lastSpeed >= config.movementSpeedKmh) {
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
      if (isDriving(metrics, config)) {
        return {
          newState: 'driving',
          reason: `Driving confirmed: avg ${metrics.averageSpeedKmh.toFixed(1)} km/h, ${metrics.consecutiveDrivingCount} consecutive driving readings`,
          shouldNotify: false,
          shouldFinalizeTrip: false,
        };
      }
      if (metrics.consecutiveStoppedCount >= config.consecutiveStoppedRequired) {
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
      if (hasStoppedDriving(metrics, config)) {
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
      const lastSpeed = newSnapshot.computedSpeedKmh ?? 0;
      if (lastSpeed >= config.drivingMinKmh) {
        return {
          newState: 'driving',
          reason: `Resumed driving: ${lastSpeed.toFixed(1)} km/h`,
          shouldNotify: false,
          shouldFinalizeTrip: false,
        };
      }
      const timeSinceStopped = now - (ctx.stoppedSinceTimestamp || now);
      if (timeSinceStopped >= FIXED_THRESHOLDS.STOPPED_TIME_BEFORE_VALIDATION_MS) {
        return {
          newState: 'validating',
          reason: 'Stopped 1+ min, entering validation phase',
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
      const lastSpeed = newSnapshot.computedSpeedKmh ?? 0;
      if (lastSpeed >= config.drivingMinKmh) {
        return {
          newState: 'driving',
          reason: `Movement during validation - resuming trip: ${lastSpeed.toFixed(1)} km/h`,
          shouldNotify: false,
          shouldFinalizeTrip: false,
        };
      }
      const timeSinceStopped = now - (ctx.stoppedSinceTimestamp || now);
      if (timeSinceStopped >= config.validationDurationMs) {
        return {
          newState: 'awaiting_confirmation',
          reason: 'Validation complete - trip ended',
          shouldNotify: true,
          shouldFinalizeTrip: true,
        };
      }
      return {
        newState: 'validating',
        reason: `Validating end of trip (${Math.round(timeSinceStopped / 1000)}s / ${Math.round(config.validationDurationMs / 1000)}s)`,
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };
    }

    case 'awaiting_confirmation':
      return {
        newState: 'awaiting_confirmation',
        reason: 'Awaiting user confirmation',
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };

    default:
      return {
        newState: 'monitoring',
        reason: 'Unknown state, resetting',
        shouldNotify: false,
        shouldFinalizeTrip: false,
      };
  }
};

/** Filter out bad GPS readings */
export const isSnapshotValid = (snapshot: LocationSnapshot): boolean => {
  if (snapshot.accuracy && snapshot.accuracy > FIXED_THRESHOLDS.MAX_ACCURACY_METERS) {
    return false;
  }
  return true;
};
