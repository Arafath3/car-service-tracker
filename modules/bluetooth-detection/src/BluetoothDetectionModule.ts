import { NativeModule, requireNativeModule } from "expo";

import { BluetoothDetectionModuleEvents } from "./BluetoothDetection.types";

declare class BluetoothDetectionModule extends NativeModule<BluetoothDetectionModuleEvents> {
  startListening(): void;
  stopListening(): void;
}

export default requireNativeModule<BluetoothDetectionModule>(
  "BluetoothDetection",
);
