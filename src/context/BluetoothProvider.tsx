import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { PermissionsAndroid, Platform } from "react-native";
import BluetoothDetection from "@/../modules/bluetooth-detection/src/BluetoothDetectionModule";
import {
  getVehicles,
  getDetectionContext,
  getAutoDetectionEnabled,
} from "@/lib/storage";
import {
  startPassiveDetection,
  finalizeCurrentTripAndStop,
} from "@/lib/passiveDetectionService";

const BluetoothContext = createContext<{}>({});
export const useBluetooth = () => useContext(BluetoothContext);

export const BluetoothProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const startedRef = useRef(false);

  useEffect(() => {
    let connectedSub: any;
    let disconnectedSub: any;
    let mounted = true;

    const setup = async () => {
      if (Platform.OS === "android" && Platform.Version >= 31) {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        );
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          return;
        }
      }
      if (!mounted) return;

      BluetoothDetection.startListening();
      startedRef.current = true;

      connectedSub = BluetoothDetection.addListener(
        "onBluetoothConnected",
        async (device) => {
          const address = device?.address;
          if (!address) return;
          if (!(await getAutoDetectionEnabled())) return; // master switch off
          const vehicles = await getVehicles();
          const match = vehicles.find((v) => v.bluetoothAddress === address);
          if (!match) {
            return;
          }

          const result = await startPassiveDetection(match.id);
          if (!result.success) {
            console.warn("[BT] auto-start failed:", result.error);
          }
        },
      );

      disconnectedSub = BluetoothDetection.addListener(
        "onBluetoothDisconnected",
        async (device) => {
          const address = device?.address;
          if (!address) return;
          if (!(await getAutoDetectionEnabled())) return;
          const vehicles = await getVehicles();
          const match = vehicles.find((v) => v.bluetoothAddress === address);
          if (!match) return;
          // only finalize if the disconnected vehicle is the one being tracked
          const ctx = await getDetectionContext();
          if (ctx?.selectedVehicleId === match.id) {
            await finalizeCurrentTripAndStop();
          }
        },
      );
    };

    setup();

    return () => {
      mounted = false;
      if (startedRef.current) BluetoothDetection.stopListening();
      connectedSub?.remove();
      disconnectedSub?.remove();
    };
  }, []);

  return (
    <BluetoothContext.Provider value={{}}>{children}</BluetoothContext.Provider>
  );
};
