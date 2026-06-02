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
  getBufferedPoints(): Promise<string>;
  clearBufferedPoints(): Promise<void>;
  getBufferedVehicleAddress(): Promise<string>;
  isColdTripComplete(): Promise<boolean>;
}

export default requireNativeModule<BluetoothDetectionModule>(
  "BluetoothDetection",
);
