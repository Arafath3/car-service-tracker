import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Vehicle, ServiceRecord, Trip, DetectionContext, PendingTrip } from '../types';

const KEYS = {
  USERS: '@car_app_users',
  CURRENT_USER: '@car_app_current_user',
  VEHICLES: '@car_app_vehicles',
  SERVICES: '@car_app_services',
  TRIPS: '@car_app_trips',
  DETECTION_CONTEXT: '@car_app_detection_ctx',
  PENDING_TRIPS: '@car_app_pending_trips',
  STATE_LOG: '@car_app_state_log',
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
  const filtered = all.filter((v) => v.id !== vehicleId);
  await saveVehicles(filtered);
  const services = await getServices();
  await saveServices(services.filter((s) => s.vehicleId !== vehicleId));
  const trips = await getTrips();
  await saveTrips(trips.filter((t) => t.vehicleId !== vehicleId));
};

// ---------- SERVICE RECORDS ----------
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
export const updateTrip = async (trip: Trip): Promise<void> => {
  const all = await getTrips();
  const idx = all.findIndex((t) => t.id === trip.id);
  if (idx >= 0) {
    all[idx] = trip;
    await saveTrips(all);
  }
};

// ---------- PASSIVE DETECTION CONTEXT ----------
export const getDetectionContext = async (): Promise<DetectionContext | null> => {
  try {
    const raw = await AsyncStorage.getItem(KEYS.DETECTION_CONTEXT);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Failed to parse active background detection context:', error);
    return null;
  }
};

export const saveDetectionContext = async (ctx: DetectionContext): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEYS.DETECTION_CONTEXT, JSON.stringify(ctx));
  } catch (error) {
    console.error('Failed to commit tracking state frame changes:', error);
  }
};

/**
 * Diagnostic line appending for the engineering debug viewport panel.
 * Keeps a hard cap at the last 100 entries so device storage doesn't balloon.
 */
export const appendStateLog = async (log: StateLog): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(KEYS.STATE_LOGS);
    const logs: StateLog[] = raw ? JSON.parse(raw) : [];
    logs.push(log);
    
    const cappedLogs = logs.slice(-100); 
    await AsyncStorage.setItem(KEYS.STATE_LOGS, JSON.stringify(cappedLogs));
  } catch (error) {
    console.error('Failed to write debugging tracking metrics stream:', error);
  }
};

/**
 * Commits a processed candidate trip waiting for user validation.
 * Utilizes the hybrid layout to match user cloud authentication.
 */
export const addPendingTrip = async (trip: PendingTrip): Promise<void> => {
  if (isCloudUser()) {
    // Explicitly set document ID using the generated UUID to simplify state transitions
    await firestore()
      .collection('pending_trips')
      .doc(trip.id)
      .set({
        ...trip,
        userId: getUid(),
      });
  } else {
    const raw = await AsyncStorage.getItem(KEYS.PENDING_TRIPS);
    const all: PendingTrip[] = raw ? JSON.parse(raw) : [];
    all.push(trip);
    await AsyncStorage.setItem(KEYS.PENDING_TRIPS, JSON.stringify(all));
  }
};

// ---------- PENDING TRIPS ----------

export const getPendingTripById = async (tripId: string): Promise<PendingTrip | null> => {
  if (isCloudUser()) {
    const doc = await firestore().collection('pending_trips').doc(tripId).get();
    if (doc.exists()) {
      return { id: doc.id, ...doc.data() } as PendingTrip;
    }
    return null;
  } else {
    const raw = await AsyncStorage.getItem(KEYS.PENDING_TRIPS);
    if (!raw) return null;
    const all: PendingTrip[] = JSON.parse(raw);
    return all.find(t => t.id === tripId) || null;
  }
};

export const removePendingTrip = async (tripId: string): Promise<void> => {
  if (isCloudUser()) {
    await firestore().collection('pending_trips').doc(tripId).delete();
  } else {
    const raw = await AsyncStorage.getItem(KEYS.PENDING_TRIPS);
    if (raw) {
      const all: PendingTrip[] = JSON.parse(raw);
      const filtered = all.filter(t => t.id !== tripId);
      await AsyncStorage.setItem(KEYS.PENDING_TRIPS, JSON.stringify(filtered));
    }
  }
};

// ---------- STATE LOG (for debug panel) ----------
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
  // Keep last 50 entries only
  const trimmed = log.slice(-50);
  await AsyncStorage.setItem(KEYS.STATE_LOG, JSON.stringify(trimmed));
};



// ---------- DEBUG LOGS ----------

export const getStateLogs = async (): Promise<StateLog[]> => {
  const raw = await AsyncStorage.getItem(KEYS.STATE_LOGS);
  return raw ? JSON.parse(raw) : [];
};

export const clearStateLogs = async (): Promise<void> => {
  await AsyncStorage.removeItem(KEYS.STATE_LOGS);
};

// ---------- UTIL ----------
export const clearAllData = async (): Promise<void> => {
  await AsyncStorage.multiRemove(Object.values(KEYS));
};
