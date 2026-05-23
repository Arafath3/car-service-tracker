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
  source?: 'manual' | 'passive';
}

// ============================================================================
// PASSIVE DETECTION
// ============================================================================

export type DetectionState =
  | 'idle'
  | 'monitoring'
  | 'moving'
  | 'driving'
  | 'stopped'
  | 'validating'
  | 'awaiting_confirmation';

export interface LocationSnapshot {
  id: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  computedSpeedKmh?: number;
}

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

export interface DetectionContext {
  state: DetectionState;
  enabled: boolean;
  selectedVehicleId: string | null;
  recentSnapshots: LocationSnapshot[];
  currentTripStartTime: number | null;
  currentTripStartIndex: number | null;
  accumulatedDistanceKm: number;
  stoppedSinceTimestamp: number | null;
  lastStateChangeAt: number;
  totalSnapshotsTaken: number;
}

// User-tunable thresholds for the detection engine.
// Persisted to disk so demo settings survive app restarts.
export interface DetectionConfig {
  drivingMinKmh: number;
  walkingMaxKmh: number;
  movementSpeedKmh: number;
  consecutiveDrivingRequired: number;
  consecutiveStoppedRequired: number;
  validationDurationMs: number;
  rollingWindowSize: number;
  roadCompensationFactor: number;
}


// Add this at the very bottom of your types file:

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Home: undefined;
  
  // Modals
  AddVehicle: undefined;
  TrackTrip: undefined;
  AddService: undefined;
  ConfirmTrip: undefined;
  
  // Regular Screens
  PassiveDetection: undefined;
  
  // This screen likely needs a vehicle ID or object passed to it.
  // Adjust 'string' to whatever match your setup (e.g., vehicleId: string)
  VehicleDetail: { vehicleId: string }; 
};