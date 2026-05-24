import AsyncStorage from '@react-native-async-storage/async-storage';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
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

const isCloudUser = (): boolean => auth().currentUser !== null;

const getUid = (): string => {
  const user = auth().currentUser;
  if (!user) throw new Error('No cloud user found.');
  return user.uid;
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
  if (isCloudUser()) {
    const snapshot = await firestore()
      .collection('vehicles')
      .where('userId', '==', getUid())
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Vehicle));
  }

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

export const addVehicle = async (
  vehicle: Vehicle | Omit<Vehicle, 'id' | 'userId'>
): Promise<void> => {
  const currentOdometer = Number(vehicle.currentOdometer) || 0;

  if (isCloudUser()) {
    await firestore().collection('vehicles').add({
      ...vehicle,
      userId: getUid(),
      currentOdometer,
    });
  } else {
    const all = await getVehicles();

    const newVehicle: Vehicle = {
      ...(vehicle as Vehicle),
      id: (vehicle as Vehicle).id || `local_${Date.now()}`,
      userId: (vehicle as Vehicle).userId || 'guest',
      currentOdometer,
    };

    all.push(newVehicle);
    await saveVehicles(all);
  }
};

export const updateVehicle = async (
  vehicleOrId: Vehicle | string,
  updates?: Partial<Vehicle>
): Promise<void> => {
  if (typeof vehicleOrId === 'string') {
    if (isCloudUser()) {
      await firestore().collection('vehicles').doc(vehicleOrId).update(updates || {});
    } else {
      const all = await getVehicles();
      const idx = all.findIndex((v) => v.id === vehicleOrId);
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...(updates || {}) };
        await saveVehicles(all);
      }
    }
    return;
  }

  const vehicle = vehicleOrId;

  if (isCloudUser()) {
    await firestore().collection('vehicles').doc(vehicle.id).update(vehicle);
  } else {
    const all = await getVehicles();
    const idx = all.findIndex((v) => v.id === vehicle.id);
    if (idx >= 0) {
      all[idx] = vehicle;
      await saveVehicles(all);
    }
  }
};

export const deleteVehicle = async (vehicleId: string): Promise<void> => {
  if (isCloudUser()) {
    const batch = firestore().batch();

    batch.delete(firestore().collection('vehicles').doc(vehicleId));

    const servicesSnapshot = await firestore()
      .collection('services')
      .where('vehicleId', '==', vehicleId)
      .get();

    servicesSnapshot.docs.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();
  } else {
    const allVehicles = await getVehicles();
    await saveVehicles(allVehicles.filter((v) => v.id !== vehicleId));

    const services = await getServices();
    await saveServices(services.filter((s) => s.vehicleId !== vehicleId));

    const trips = await getTrips();
    await saveTrips(trips.filter((t) => t.vehicleId !== vehicleId));
  }
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
  if (isCloudUser()) {
    const snapshot = await firestore()
      .collection('services')
      .where('vehicleId', '==', vehicleId)
      .get();

    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as ServiceRecord))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  const all = await getServices();
  return all
    .filter((s) => s.vehicleId === vehicleId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const addService = async (
  service: ServiceRecord | Omit<ServiceRecord, 'id'>
): Promise<void> => {
  if (isCloudUser()) {
    await firestore().collection('services').add(service);
  } else {
    const all = await getServices();

    const newService: ServiceRecord = {
      ...(service as ServiceRecord),
      id: (service as ServiceRecord).id || `local_srv_${Date.now()}`,
    };

    all.push(newService);
    await saveServices(all);
  }
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

// ---------- PASSIVE TRIP DISTANCE LOGGING ----------
export const logTripDistance = async (
  vehicleId: string,
  distanceKm: number
): Promise<void> => {
  if (isCloudUser()) {
    const batch = firestore().batch();

    const tripRef = firestore().collection('trips').doc();
    batch.set(tripRef, {
      vehicleId,
      date: new Date().toISOString(),
      distanceTraveled: distanceKm,
    });

    const vehicleRef = firestore().collection('vehicles').doc(vehicleId);
    batch.update(vehicleRef, {
      currentOdometer: firestore.FieldValue.increment(distanceKm),
    });

    await batch.commit();
  } else {
    const all = await getVehicles();
    const idx = all.findIndex((v) => v.id === vehicleId);
    if (idx >= 0) {
      all[idx].currentOdometer = (all[idx].currentOdometer || 0) + distanceKm;
      await saveVehicles(all);
    }
  }
};

// ---------- PASSIVE DETECTION CONTEXT ----------
export const getDetectionContext = async (): Promise<DetectionContext | null> => {
  const raw = await AsyncStorage.getItem(KEYS.DETECTION_CONTEXT);
  return raw ? JSON.parse(raw) : null;
};

export const saveDetectionContext = async (ctx: DetectionContext): Promise<void> => {
  await AsyncStorage.setItem(KEYS.DETECTION_CONTEXT, JSON.stringify(ctx));
};

export const clearDetectionContext = async (): Promise<void> => {
  await AsyncStorage.removeItem(KEYS.DETECTION_CONTEXT);
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
  const trimmed = log.slice(-50);
  await AsyncStorage.setItem(KEYS.STATE_LOG, JSON.stringify(trimmed));
};

export const getStateLog = async (): Promise<StateLogEntry[]> => {
  const raw = await AsyncStorage.getItem(KEYS.STATE_LOG);
  return raw ? JSON.parse(raw) : [];
};

export const clearStateLog = async (): Promise<void> => {
  await AsyncStorage.removeItem(KEYS.STATE_LOG);
};

// ---------- UTIL ----------
export const clearAllData = async (): Promise<void> => {
  await AsyncStorage.multiRemove(Object.values(KEYS));
};

export const clearLocalStorageOnly = async (): Promise<void> => {
  await AsyncStorage.multiRemove(Object.values(KEYS));
};