import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import type {
  Vehicle,
  ServiceRecord,
  Trip,
  DetectionContext,
  PendingTrip,
  DetectionConfig,
} from '@/types';

const KEYS = {
  VEHICLES: '@st_vehicles',
  SERVICES: '@st_services',
  TRIPS: '@st_trips',
  DETECTION_CONTEXT: '@st_detection_ctx',
  DETECTION_CONFIG: '@st_detection_config',
  PENDING_TRIPS: '@st_pending_trips',
  STATE_LOG: '@st_state_log',
};

const isCloudUser = (): boolean => !!auth().currentUser;
const getUid = (): string => {
  const u = auth().currentUser;
  if (!u) throw new Error('getUid called without an authenticated user');
  return u.uid;
};

// ---------- VEHICLES (HYBRID) ----------
export const getVehicles = async (): Promise<Vehicle[]> => {
  if (isCloudUser()) {
    const snap = await firestore()
      .collection('vehicles')
      .where('userId', '==', getUid())
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vehicle));
  }
  const raw = await AsyncStorage.getItem(KEYS.VEHICLES);
  return raw ? JSON.parse(raw) : [];
};

export const getVehiclesForUser = async (userId: string): Promise<Vehicle[]> => {
  if (isCloudUser()) return getVehicles();
  const all = await getVehicles();
  return all.filter((v) => v.userId === userId);
};

export const saveVehicles = async (vehicles: Vehicle[]): Promise<void> => {
  if (isCloudUser()) return;
  await AsyncStorage.setItem(KEYS.VEHICLES, JSON.stringify(vehicles));
};

export const addVehicle = async (
  vehicle: Omit<Vehicle, 'id' | 'userId'> & { id?: string; userId?: string }
): Promise<string> => {
  const id = vehicle.id ?? uuidv4();
  if (isCloudUser()) {
    const { id: _i, userId: _u, ...data } = vehicle;
    await firestore()
      .collection('vehicles')
      .doc(id)
      .set({ ...data, userId: getUid() });
    return id;
  }
  const all = await getVehicles();
  all.push({ ...vehicle, id, userId: vehicle.userId ?? 'guest_local' } as Vehicle);
  await AsyncStorage.setItem(KEYS.VEHICLES, JSON.stringify(all));
  return id;
};

export const updateVehicle = async (vehicle: Vehicle): Promise<void> => {
  if (isCloudUser()) {
    const { id, ...data } = vehicle;
    await firestore().collection('vehicles').doc(id).update(data);
    return;
  }
  const all = await getVehicles();
  const idx = all.findIndex((v) => v.id === vehicle.id);
  if (idx >= 0) {
    all[idx] = vehicle;
    await AsyncStorage.setItem(KEYS.VEHICLES, JSON.stringify(all));
  }
};

export const deleteVehicle = async (vehicleId: string): Promise<void> => {
  if (isCloudUser()) {
    const batch = firestore().batch();
    batch.delete(firestore().collection('vehicles').doc(vehicleId));
    const services = await firestore()
      .collection('services')
      .where('vehicleId', '==', vehicleId)
      .get();
    services.forEach((s) => batch.delete(s.ref));
    await batch.commit();
  } else {
    const all = await getVehicles();
    await AsyncStorage.setItem(
      KEYS.VEHICLES,
      JSON.stringify(all.filter((v) => v.id !== vehicleId))
    );
    const services = await getLocalServices();
    await AsyncStorage.setItem(
      KEYS.SERVICES,
      JSON.stringify(services.filter((s) => s.vehicleId !== vehicleId))
    );
  }
  const trips = await getTrips();
  await saveTrips(trips.filter((t) => t.vehicleId !== vehicleId));
  const pending = await getPendingTrips();
  await savePendingTrips(pending.filter((t) => t.vehicleId !== vehicleId));
};

// ---------- SERVICES (HYBRID) ----------
const getLocalServices = async (): Promise<ServiceRecord[]> => {
  const raw = await AsyncStorage.getItem(KEYS.SERVICES);
  return raw ? JSON.parse(raw) : [];
};

export const getServices = async (): Promise<ServiceRecord[]> => {
  if (isCloudUser()) return [];
  return getLocalServices();
};

export const saveServices = async (services: ServiceRecord[]): Promise<void> => {
  if (isCloudUser()) return;
  await AsyncStorage.setItem(KEYS.SERVICES, JSON.stringify(services));
};

export const getServicesForVehicle = async (
  vehicleId: string
): Promise<ServiceRecord[]> => {
  if (isCloudUser()) {
    const snap = await firestore()
      .collection('services')
      .where('vehicleId', '==', vehicleId)
      .get();
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as ServiceRecord))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  const all = await getLocalServices();
  return all
    .filter((s) => s.vehicleId === vehicleId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const addService = async (
  service: Omit<ServiceRecord, 'id'> & { id?: string }
): Promise<string> => {
  const id = service.id ?? uuidv4();
  if (isCloudUser()) {
    const { id: _i, ...data } = service;
    await firestore().collection('services').doc(id).set(data);
    return id;
  }
  const all = await getLocalServices();
  all.push({ ...service, id } as ServiceRecord);
  await AsyncStorage.setItem(KEYS.SERVICES, JSON.stringify(all));
  return id;
};

// ---------- TRIPS (LOCAL ONLY) ----------
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

// ---------- DETECTION CONTEXT (LOCAL ONLY) ----------
export const getDetectionContext = async (): Promise<DetectionContext | null> => {
  const raw = await AsyncStorage.getItem(KEYS.DETECTION_CONTEXT);
  return raw ? JSON.parse(raw) : null;
};
export const saveDetectionContext = async (ctx: DetectionContext): Promise<void> => {
  await AsyncStorage.setItem(KEYS.DETECTION_CONTEXT, JSON.stringify(ctx));
};

// ---------- DETECTION CONFIG (LOCAL ONLY) ----------
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
export const DEMO_DETECTION_CONFIG: DetectionConfig = {
  drivingMinKmh: 3,
  walkingMaxKmh: 1,
  movementSpeedKmh: 0.5,
  consecutiveDrivingRequired: 1,
  consecutiveStoppedRequired: 1,
  validationDurationMs: 30 * 1000,
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

// ---------- PENDING TRIPS (LOCAL ONLY) ----------
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

// ---------- STATE LOG (LOCAL ONLY) ----------
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
  await AsyncStorage.setItem(KEYS.STATE_LOG, JSON.stringify(log.slice(-100)));
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