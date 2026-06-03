import {
  haversineKm,
  calculateSpeedKmh,
  isSnapshotValid,
  processSnapshot,
} from "@/lib/detectionEngine";

describe("detectionEngine — distance & speed", () => {
  it("haversine: same point is 0 km", () => {
    expect(haversineKm(0, 0, 0, 0)).toBe(0);
  });

  it("haversine: ~111 km per degree of latitude", () => {
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1);
  });

  it("speed: 0.1 km in 10 s ≈ 36 km/h", () => {
    const a = { latitude: 0, longitude: 0, timestamp: 0 } as any;
    const b = { latitude: 0.0008993, longitude: 0, timestamp: 10000 } as any;
    expect(calculateSpeedKmh(a, b)).toBeCloseTo(36, 0);
  });

  it("speed: zero/negative time returns 0", () => {
    const s = { latitude: 0, longitude: 0, timestamp: 1000 } as any;
    expect(calculateSpeedKmh(s, s)).toBe(0);
  });

  it("snapshot invalid when accuracy worse than 100 m", () => {
    expect(isSnapshotValid({ accuracy: 50 } as any)).toBe(true);
    expect(isSnapshotValid({ accuracy: 150 } as any)).toBe(false);
  });
});

describe("detectionEngine — state machine", () => {
  const config = {
    movementSpeedKmh: 5,
    drivingMinKmh: 15,
    walkingMaxKmh: 10,
    rollingWindowSize: 10,
    consecutiveDrivingRequired: 3,
    consecutiveStoppedRequired: 3,
    validationDurationMs: 300000,
    roadCompensationFactor: 1.15,
  } as any;

  const ctx = (state: string) =>
    ({ state, recentSnapshots: [], stoppedSinceTimestamp: null }) as any;

  it("idle stays idle", () => {
    const r = processSnapshot(
      ctx("idle"),
      { computedSpeedKmh: 50 } as any,
      Date.now(),
      config,
    );
    expect(r.newState).toBe("idle");
  });

  it("monitoring → moving when speed exceeds movement threshold", () => {
    const snap = {
      latitude: 0,
      longitude: 0,
      timestamp: Date.now(),
      computedSpeedKmh: 20,
    } as any;
    const r = processSnapshot(ctx("monitoring"), snap, Date.now(), config);
    expect(r.newState).toBe("moving");
  });
});
