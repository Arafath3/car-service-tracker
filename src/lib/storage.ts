import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  User,
  Vehicle,
  ServiceRecord,
  Trip,
  DetectionContext,
  PendingTrip,
  DetectionConfig,
} from '@/types';

const KEYS = {
  USERS: '@st_users',
  CURRENT_USER: '@st_current_user',
  VEHICLES: '@st_vehicles',
  SERVICES: '@st_services',
  TRIPS: '@st_trips',
  DETECTION_CONTEXT: '@st_detection_ctx',
  DETECTION_CONFIG: '@st_detection_config',
  PENDING_TRIPS: '@st_pending_trips',
  STATE_LOG: '@st_state_log',
};

// ---------- USERS ----------
export const getUsers = async (): Promise<User[]> => {
  const raw = await AsyncStorage.getItem(KEYS.USERS);
  return raw ? JSON.parse(raw) : [];
};
export const saveUsers = async (users: User[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.USERS, JSON.stringify(users));
};
export const getCurrentUser = async (): Promise<User | null> => {
  const raw = await AsyncStorage.getItem(KEYS.CURRENT_USER);
  return raw ? JSON.parse(raw) : null;
};
export const setCurrentUser = async (user: User | null): Promise<void> => {
  if (user) {
    await AsyncStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(KEYS.CURRENT_USER);
  }
};

// ---------- VEHICLES ----------
export const getVehicles = async (): Promise<Vehicle[]> => {
  const raw = await AsyncStorage.getItem(KEYS.VEHICLES);
  return raw ? JSON.parse(raw) : [];
};
export const saveVehicles = async (vehicles: Vehicle[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.VEHICLES, JSON.stringify(vehicles));
};
export const getVehiclesForUser = async (userId: string): Promise<Vehicle[]> => {
  const all = await getVehicles();
  return all.filter((v) => v.userId === userId);
};
export const addVehicle = async (vehicle: Vehicle): Promise<void> => {
  const all = await getVehicles();
  all.push(vehicle);
  await saveVehicles(all);
};
export const updateVehicle = async (vehicle: Vehicle): Promise<void> => {
  const all = await getVehicles();
  const idx = all.findIndex((v) => v.id === vehicle.id);
  if (idx >= 0) {
    all[idx] = vehicle;
    await saveVehicles(all);
  }
};
export const deleteVehicle = async (vehicleId: string): Promise<void> => {
  const all = await getVehicles();
  await saveVehicles(all.filter((v) => v.id !== vehicleId));
  const services = await getServices();
  await saveServices(services.filter((s) => s.vehicleId !== vehicleId));
  const trips = await getTrips();
  await saveTrips(trips.filter((t) => t.vehicleId !== vehicleId));
};

// ---------- SERVICES ----------
export const getServices = async (): Promise<ServiceRecord[]> => {
  const raw = await AsyncStorage.getItem(KEYS.SERVICES);
  return raw ? JSON.parse(raw) : [];
};
export const saveServices = async (services: ServiceRecord[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.SERVICES, JSON.stringify(services));
};
export const getServicesForVehicle = async (vehicleId: string): Promise<ServiceRecord[]> => {
  const all = await getServices();
  return all
    .filter((s) => s.vehicleId === vehicleId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};
export const addService = async (service: ServiceRecord): Promise<void> => {
  const all = await getServices();
  all.push(service);
  await saveServices(all);
};

// ---------- TRIPS ----------
export const getTrips = async (): Promise<Trip[]> => {
  const raw = await AsyncStorage.getItem(KEYS.TRIPS);
  return raw ? JSON.parse(raw) : [];
};
export const saveTrips = async (trips: Trip[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.TRIPS, JSON.stringify(trips));
};
export const getTripsForVehicle = async (vehicleId: string): Promise<Trip[]> => {
  const all = await getTrips();
  return all
    .filter((t) => t.vehicleId === vehicleId)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
};
export const addTrip = async (trip: Trip): Promise<void> => {
  const all = await getTrips();
  all.push(trip);
  await saveTrips(all);
};

// ---------- DETECTION CONTEXT ----------
export const getDetectionContext = async (): Promise<DetectionContext | null> => {
  const raw = await AsyncStorage.getItem(KEYS.DETECTION_CONTEXT);
  return raw ? JSON.parse(raw) : null;
};
export const saveDetectionContext = async (ctx: DetectionContext): Promise<void> => {
  await AsyncStorage.setItem(KEYS.DETECTION_CONTEXT, JSON.stringify(ctx));
};

// ---------- DETECTION CONFIG (tunable thresholds) ----------
export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  drivingMinKmh: 15,
  walkingMaxKmh: 10,
  movementSpeedKmh: 5,
  consecutiveDrivingRequired: 2,
  consecutiveStoppedRequired: 2,
  validationDurationMs: 5 * 60 * 1000,
  rollingWindowSize: 10,
  roadCompensationFactor: 1.15,
};

// Demo preset: extremely sensitive, instant responses, walking triggers driving
export const DEMO_DETECTION_CONFIG: DetectionConfig = {
  drivingMinKmh: 3,
  walkingMaxKmh: 1,
  movementSpeedKmh: 0.5,
  consecutiveDrivingRequired: 1,
  consecutiveStoppedRequired: 1,
  validationDurationMs: 30 * 1000, // 30 sec instead of 5 min
  rollingWindowSize: 5,
  roadCompensationFactor: 1.15,
};

export const getDetectionConfig = async (): Promise<DetectionConfig> => {
  const raw = await AsyncStorage.getItem(KEYS.DETECTION_CONFIG);
  return raw ? JSON.parse(raw) : DEFAULT_DETECTION_CONFIG;
};

export const saveDetectionConfig = async (cfg: DetectionConfig): Promise<void> => {
  await AsyncStorage.setItem(KEYS.DETECTION_CONFIG, JSON.stringify(cfg));
};

// ---------- PENDING TRIPS ----------
export const getPendingTrips = async (): Promise<PendingTrip[]> => {
  const raw = await AsyncStorage.getItem(KEYS.PENDING_TRIPS);
  return raw ? JSON.parse(raw) : [];
};
export const savePendingTrips = async (trips: PendingTrip[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.PENDING_TRIPS, JSON.stringify(trips));
};
export const addPendingTrip = async (trip: PendingTrip): Promise<void> => {
  const all = await getPendingTrips();
  all.push(trip);
  await savePendingTrips(all);
};
export const getPendingTripById = async (id: string): Promise<PendingTrip | null> => {
  const all = await getPendingTrips();
  return all.find((t) => t.id === id) || null;
};
export const removePendingTrip = async (id: string): Promise<void> => {
  const all = await getPendingTrips();
  await savePendingTrips(all.filter((t) => t.id !== id));
};
export const getAwaitingConfirmation = async (): Promise<PendingTrip[]> => {
  const all = await getPendingTrips();
  return all.filter((t) => t.status === 'awaiting_confirmation');
};

// ---------- STATE LOG ----------
export interface StateLogEntry {
  timestamp: number;
  state: string;
  reason: string;
  speed?: number;
  distance?: number;
}
export const appendStateLog = async (entry: StateLogEntry): Promise<void> => {
  const raw = await AsyncStorage.getItem(KEYS.STATE_LOG);
  const log: StateLogEntry[] = raw ? JSON.parse(raw) : [];
  log.push(entry);
  const trimmed = log.slice(-100);
  await AsyncStorage.setItem(KEYS.STATE_LOG, JSON.stringify(trimmed));
};
export const getStateLog = async (): Promise<StateLogEntry[]> => {
  const raw = await AsyncStorage.getItem(KEYS.STATE_LOG);
  return raw ? JSON.parse(raw) : [];
};
export const clearStateLog = async (): Promise<void> => {
  await AsyncStorage.removeItem(KEYS.STATE_LOG);
};

export const clearAllData = async (): Promise<void> => {
  await AsyncStorage.multiRemove(Object.values(KEYS));
};
