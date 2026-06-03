import {
  getBaseIntervals,
  getServiceIntervals,
  calculateServiceStatuses,
} from "@/lib/serviceIntervals";

// minimal builders — `as any` keeps us from filling every field
const carVehicle = (over = {}) =>
  ({
    id: "v1",
    type: "car",
    make: "Mazda",
    model: "3",
    year: 2005,
    startingOdometer: 170000,
    currentOdometer: 177048,
    ...over,
  }) as any;

const oilRecord = (odometer: number, date = new Date().toISOString()) =>
  ({ id: "s1", serviceType: "Oil & Filter Change", odometer, date }) as any;

const find = (statuses: any[], type: string) =>
  statuses.find((s) => s.serviceType === type);

describe("serviceIntervals — interval list", () => {
  it("car base intervals start with a 10,000 km oil change", () => {
    expect(getBaseIntervals("car")[0].intervalKm).toBe(10000);
  });

  it("motorbike base intervals start with a 6,000 km oil change", () => {
    expect(getBaseIntervals("motorbike")[0].intervalKm).toBe(6000);
  });

  it("per-vehicle override replaces the base interval", () => {
    const v = carVehicle({ customIntervals: { "Oil & Filter Change": 5000 } });
    const oil = getServiceIntervals(v).find(
      (i) => i.serviceType === "Oil & Filter Change",
    );
    expect(oil?.intervalKm).toBe(5000);
  });
});

describe("serviceIntervals — due calculation", () => {
  it("matches the real app: oil at 171,648 → 4,600 km left at 177,048", () => {
    const v = carVehicle();
    const statuses = calculateServiceStatuses(v, [oilRecord(171648)]);
    const oil = find(statuses, "Oil & Filter Change");
    expect(oil.nextDueAt).toBe(181648); // 171648 + 10000
    expect(oil.kmRemaining).toBe(4600); // 181648 - 177048
    expect(oil.status).toBe("ok");
  });

  it("flags overdue when the next-due odometer is already passed", () => {
    const v = carVehicle();
    const oil = find(
      calculateServiceStatuses(v, [oilRecord(160000)]),
      "Oil & Filter Change",
    );
    expect(oil.kmRemaining).toBeLessThanOrEqual(0);
    expect(oil.status).toBe("overdue");
  });

  it("flags due-soon within 10% of the interval", () => {
    const v = carVehicle(); // 177048; due at 178000 → 952 km left (< 1000)
    const oil = find(
      calculateServiceStatuses(v, [oilRecord(168000)]),
      "Oil & Filter Change",
    );
    expect(oil.kmRemaining).toBe(952);
    expect(oil.status).toBe("due-soon");
  });

  it("reports never-done for a service with no record", () => {
    const v = carVehicle();
    const tire = find(calculateServiceStatuses(v, []), "Tire Rotation");
    expect(tire.nextDueAt).toBe(178000); // startingOdometer 170000 + 8000
    expect(tire.status).toBe("never-done");
  });
});
