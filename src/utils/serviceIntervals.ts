import { ServiceInterval, Vehicle, ServiceRecord } from '../types';

// Standard service intervals - in real app this would come from AI API
export const CAR_SERVICE_INTERVALS: ServiceInterval[] = [
  { serviceType: 'Oil & Filter Change', intervalKm: 10000, description: 'Engine oil and filter replacement' },
  { serviceType: 'Tire Rotation', intervalKm: 8000, description: 'Rotate tires for even wear' },
  { serviceType: 'Air Filter', intervalKm: 25000, description: 'Replace cabin and engine air filter' },
  { serviceType: 'Brake Inspection', intervalKm: 20000, description: 'Inspect brake pads and discs' },
  { serviceType: 'Brake Fluid', intervalKm: 40000, description: 'Replace brake fluid' },
  { serviceType: 'Coolant Flush', intervalKm: 60000, description: 'Flush and replace engine coolant' },
  { serviceType: 'Spark Plugs', intervalKm: 50000, description: 'Replace spark plugs' },
  { serviceType: 'Transmission Fluid', intervalKm: 80000, description: 'Replace transmission fluid' },
  { serviceType: 'Major Service', intervalKm: 100000, description: 'Comprehensive vehicle inspection' },
];

export const MOTORBIKE_SERVICE_INTERVALS: ServiceInterval[] = [
  { serviceType: 'Oil & Filter Change', intervalKm: 6000, description: 'Engine oil and filter replacement' },
  { serviceType: 'Chain Lubrication', intervalKm: 800, description: 'Clean and lubricate chain' },
  { serviceType: 'Chain Tension Check', intervalKm: 4000, description: 'Adjust chain tension' },
  { serviceType: 'Brake Inspection', intervalKm: 8000, description: 'Inspect brake pads and discs' },
  { serviceType: 'Air Filter', intervalKm: 15000, description: 'Clean or replace air filter' },
  { serviceType: 'Spark Plugs', intervalKm: 20000, description: 'Replace spark plugs' },
  { serviceType: 'Valve Clearance', intervalKm: 25000, description: 'Check and adjust valve clearance' },
  { serviceType: 'Coolant', intervalKm: 30000, description: 'Replace coolant (liquid-cooled bikes)' },
];

export const getServiceIntervals = (vehicleType: 'car' | 'motorbike'): ServiceInterval[] => {
  return vehicleType === 'car' ? CAR_SERVICE_INTERVALS : MOTORBIKE_SERVICE_INTERVALS;
};

export interface ServiceStatus {
  serviceType: string;
  intervalKm: number;
  description: string;
  lastDoneAt: number | null;
  nextDueAt: number;
  kmRemaining: number;
  status: 'overdue' | 'due-soon' | 'ok' | 'never-done';
  progressPercent: number;
}

export const calculateServiceStatuses = (
  vehicle: Vehicle,
  services: ServiceRecord[]
): ServiceStatus[] => {
  const intervals = getServiceIntervals(vehicle.type);
  return intervals.map((interval) => {
    const matching = services
      .filter((s) => s.serviceType === interval.serviceType)
      .sort((a, b) => b.odometer - a.odometer);

    const lastDoneAt = matching.length > 0 ? matching[0].odometer : null;
    const nextDueAt =
      lastDoneAt !== null
        ? lastDoneAt + interval.intervalKm
        : vehicle.startingOdometer + interval.intervalKm;
    const kmRemaining = nextDueAt - vehicle.currentOdometer;

    // Progress percentage from last service to next due
    const baseKm = lastDoneAt !== null ? lastDoneAt : vehicle.startingOdometer;
    const traveledSinceBase = vehicle.currentOdometer - baseKm;
    const progressPercent = Math.min(100, Math.max(0, (traveledSinceBase / interval.intervalKm) * 100));

    let status: ServiceStatus['status'];
    if (lastDoneAt === null && kmRemaining > interval.intervalKm * 0.2) {
      status = 'never-done';
    } else if (kmRemaining <= 0) {
      status = 'overdue';
    } else if (kmRemaining <= interval.intervalKm * 0.1) {
      status = 'due-soon';
    } else {
      status = 'ok';
    }

    return {
      serviceType: interval.serviceType,
      intervalKm: interval.intervalKm,
      description: interval.description,
      lastDoneAt,
      nextDueAt,
      kmRemaining,
      status,
      progressPercent,
    };
  });
};
