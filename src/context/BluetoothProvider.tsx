import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { PermissionsAndroid, Platform } from "react-native";
import BluetoothDetection from "@/../modules/bluetooth-detection/src/BluetoothDetectionModule";
import { getVehicles, updateVehicle } from "@/lib/storage";

type LinkCallback = (name: string, address: string) => void;

interface BluetoothContextValue {
  isLinking: boolean;
  startLinking: (vehicleId: string, onLinked: LinkCallback) => void;
  cancelLinking: () => void;
}

const BluetoothContext = createContext<BluetoothContextValue>({
  isLinking: false,
  startLinking: () => {},
  cancelLinking: () => {},
});

export const useBluetooth = () => useContext(BluetoothContext);

export const BluetoothProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const startedRef = useRef(false);
  const linkingRef = useRef<{
    vehicleId: string;
    onLinked: LinkCallback;
  } | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  const startLinking = (vehicleId: string, onLinked: LinkCallback) => {
    linkingRef.current = { vehicleId, onLinked };
    setIsLinking(true);
  };

  const cancelLinking = () => {
    linkingRef.current = null;
    setIsLinking(false);
  };

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
          console.log("[BT] permission not granted; listener not started");
          return;
        }
      }
      if (!mounted) return;

      BluetoothDetection.startListening();
      startedRef.current = true;
      console.log("[BT] provider listening (app-wide)");

      connectedSub = BluetoothDetection.addListener(
        "onBluetoothConnected",
        async (device) => {
          const address = device?.address;
          if (!address) return;

          // LINKING MODE: capture this device for the target vehicle
          if (linkingRef.current) {
            const { vehicleId, onLinked } = linkingRef.current;
            const name = device?.name ?? "Unknown device";
            const vehicles = await getVehicles();
            const v = vehicles.find((x) => x.id === vehicleId);
            if (v) {
              await updateVehicle({
                ...v,
                bluetoothAddress: address,
                bluetoothName: name,
              });
              onLinked(name, address);
              console.log("[BT] LINKED", name, address, "to", v.make, v.model);
            }
            linkingRef.current = null;
            setIsLinking(false);
            return;
          }

          // NORMAL MATCHING
          const vehicles = await getVehicles();
          const match = vehicles.find((v) => v.bluetoothAddress === address);
          if (match) {
            console.log(
              "[BT] MATCHED:",
              match.make,
              match.model,
              "→ would start trip (todo)",
            );
          } else {
            console.log(
              "[BT] not linked, ignoring:",
              device?.name ?? "Unknown",
              address,
            );
          }
        },
      );

      disconnectedSub = BluetoothDetection.addListener(
        "onBluetoothDisconnected",
        async (device) => {
          const address = device?.address;
          if (!address) return;
          const vehicles = await getVehicles();
          const match = vehicles.find((v) => v.bluetoothAddress === address);
          if (match) {
            console.log(
              "[BT] MATCHED disconnect:",
              match.make,
              match.model,
              "→ would finalize trip (todo)",
            );
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
    <BluetoothContext.Provider
      value={{ isLinking, startLinking, cancelLinking }}
    >
      {children}
    </BluetoothContext.Provider>
  );
};
