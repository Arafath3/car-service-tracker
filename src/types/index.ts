export type VehicleType = "car" | "motorbike";

export interface User {
  id: string;
  username?: string;
  passwordHash?: string;
  isGuest: boolean;
  createdAt: string;
}

export interface Vehicle {
  id?: string;
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
  customIntervals?: Record<string, number>;
  customServiceTypes?: ServiceInterval[];
  estimation?: VehicleEstimation;
  bluetoothAddress?: string;
  bluetoothName?: string;
}

export interface VehicleEstimation {
  status: "pending_observation" | "complete" | "manual";
  roughIntervalMonths: number;
  observationStartedAt: string;
  observationStartOdometer: number;
  observationCompletedAt?: string;
  estimatedDailyKm?: number;
  estimatedLastServiceOdometer?: number;
}

export interface ServiceRecord {
  id: string;
  vehicleId: string;
  serviceType?: string;
  odometer?: number;
  date?: string;
  notes?: string;
  cost?: number;
  nextDueOdometer?: number;
  nextDueDate?: string;
}

export interface ServiceInterval {
  serviceType: string;
  intervalKm: number;
  description: string;
  intervalMonths?: number;
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
  source?: "manual" | "passive";
}

// ============================================================================
// PASSIVE DETECTION
// ============================================================================

export type DetectionState =
  | "idle"
  | "monitoring"
  | "moving"
  | "driving"
  | "stopped"
  | "validating"
  | "awaiting_confirmation";

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
  status: "awaiting_confirmation" | "confirmed" | "rejected";
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

export type RootStackParamList = {
  Home: undefined;
  Login: undefined;
  Signup: undefined;
  AddVehicle: undefined;
  TrackTrip: undefined;
  AddService: undefined;
  ConfirmTrip: undefined;

  PassiveDetection: undefined;
};

export interface User {
  id: string; // Firebase uid for cloud users, 'guest_<uuid>' for guests
  email: string | null; // null for guests
  displayName: string | null;
  isGuest: boolean;
  createdAt: string;
}
