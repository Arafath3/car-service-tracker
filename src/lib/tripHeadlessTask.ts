import { getVehicles, getAutoDetectionEnabled } from "@/lib/storage";
import {
  startPassiveDetection,
  finalizeCurrentTripAndStop,
} from "@/lib/passiveDetectionService";

export const tripDetectionTask = async (data: {
  address?: string;
  event?: string;
}) => {
  console.log(
    "[Headless] task ran! event:",
    data?.event,
    "address:",
    data?.address,
  );

  const address = data?.address;
  const event = data?.event;
  if (!address) return;

  if (!(await getAutoDetectionEnabled())) {
    console.log("[Headless] auto-detection off, ignoring");
    return;
  }

  const vehicles = await getVehicles();
  const match = vehicles.find(
    (v) => v.bluetoothAddress?.toLowerCase() === address.toLowerCase(),
  );
  if (!match) {
    console.log("[Headless] no linked vehicle for", address);
    return;
  }

  if (event === "appeared") {
    await new Promise((r) => setTimeout(r, 1500)); // let the headless FGS settle
    console.log("[Headless] starting detection for", match.make, match.model);
    try {
      const result = await startPassiveDetection(match.id);
      console.log(
        "[Headless] startPassiveDetection result:",
        JSON.stringify(result),
      );
    } catch (e) {
      console.log("[Headless] startPassiveDetection THREW:", String(e));
    }
  }
};
