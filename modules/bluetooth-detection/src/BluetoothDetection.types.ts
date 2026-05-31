export type BluetoothDevicePayload = {
  name: string;
  address: string;
};

export type PairedDevice = {
  name: string;
  address: string;
};

export type BluetoothDetectionModuleEvents = {
  onBluetoothConnected: (params: BluetoothDevicePayload) => void;
  onBluetoothDisconnected: (params: BluetoothDevicePayload) => void;
};
