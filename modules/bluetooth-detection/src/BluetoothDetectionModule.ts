import { NativeModule, requireNativeModule } from "expo";

import {
  BluetoothDetectionModuleEvents,
  PairedDevice,
} from "./BluetoothDetection.types";

declare class BluetoothDetectionModule extends NativeModule<BluetoothDetectionModuleEvents> {
  startListening(): void;
  stopListening(): void;
  getPairedDevices(): Promise<PairedDevice[]>;
  associateVehicle(address: string): Promise<string>;
  getAssociations(): Promise<string[]>;
  disassociateVehicle(address: string): Promise<void>;
  observeVehicle(address: string): Promise<void>;
  startKeepAlive(): void;
  stopKeepAlive(): void;
  // --- cold-trip buffer (per-trip files) ---
  getCompletedTripFiles(): Promise<string[]>;
  readTripFile(name: string): Promise<string>;
  deleteTripFile(name: string): Promise<void>;
  sealStaleActiveTrip(maxAgeMs: number): Promise<void>;
}

export default requireNativeModule<BluetoothDetectionModule>(
  "BluetoothDetection",
);
