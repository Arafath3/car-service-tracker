import { NativeModule, requireNativeModule } from "expo";

import {
  BluetoothDetectionModuleEvents,
  PairedDevice,
} from "./BluetoothDetection.types";

declare class BluetoothDetectionModule extends NativeModule<BluetoothDetectionModuleEvents> {
  startListening(): void;
  stopListening(): void;
  getPairedDevices(): Promise<PairedDevice[]>;
}

export default requireNativeModule<BluetoothDetectionModule>(
  "BluetoothDetection",
);
