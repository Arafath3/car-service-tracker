import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  query,
  where,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  increment,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteDoc,
} from "@react-native-firebase/firestore";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import type {
  Vehicle,
  ServiceRecord,
  Trip,
  DetectionContext,
  PendingTrip,
  DetectionConfig,
} from "@/types";
import { UnitSystem } from "./units";
import { safeAwait } from "./asyncWrapper";
const KEYS = {
  VEHICLES: "@st_vehicles",
  SERVICES: "@st_services",
  TRIPS: "@st_trips",
  DETECTION_CONTEXT: "@st_detection_ctx",
  DETECTION_CONFIG: "@st_detection_config",
  PENDING_TRIPS: "@st_pending_trips",
  STATE_LOG: "@st_state_log",
};

const AUTO_DETECT_KEY = "@st_auto_detection";

// Shared modular handles
const db = getFirestore(getApp());
const authInstance = getAuth(getApp());

const isCloudUser = (): boolean => !!authInstance.currentUser;
const getUid = (): string => {
  const u = authInstance.currentUser;
  if (!u) throw new Error("getUid called without an authenticated user");
  return u.uid;
};

// ---------- VEHICLES (HYBRID) ----------
export const getVehicles = async (): Promise<Vehicle[]> => {
  if (isCloudUser()) {
    const uid = getUid();
    const snap = await getDocs(
      query(
        collection(db, "vehicles"),
        where("memberIds", "array-contains", uid),
      ),
    );
    const shared = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Vehicle);

    // Back-compat: older docs created before sharing have userId but no memberIds.
    const legacy = await getDocs(
      query(collection(db, "vehicles"), where("userId", "==", uid)),
    );
    const merged = new Map<string, Vehicle>();
    [
      ...shared,
      ...legacy.docs.map((d) => ({ id: d.id, ...d.data() }) as Vehicle),
    ].forEach((v) => merged.set(v.id!, v));
    return [...merged.values()];
  }
  const raw = await AsyncStorage.getItem(KEYS.VEHICLES);
  return raw ? JSON.parse(raw) : [];
};

// Atomically add distance to the odometer. Safe under concurrent writes from
// multiple members — never use read-modify-write for accumulation.
export const incrementOdometer = async (
  vehicleId: string,
  deltaKm: number,
): Promise<void> => {
  if (isCloudUser()) {
    await updateDoc(doc(db, "vehicles", vehicleId), {
      currentOdometer: increment(deltaKm),
    });
    return;
  }
  // Local/guest: plain read-modify-write is fine (single device).
  const all = await getVehicles();
  const idx = all.findIndex((v) => v.id === vehicleId);
  if (idx >= 0) {
    all[idx] = {
      ...all[idx],
      currentOdometer: (all[idx].currentOdometer ?? 0) + deltaKm,
    };
    await AsyncStorage.setItem(KEYS.VEHICLES, JSON.stringify(all));
  }
};

export const getVehiclesForUser = async (
  userId: string,
): Promise<Vehicle[]> => {
  if (isCloudUser()) return getVehicles();
  const all = await getVehicles();
  return all.filter((v) => v.userId === userId);
};

export const saveVehicles = async (vehicles: Vehicle[]): Promise<void> => {
  if (isCloudUser()) return;
  await AsyncStorage.setItem(KEYS.VEHICLES, JSON.stringify(vehicles));
};

export const addVehicle = async (
  vehicle: Omit<Vehicle, "id" | "userId"> & { id?: string; userId?: string },
): Promise<string> => {
  const id = vehicle.id ?? uuidv4();
  if (isCloudUser()) {
    const { id: _i, userId: _u, ...data } = vehicle;
    const uid = getUid();
    await setDoc(
      doc(db, "vehicles", id),
      stripUndefined({ ...data, userId: uid, ownerId: uid, memberIds: [uid] }),
    );
    return id;
  }
  const all = await getVehicles();
  all.push({
    ...vehicle,
    id,
    userId: vehicle.userId ?? "guest_local",
  } as Vehicle);
  await AsyncStorage.setItem(KEYS.VEHICLES, JSON.stringify(all));
  return id;
};

export const updateVehicle = async (vehicle: Vehicle): Promise<void> => {
  if (isCloudUser()) {
    const { id, ...data } = vehicle;
    await updateDoc(doc(db, "vehicles", id), stripUndefined(data));
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
    const batch = writeBatch(db);
    batch.delete(doc(db, "vehicles", vehicleId));
    const services = await getDocs(
      query(collection(db, "services"), where("vehicleId", "==", vehicleId)),
    );
    services.forEach((s) => batch.delete(s.ref));
    await batch.commit();
  } else {
    const all = await getVehicles();
    await AsyncStorage.setItem(
      KEYS.VEHICLES,
      JSON.stringify(all.filter((v) => v.id !== vehicleId)),
    );
    const services = await getLocalServices();
    await AsyncStorage.setItem(
      KEYS.SERVICES,
      JSON.stringify(services.filter((s) => s.vehicleId !== vehicleId)),
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

export const saveServices = async (
  services: ServiceRecord[],
): Promise<void> => {
  if (isCloudUser()) return;
  await AsyncStorage.setItem(KEYS.SERVICES, JSON.stringify(services));
};

export const getServicesForVehicle = async (
  vehicleId: string,
): Promise<ServiceRecord[]> => {
  if (isCloudUser()) {
    const snap = await getDocs(
      query(collection(db, "services"), where("vehicleId", "==", vehicleId)),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as ServiceRecord)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  const all = await getLocalServices();
  return all
    .filter((s) => s.vehicleId === vehicleId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const addService = async (
  service: Omit<ServiceRecord, "id"> & { id?: string },
): Promise<string> => {
  const id = service.id ?? uuidv4();
  if (isCloudUser()) {
    const { id: _i, ...data } = service;
    await setDoc(doc(db, "services", id), stripUndefined(data));
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
export const getTripsForVehicle = async (
  vehicleId: string,
): Promise<Trip[]> => {
  const all = await getTrips();
  return all
    .filter((t) => t.vehicleId === vehicleId)
    .sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
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
export const getDetectionContext =
  async (): Promise<DetectionContext | null> => {
    const raw = await AsyncStorage.getItem(KEYS.DETECTION_CONTEXT);
    return raw ? JSON.parse(raw) : null;
  };
export const saveDetectionContext = async (
  ctx: DetectionContext,
): Promise<void> => {
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
export const saveDetectionConfig = async (
  cfg: DetectionConfig,
): Promise<void> => {
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
export const getPendingTripById = async (
  id: string,
): Promise<PendingTrip | null> => {
  const all = await getPendingTrips();
  return all.find((t) => t.id === id) || null;
};
export const removePendingTrip = async (id: string): Promise<void> => {
  const all = await getPendingTrips();
  await savePendingTrips(all.filter((t) => t.id !== id));
};
export const getAwaitingConfirmation = async (): Promise<PendingTrip[]> => {
  const all = await getPendingTrips();
  return all.filter((t) => t.status === "awaiting_confirmation");
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

export const stripUndefined = <T extends Record<string, any>>(obj: T): T => {
  const out: Record<string, any> = {};
  Object.keys(obj).forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out as T;
};

// ===================== COMMUNITY DATA SHARING (opt-in) =====================
const COMMUNITY_KEYS = {
  OPT_IN: "@st_share_community_data",
  CONTRIBUTED: "@st_community_contributed",
};
const VALID_MIN_KM = 200;
const VALID_MAX_KM = 300000;

export const getShareCommunityData = async (): Promise<boolean> => {
  const raw = await AsyncStorage.getItem(COMMUNITY_KEYS.OPT_IN);
  return raw === "true";
};

export const setShareCommunityData = async (
  enabled: boolean,
): Promise<void> => {
  await AsyncStorage.setItem(COMMUNITY_KEYS.OPT_IN, enabled ? "true" : "false");
};

const makeModelYearKey = (make: string, model: string, year: number): string =>
  `${make}_${model}_${year}`
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

const getContributedMap = async (): Promise<
  Record<string, Record<string, number>>
> => {
  const raw = await AsyncStorage.getItem(COMMUNITY_KEYS.CONTRIBUTED);
  return raw ? JSON.parse(raw) : {};
};

const saveContributedMap = async (
  map: Record<string, Record<string, number>>,
): Promise<void> => {
  await AsyncStorage.setItem(COMMUNITY_KEYS.CONTRIBUTED, JSON.stringify(map));
};

// Best-effort: shares the vehicle's OVERRIDDEN standard intervals anonymously.
// Uses local delta tracking so re-saves/edits never double-count. Never throws.
export const contributeToCommunity = async (
  vehicle: Vehicle,
): Promise<void> => {
  if (!isCloudUser()) return; // only authed users
  if (!(await getShareCommunityData())) return; // only if opted in

  const key = makeModelYearKey(vehicle.make, vehicle.model, vehicle.year);
  if (!key) return;

  const overrides = vehicle.customIntervals ?? {};
  const map = await getContributedMap();
  const prev = map[vehicle.id] ?? {};

  const intervalsUpdate: Record<string, any> = {};
  let changed = false;
  const allTypes = new Set([...Object.keys(overrides), ...Object.keys(prev)]);

  allTypes.forEach((serviceType) => {
    const newVal = overrides[serviceType];
    const oldVal = prev[serviceType];
    if (newVal != null && (newVal < VALID_MIN_KM || newVal > VALID_MAX_KM))
      return;

    if (newVal != null && oldVal == null) {
      intervalsUpdate[serviceType] = {
        count: increment(1),
        sum: increment(newVal),
      };
      changed = true;
    } else if (newVal != null && oldVal != null && newVal !== oldVal) {
      intervalsUpdate[serviceType] = {
        sum: increment(newVal - oldVal),
      };
      changed = true;
    } else if (newVal == null && oldVal != null) {
      intervalsUpdate[serviceType] = {
        count: increment(-1),
        sum: increment(-oldVal),
      };
      changed = true;
    }
  });

  if (!changed) return;

  try {
    await setDoc(
      doc(db, "community_intervals", key),
      {
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        vehicleType: vehicle.type,
        makeModelYear: key,
        intervals: intervalsUpdate,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    // record what we've now contributed for this vehicle
    const newPrev: Record<string, number> = {};
    Object.keys(overrides).forEach((st) => {
      const v = overrides[st];
      if (v >= VALID_MIN_KM && v <= VALID_MAX_KM) newPrev[st] = v;
    });
    map[vehicle.id] = newPrev;
    await saveContributedMap(map);
  } catch (err) {
    console.warn("[community] contribute failed:", err); // never block the user
  }
};

export interface CommunityInterval {
  serviceType: string;
  meanKm: number;
  count: number;
}

export const getCommunityIntervals = async (
  make: string,
  model: string,
  year: number,
): Promise<CommunityInterval[]> => {
  if (!isCloudUser()) return [];
  const key = makeModelYearKey(make, model, year);
  try {
    const snap = await getDoc(doc(db, "community_intervals", key));
    if (!snap.exists()) return [];
    const intervals = snap.data()?.intervals ?? {};
    const out: CommunityInterval[] = [];
    Object.keys(intervals).forEach((serviceType) => {
      const { count, sum } = intervals[serviceType] ?? {};
      if (count > 0)
        out.push({ serviceType, meanKm: Math.round(sum / count), count });
    });
    return out;
  } catch (err) {
    console.warn("[community] read failed:", err);
    return [];
  }
};

// ----- Global automatic-detection master switch -----

export const getAutoDetectionEnabled = async (): Promise<boolean> => {
  const raw = await AsyncStorage.getItem(AUTO_DETECT_KEY);
  return raw === "true";
};

export const setAutoDetectionEnabled = async (
  enabled: boolean,
): Promise<void> => {
  await AsyncStorage.setItem(AUTO_DETECT_KEY, enabled ? "true" : "false");
};

// in storage.ts — add to your existing settings/profile read/write
export const getUnitSystem = async (): Promise<UnitSystem> => {
  const raw = await AsyncStorage.getItem("unitSystem");
  return raw === "imperial" ? "imperial" : "metric"; // default metric
};

export const setUnitSystem = async (system: UnitSystem): Promise<void> => {
  await AsyncStorage.setItem("unitSystem", system);
};

// --- shared vehicle ----

const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 ambiguity
const INVITE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const makeInviteCode = (len = 6) =>
  Array.from(
    { length: len },
    () => INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)],
  ).join("");

// Owner creates an invite code pointing at one of their vehicles.
export const createInviteCode = async (vehicleId: string): Promise<string> => {
  if (!isCloudUser()) throw new Error("Sign in to share a vehicle.");
  const uid = getUid();
  const vRef = doc(db, "vehicles", vehicleId);
  const vSnap = await getDoc(vRef);
  const data = vSnap.data() as Vehicle | undefined;
  const stale = await getDocs(
    query(
      collection(db, "invites"),
      where("ownerId", "==", uid),
      where("vehicleId", "==", vehicleId),
    ),
  );
  await safeAwait(Promise.all(stale.docs.map((d) => deleteDoc(d.ref))));
  if (data && !data.memberIds) {
    await updateDoc(vRef, {
      ownerId: data.ownerId ?? uid,
      memberIds: [uid],
    });
  }
  // a few retries in case of code collision (vanishingly rare at this scale)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeInviteCode();
    const ref = doc(db, "invites", code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;
    await setDoc(ref, {
      vehicleId,
      ownerId: uid,
      createdAt: serverTimestamp(),
      expiresAt: Date.now() + INVITE_TTL_MS,
    });
    return code;
  }
  throw new Error("Could not generate a code. Try again.");
};

// Joiner redeems a code: adds themselves to the vehicle's memberIds.
export const redeemInviteCode = async (rawCode: string): Promise<Vehicle> => {
  if (!isCloudUser()) throw new Error("Sign in to join a shared vehicle.");
  const uid = getUid();
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new Error("Enter a code.");

  const inviteSnap = await getDoc(doc(db, "invites", code));
  if (!inviteSnap.exists()) throw new Error("That code isn't valid.");

  const data = inviteSnap.data() as { vehicleId: string; expiresAt?: number };
  if (data.expiresAt && Date.now() > data.expiresAt) {
    // best-effort cleanup; ignore failure (rules only let the owner delete)
    await safeAwait(deleteDoc(doc(db, "invites", code)));
    throw new Error("That code has expired. Ask for a new one.");
  }
  const { vehicleId } = data;

  const vehicleRef = doc(db, "vehicles", vehicleId);
  // arrayUnion is idempotent — rejoining is a no-op, not a duplicate.
  await updateDoc(vehicleRef, { memberIds: arrayUnion(uid) });

  const vSnap = await getDoc(vehicleRef);
  return { id: vSnap.id, ...vSnap.data() } as Vehicle;
};

// Anyone can leave; removes only their own UID. No one can remove anyone else.
export const leaveSharedVehicle = async (vehicleId: string): Promise<void> => {
  if (!isCloudUser()) throw new Error("Not a shared vehicle.");
  const uid = getUid();
  await updateDoc(doc(db, "vehicles", vehicleId), {
    memberIds: arrayRemove(uid),
  });
};
