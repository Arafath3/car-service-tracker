import { registerWebModule, NativeModule } from 'expo';

import { BluetoothDetectionModuleEvents } from './BluetoothDetection.types';

class BluetoothDetectionModule extends NativeModule<BluetoothDetectionModuleEvents> {
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
}

export default registerWebModule(BluetoothDetectionModule, 'BluetoothDetectionModule');
