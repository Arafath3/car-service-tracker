import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import type {
  Vehicle, ServiceRecord, Trip, DetectionContext,
  PendingTrip, DetectionConfig,
} from '@/types';

const KEYS = {
  VEHICLES:           '@st_vehicles',          // guest only
  SERVICES:           '@st_services',          // guest only
  TRIPS:              '@st_trips',             // always local
  DETECTION_CONTEXT:  '@st_detection_ctx',     // always local
  DETECTION_CONFIG:   '@st_detection_config',  // always local
  PENDING_TRIPS:      '@st_pending_trips',     // always local
  STATE_LOG:          '@st_state_log',         // always local
};

// --------- AUTH HELPERS ----------
const isCloudUser = (): boolean => !!auth().currentUser;
const getUid = (): string => {
  const u = auth().currentUser;
  if (!u) throw new Error('getUid called without an authenticated user');
  return u.uid;
};

// =================================================================
// VEHICLES (HYBRID)
// =================================================================
export const getVehicles = async (): Promise<Vehicle[]> => {
  if (isCloudUser()) {
    const snap = await firestore()
      .collection('vehicles').where('userId', '==', getUid()).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle));
  }
  const raw = await AsyncStorage.getItem(KEYS.VEHICLES);
  return raw ? JSON.parse(raw) : [];
};

// Same as getVehicles for guests; for cloud users this is already user-scoped.
export const getVehiclesForUser = async (userId: string): Promise<Vehicle[]> => {
  if (isCloudUser()) return getVehicles();
  const all = await getVehicles();
  return all.filter(v => v.userId === userId);
};

export const addVehicle = async (
  vehicle: Omit<Vehicle, 'id' | 'userId'>
): Promise<string> => {
  if (isCloudUser()) {
    const id = uuidv4();
    await firestore().collection('vehicles').doc(id).set({
      ...vehicle, userId: getUid(),
    });
    return id;
  }
  const id = uuidv4();
  const all = await getVehicles();
  all.push({ ...vehicle, id, userId: 'guest_local' } as Vehicle);
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
  const idx = all.findIndex(v => v.id === vehicle.id);
  if (idx >= 0) {
    all[idx] = vehicle;
    await AsyncStorage.setItem(KEYS.VEHICLES, JSON.stringify(all));
  }
};

export const deleteVehicle = async (vehicleId: string): Promise<void> => {
  if (isCloudUser()) {
    // Vehicle + its services (cloud)
    const batch = firestore().batch();
    batch.delete(firestore().collection('vehicles').doc(vehicleId));
    const services = await firestore()
      .collection('services').where('vehicleId', '==', vehicleId).get();
    services.forEach(s => batch.delete(s.ref));
    await batch.commit();
  } else {
    const all = await getVehicles();
    await AsyncStorage.setItem(
      KEYS.VEHICLES, JSON.stringify(all.filter(v => v.id !== vehicleId))
    );
    const services = await getServices();
    await AsyncStorage.setItem(
      KEYS.SERVICES, JSON.stringify(services.filter(s => s.vehicleId !== vehicleId))
    );
  }
  // Trips/pending trips are ALWAYS local — always purge here:
  const trips = await getTrips();
  await saveTrips(trips.filter(t => t.vehicleId !== vehicleId));
  const pending = await getPendingTrips();
  await savePendingTrips(pending.filter(t => t.vehicleId !== vehicleId));
};

// =================================================================
// SERVICES (HYBRID)
// =================================================================
export const getServices = async (): Promise<ServiceRecord[]> => {
  if (isCloudUser()) {
    // services don't carry userId, but they live under vehicles owned by this user;
    // your security rules should enforce that. For listing, prefer per-vehicle reads.
    return [];
  }
  const raw = await AsyncStorage.getItem(KEYS.SERVICES);
  return raw ? JSON.parse(raw) : [];
};

export const getServicesForVehicle = async (
  vehicleId: string
): Promise<ServiceRecord[]> => {
  if (isCloudUser()) {
    const snap = await firestore()
      .collection('services').where('vehicleId', '==', vehicleId).get();
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ServiceRecord))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  const all = await getServices();
  return all
    .filter(s => s.vehicleId === vehicleId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const addService = async (
  service: Omit<ServiceRecord, 'id'>
): Promise<string> => {
  const id = uuidv4();
  if (isCloudUser()) {
    await firestore().collection('services').doc(id).set(service);
    return id;
  }
  const all = await getServices();
  all.push({ ...service, id } as ServiceRecord);
  await AsyncStorage.setItem(KEYS.SERVICES, JSON.stringify(all));
  return id;
};

const saveServices = async (services: ServiceRecord[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.SERVICES, JSON.stringify(services));
};

// =================================================================
// TRIPS (ALWAYS LOCAL — your "GPS stays on the phone" rule)
// =================================================================
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
    .filter(t => t.vehicleId === vehicleId)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
};
export const addTrip = async (trip: Trip): Promise<void> => {
  const all = await getTrips();
  all.push(trip);
  await saveTrips(all);
};
export const updateTrip = async (trip: Trip): Promise<void> => {
  const all = await getTrips();
  const idx = all.findIndex(t => t.id === trip.id);
  if (idx >= 0) { all[idx] = trip; await saveTrips(all); }
};

// =================================================================
// DETECTION CONTEXT / CONFIG / PENDING TRIPS / STATE LOG
// (all ALWAYS local — unchanged from your current src/lib/storage.ts)
// =================================================================
export const getDetectionContext = async (): Promise<DetectionContext | null> => {
  const raw = await AsyncStorage.getItem(KEYS.DETECTION_CONTEXT);
  return raw ? JSON.parse(raw) : null;
};
export const saveDetectionContext = async (ctx: DetectionContext): Promise<void> => {
  await AsyncStorage.setItem(KEYS.DETECTION_CONTEXT, JSON.stringify(ctx));
};

// ... keep getDetectionConfig, saveDetectionConfig, DEFAULT_DETECTION_CONFIG,
//     DEMO_DETECTION_CONFIG, getPendingTrips, savePendingTrips, addPendingTrip,
//     getPendingTripById, removePendingTrip, getAwaitingConfirmation,
//     appendStateLog, getStateLog, clearStateLog, clearAllData
//     EXACTLY as they are in your current src/lib/storage.ts.

export const getPendingTrips = async (): Promise<PendingTrip[]> => {
  const raw = await AsyncStorage.getItem(KEYS.PENDING_TRIPS);
  return raw ? JSON.parse(raw) : [];
};
export const savePendingTrips = async (trips: PendingTrip[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.PENDING_TRIPS, JSON.stringify(trips));
};
// ... etc.

// User helpers removed — Firebase + AuthContext handles this now.
// Delete getUsers, saveUsers, getCurrentUser, setCurrentUser entirely.