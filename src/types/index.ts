export type VehicleType = 'car' | 'motorbike';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  isGuest: boolean;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  userId: string;
  type: VehicleType;
  make: string;
  model: string;
  year: number;
  nickname?: string;
  currentOdometer: number;
  startingOdometer: number;
  color?: string;
  createdAt: string;
}

export interface ServiceRecord {
  id: string;
  vehicleId: string;
  serviceType: string;
  odometer: number;
  date: string;
  notes?: string;
  cost?: number;
}

export interface ServiceInterval {
  serviceType: string;
  intervalKm: number;
  description: string;
}

export interface Trip {
  id: string;
  vehicleId: string;
  startTime: string;
  endTime?: string;
  distanceKm: number;
  startOdometer: number;
  endOdometer?: number;
  isActive: boolean;
  source?: 'manual' | 'passive'; // tracks how trip was created
}

// ============================================================================
// PASSIVE DETECTION TYPES
// ============================================================================

// State machine states for driving detection
export type DetectionState =
  | 'idle' // Not monitoring at all
  | 'monitoring' // Background snapshots running, waiting for movement
  | 'moving' // Movement detected, evaluating if it's driving
  | 'driving' // Confirmed driving, accumulating distance
  | 'stopped' // Speed dropped, may be end of trip
  | 'validating' // 5-min wait to confirm trip ended
  | 'awaiting_confirmation'; // Notification sent, waiting for user response

// One GPS snapshot - the building block of detection
export interface LocationSnapshot {
  id: string;
  timestamp: number; // Unix ms
  latitude: number;
  longitude: number;
  accuracy?: number; // meters
  speed?: number; // m/s from GPS
  computedSpeedKmh?: number; // calculated from previous snapshot
}

// A pending trip detected by passive system, awaiting user confirmation
export interface PendingTrip {
  id: string;
  vehicleId: string;
  startTime: number;
  endTime: number;
  distanceKm: number;
  snapshots: LocationSnapshot[];
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  status: 'awaiting_confirmation' | 'confirmed' | 'rejected';
  createdAt: string;
}

// State machine context - persisted to disk so it survives app restarts
export interface DetectionContext {
  state: DetectionState;
  enabled: boolean;
  selectedVehicleId: string | null;
  recentSnapshots: LocationSnapshot[]; // rolling window
  currentTripStartTime: number | null;
  currentTripStartIndex: number | null; // index into recentSnapshots
  accumulatedDistanceKm: number;
  stoppedSinceTimestamp: number | null;
  lastStateChangeAt: number;
  totalSnapshotsTaken: number;
}

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Home: undefined;
  AddVehicle: undefined;
  VehicleDetail: { vehicleId: string };
  TrackTrip: { vehicleId: string };
  AddService: { vehicleId: string };
  PassiveDetection: undefined;
  ConfirmTrip: { pendingTripId: string };
};
