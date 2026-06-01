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
}

export default requireNativeModule<BluetoothDetectionModule>(
  "BluetoothDetection",
);
