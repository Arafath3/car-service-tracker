import type {
  ServiceInterval,
  Vehicle,
  ServiceRecord,
  VehicleEstimation,
} from "@/types";

export const CAR_SERVICE_INTERVALS: ServiceInterval[] = [
  {
    serviceType: "Oil & Filter Change",
    intervalKm: 10000,
    description: "Engine oil and filter replacement",
    intervalMonths: 12,
  },
  {
    serviceType: "Tire Rotation",
    intervalKm: 8000,
    description: "Rotate tires for even wear",
  },
  {
    serviceType: "Air Filter",
    intervalKm: 25000,
    description: "Replace cabin and engine air filter",
  },
  {
    serviceType: "Brake Inspection",
    intervalKm: 20000,
    description: "Inspect brake pads and discs",
  },
  {
    serviceType: "Brake Fluid",
    intervalKm: 40000,
    description: "Replace brake fluid",
    intervalMonths: 24,
  },
  {
    serviceType: "Coolant Flush",
    intervalKm: 60000,
    description: "Flush and replace engine coolant",
    intervalMonths: 48,
  },
  {
    serviceType: "Spark Plugs",
    intervalKm: 50000,
    description: "Replace spark plugs",
  },
  {
    serviceType: "Transmission Fluid",
    intervalKm: 80000,
    description: "Replace transmission fluid",
  },
  {
    serviceType: "Major Service",
    intervalKm: 100000,
    description: "Comprehensive vehicle inspection",
  },
];

export const MOTORBIKE_SERVICE_INTERVALS: ServiceInterval[] = [
  {
    serviceType: "Oil & Filter Change",
    intervalKm: 6000,
    description: "Engine oil and filter replacement",
    intervalMonths: 12,
  },
  {
    serviceType: "Chain Lubrication",
    intervalKm: 800,
    description: "Clean and lubricate chain",
  },
  {
    serviceType: "Chain Tension Check",
    intervalKm: 4000,
    description: "Adjust chain tension",
  },
  {
    serviceType: "Brake Inspection",
    intervalKm: 8000,
    description: "Inspect brake pads and discs",
  },
  {
    serviceType: "Air Filter",
    intervalKm: 15000,
    description: "Clean or replace air filter",
  },
  {
    serviceType: "Spark Plugs",
    intervalKm: 20000,
    description: "Replace spark plugs",
  },
  {
    serviceType: "Valve Clearance",
    intervalKm: 25000,
    description: "Check and adjust valve clearance",
  },
  {
    serviceType: "Coolant",
    intervalKm: 30000,
    description: "Replace coolant (liquid-cooled bikes)",
    intervalMonths: 24,
  },
];

export const getBaseIntervals = (
  vehicleType: "car" | "motorbike",
): ServiceInterval[] =>
  vehicleType === "car" ? CAR_SERVICE_INTERVALS : MOTORBIKE_SERVICE_INTERVALS;

// Returns the merged interval list (base + custom) for a vehicle,
// with per-vehicle km overrides applied.
export const getServiceIntervals = (vehicle: Vehicle): ServiceInterval[] => {
  const base = getBaseIntervals(vehicle.type);
  const custom = vehicle.customServiceTypes ?? [];
  return [...base, ...custom].map((iv) => ({
    ...iv,
    intervalKm: vehicle.customIntervals?.[iv.serviceType] ?? iv.intervalKm,
  }));
};

export interface ServiceStatus {
  serviceType: string;
  intervalKm: number;
  description: string;
  lastDoneAt: number | null;
  nextDueAt: number;
  kmRemaining: number;
  nextDueDate?: string;
  daysRemaining?: number;
  source:
    | "default"
    | "sticker"
    | "custom-interval"
    | "custom-service"
    | "estimated";
  status: "overdue" | "due-soon" | "ok" | "never-done";
  progressPercent: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Treats estimation result as a synthetic "last service" record if no real one exists.
const getEffectiveLastService = (
  vehicle: Vehicle,
  serviceType: string,
  realRecords: ServiceRecord[],
): { odometer: number; date: string; source: "real" | "estimated" } | null => {
  const matchingReal = realRecords
    .filter((s) => s.serviceType === serviceType)
    .sort((a, b) => b.odometer - a.odometer);
  if (matchingReal.length > 0) {
    return {
      odometer: matchingReal[0].odometer,
      date: matchingReal[0].date,
      source: "real",
    };
  }
  // Fall back to estimation if available (oil change only by default)
  const est = vehicle.estimation;
  if (
    est &&
    est.status !== "manual" &&
    est.estimatedLastServiceOdometer != null &&
    serviceType === "Oil & Filter Change"
  ) {
    const monthsAgo = est.roughIntervalMonths;
    const estDate = new Date(
      Date.now() - monthsAgo * 30 * DAY_MS,
    ).toISOString();
    return {
      odometer: est.estimatedLastServiceOdometer,
      date: estDate,
      source: "estimated",
    };
  }
  return null;
};

export const calculateServiceStatuses = (
  vehicle: Vehicle,
  services: ServiceRecord[],
): ServiceStatus[] => {
  const intervals = getServiceIntervals(vehicle);
  const now = Date.now();

  return intervals.map((interval) => {
    const matchingReal = services
      .filter((s) => s.serviceType === interval.serviceType)
      .sort((a, b) => b.odometer - a.odometer);

    const lastReal = matchingReal[0];
    const effective = getEffectiveLastService(
      vehicle,
      interval.serviceType,
      services,
    );

    // ---- Resolve next due odometer ----
    let nextDueAt: number;
    let nextDueDate: string | undefined;
    let source: ServiceStatus["source"] = "default";

    if (lastReal?.nextDueOdometer != null) {
      // Mechanic sticker overrides
      nextDueAt = lastReal.nextDueOdometer;
      nextDueDate = lastReal.nextDueDate;
      source = "sticker";
    } else if (effective) {
      nextDueAt = effective.odometer + interval.intervalKm;
      if (interval.intervalMonths) {
        const base = new Date(effective.date).getTime();
        nextDueDate = new Date(
          base + interval.intervalMonths * 30 * DAY_MS,
        ).toISOString();
      }
      if (effective.source === "estimated") source = "estimated";
      else if (
        vehicle.customServiceTypes?.some(
          (c) => c.serviceType === interval.serviceType,
        )
      ) {
        source = "custom-service";
      } else if (vehicle.customIntervals?.[interval.serviceType] != null) {
        source = "custom-interval";
      }
    } else {
      // Never done -> base off starting odometer
      nextDueAt = vehicle.startingOdometer + interval.intervalKm;
    }

    const kmRemaining = nextDueAt - vehicle.currentOdometer;
    const daysRemaining = nextDueDate
      ? Math.ceil((new Date(nextDueDate).getTime() - now) / DAY_MS)
      : undefined;

    // ---- Status calc considers BOTH km and date ----
    let status: ServiceStatus["status"];
    if (!effective) {
      status = kmRemaining <= 0 ? "overdue" : "never-done";
    } else {
      const kmOverdue = kmRemaining <= 0;
      const dateOverdue = daysRemaining != null && daysRemaining <= 0;
      const kmDueSoon =
        kmRemaining > 0 && kmRemaining <= interval.intervalKm * 0.1;
      const dateDueSoon =
        daysRemaining != null && daysRemaining > 0 && daysRemaining <= 30;

      if (kmOverdue || dateOverdue) status = "overdue";
      else if (kmDueSoon || dateDueSoon) status = "due-soon";
      else status = "ok";
    }

    const lastDoneAt = effective ? effective.odometer : null;

    // Progress: take the closer of km% and date%
    const kmProgress = effective
      ? Math.max(
          0,
          Math.min(
            1,
            (vehicle.currentOdometer - effective.odometer) /
              interval.intervalKm,
          ),
        )
      : 0;
    const dateProgress =
      nextDueDate && effective && interval.intervalMonths
        ? Math.max(
            0,
            Math.min(
              1,
              (now - new Date(effective.date).getTime()) /
                (interval.intervalMonths * 30 * DAY_MS),
            ),
          )
        : 0;
    const progressPercent = Math.round(
      Math.max(kmProgress, dateProgress) * 100,
    );

    return {
      serviceType: interval.serviceType,
      intervalKm: interval.intervalKm,
      description: interval.description,
      lastDoneAt,
      nextDueAt,
      kmRemaining,
      nextDueDate,
      daysRemaining,
      source,
      status,
      progressPercent,
    };
  });
};

// Called when the user finishes the 2-week observation (or whenever app re-opens
// and the observation window has elapsed). Computes estimated daily km from
// trips that occurred during the window and back-fills the estimated last
// service odometer.
export const finalizeEstimation = (
  vehicle: Vehicle,
  totalKmDuringWindow: number,
): VehicleEstimation | null => {
  const est = vehicle.estimation;
  if (!est || est.status !== "pending_observation") return null;

  const start = new Date(est.observationStartedAt).getTime();
  const now = Date.now();
  const daysElapsed = Math.max(1, (now - start) / DAY_MS);

  const dailyKm =
    totalKmDuringWindow > 0 ? totalKmDuringWindow / daysElapsed : 30; // fallback
  const daysSinceRough = est.roughIntervalMonths * 30;
  const estimatedLastServiceOdometer = Math.max(
    0,
    vehicle.currentOdometer - dailyKm * daysSinceRough,
  );

  return {
    ...est,
    status: "complete",
    observationCompletedAt: new Date().toISOString(),
    estimatedDailyKm: parseFloat(dailyKm.toFixed(1)),
    estimatedLastServiceOdometer: Math.round(estimatedLastServiceOdometer),
  };
};

// Import this helper from VehicleEstimation type
