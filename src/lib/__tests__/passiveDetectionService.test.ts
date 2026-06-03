import {
  reconcileColdTrip,
  handleNewLocation,
  LOCATION_TASK_NAME,
} from "../passiveDetectionService";
import BluetoothDetection from "@/../modules/bluetooth-detection/src/BluetoothDetectionModule";
import {
  getDetectionContext,
  saveDetectionContext,
  addPendingTrip,
  getVehicles,
  getDetectionConfig,
} from "../storage";
import { calculateServiceStatuses } from "@/lib/serviceIntervals";

// 💡 ADD THIS FIX HERE: Stops Jest from trying to read the uuid node_module file
jest.mock("uuid", () => ({
  v4: () => "mocked-uuid-1234-5678",
}));

// 1. Mock the Native Module
jest.mock(
  "@/../modules/bluetooth-detection/src/BluetoothDetectionModule",
  () => ({
    isColdTripComplete: jest.fn(),
    getBufferedPoints: jest.fn(),
    getBufferedVehicleAddress: jest.fn(),
    clearBufferedPoints: jest.fn(),
  }),
);

// 2. Mock Storage Layer
jest.mock("../storage", () => ({
  getDetectionContext: jest.fn(),
  saveDetectionContext: jest.fn(),
  addPendingTrip: jest.fn(),
  appendStateLog: jest.fn(),
  getDetectionConfig: jest.fn(),
  getVehicles: jest.fn(),
}));

// 3. Mock Expo / Notifications to prevent environment crashes
jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("expo-location", () => ({}));
jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue(null),
  AndroidNotificationPriority: { HIGH: "high" },
}));

describe("Passive Detection Service — Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("I-01: Cold trip progress guard", () => {
    it("should not reconcile while the cold trip is still in progress", async () => {
      (BluetoothDetection.isColdTripComplete as jest.Mock).mockResolvedValue(
        false,
      );

      await reconcileColdTrip();

      expect(addPendingTrip).not.toHaveBeenCalled();
      expect(BluetoothDetection.clearBufferedPoints).not.toHaveBeenCalled();
    });
  });

  describe("I-02: Completed cold trip processing", () => {
    it("converts a valid buffered cold trip array into a finalized pending trip", async () => {
      (BluetoothDetection.isColdTripComplete as jest.Mock).mockResolvedValue(
        true,
      );

      // Points covering roughly ~0.55 km distance
      const mockPoints = [
        {
          latitude: -37.8136,
          longitude: 144.9631,
          timestamp: 1710000000000,
          speed: 13,
        },
        {
          latitude: -37.8186,
          longitude: 144.9631,
          timestamp: 1710000060000,
          speed: 13,
        },
      ];
      (BluetoothDetection.getBufferedPoints as jest.Mock).mockResolvedValue(
        JSON.stringify(mockPoints),
      );
      (
        BluetoothDetection.getBufferedVehicleAddress as jest.Mock
      ).mockResolvedValue("00:11:22:33:AA:BB");

      (getVehicles as jest.Mock).mockResolvedValue([
        { id: "v-test", bluetoothAddress: "00:11:22:33:aa:bb" },
      ]);
      (getDetectionConfig as jest.Mock).mockResolvedValue({
        roadCompensationFactor: 1.15,
      });

      await reconcileColdTrip();

      expect(addPendingTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicleId: "v-test",
          distanceKm: expect.any(Number), // ~0.55 * 1.15
          status: "awaiting_confirmation",
        }),
      );
      expect(BluetoothDetection.clearBufferedPoints).toHaveBeenCalled();
    });
  });

  describe("I-03: Sub-threshold cold trip rejection", () => {
    it("discards the cold trip and clears buffer if distance traveled is under 0.1km", async () => {
      (BluetoothDetection.isColdTripComplete as jest.Mock).mockResolvedValue(
        true,
      );

      // Jitter points covering barely ~0.01 km
      const tinyPoints = [
        {
          latitude: -37.8136,
          longitude: 144.9631,
          timestamp: 1710000000000,
          speed: 1,
        },
        {
          latitude: -37.8137,
          longitude: 144.9631,
          timestamp: 1710000010000,
          speed: 1,
        },
      ];
      (BluetoothDetection.getBufferedPoints as jest.Mock).mockResolvedValue(
        JSON.stringify(tinyPoints),
      );
      (
        BluetoothDetection.getBufferedVehicleAddress as jest.Mock
      ).mockResolvedValue("00:11:22:33:AA:BB");
      (getVehicles as jest.Mock).mockResolvedValue([
        { id: "v-test", bluetoothAddress: "00:11:22:33:aa:bb" },
      ]);
      (getDetectionConfig as jest.Mock).mockResolvedValue({
        roadCompensationFactor: 1.15,
      });

      await reconcileColdTrip();

      expect(addPendingTrip).not.toHaveBeenCalled();
      expect(BluetoothDetection.clearBufferedPoints).toHaveBeenCalled();
    });
  });

  describe("I-04: handleNewLocation lifecycle validation", () => {
    it("updates tracking state context when a valid moving location snapshot arrives", async () => {
      (getDetectionContext as jest.Mock).mockResolvedValue({
        enabled: true,
        state: "monitoring",
        recentSnapshots: [],
        accumulatedDistanceKm: 0,
        totalSnapshotsTaken: 0,
      });
      (getDetectionConfig as jest.Mock).mockResolvedValue({
        rollingWindowSize: 5,
        roadCompensationFactor: 1.15,
      });

      const mockLocation = {
        coords: {
          latitude: -37.8136,
          longitude: 144.9631,
          accuracy: 5,
          speed: 15,
        },
      };

      await handleNewLocation(mockLocation as any);

      expect(saveDetectionContext).toHaveBeenCalledWith(
        expect.objectContaining({
          state: expect.any(String),
          totalSnapshotsTaken: 1,
        }),
      );
    });
  });

  describe("I-05: Service engine connection validation", () => {
    it("correctly handles engine calculation resets relative to vehicle mileage parameters", () => {
      const vehicle = {
        id: "v1",
        type: "car",
        startingOdometer: 170000,
        currentOdometer: 177048,
      } as any;

      const records = [
        {
          id: "s1",
          serviceType: "Oil & Filter Change",
          odometer: 171648,
          date: new Date().toISOString(),
        },
      ] as any[];

      // Directly integrates calculations with the tracking utility engine matrix
      const engineResult = calculateServiceStatuses(vehicle, records);
      const oilStatus = engineResult.find(
        (s) => s.serviceType === "Oil & Filter Change",
      );

      expect(oilStatus.nextDueAt).toBe(181648);
      expect(oilStatus.kmRemaining).toBe(4600);
    });
  });
});
