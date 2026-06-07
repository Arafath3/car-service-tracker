import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  getUnitSystem,
  setUnitSystem as persistUnitSystem,
} from "@/lib/storage";
import type { UnitSystem } from "@/lib/units";

interface UnitContextValue {
  system: UnitSystem;
  ready: boolean; // false until the stored value has loaded
  hasChosen: boolean; // false until the user has explicitly picked (drives onboarding)
  setSystem: (s: UnitSystem) => Promise<void>;
}

const UnitContext = createContext<UnitContextValue | undefined>(undefined);

const CHOSEN_KEY_HINT = "unitSystem"; // same key storage.ts uses

export const UnitProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [system, setSystemState] = useState<UnitSystem>("metric");
  const [ready, setReady] = useState(false);
  const [hasChosen, setHasChosen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await getUnitSystem(); // returns "metric" default if unset
      const explicit = await hasExplicitChoice(); // see storage helper below
      if (!mounted) return;
      setSystemState(stored);
      setHasChosen(explicit);
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setSystem = useCallback(async (s: UnitSystem) => {
    await persistUnitSystem(s);
    setSystemState(s);
    setHasChosen(true);
  }, []);

  return (
    <UnitContext.Provider value={{ system, ready, hasChosen, setSystem }}>
      {children}
    </UnitContext.Provider>
  );
};

export const useUnits = (): UnitContextValue => {
  const ctx = useContext(UnitContext);
  if (!ctx) throw new Error("useUnits must be used within a UnitProvider");
  return ctx;
};

// local helper kept here to avoid touching storage.ts shape unnecessarily
import AsyncStorage from "@react-native-async-storage/async-storage";
const hasExplicitChoice = async (): Promise<boolean> => {
  const raw = await AsyncStorage.getItem(CHOSEN_KEY_HINT);
  return raw === "metric" || raw === "imperial";
};
