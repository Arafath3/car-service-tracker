import { useState, useEffect } from "react";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
} from "@react-native-firebase/firestore";
import { getServicesForVehicle } from "@/lib/storage";
import { useAuth } from "@/context/AuthContext";
import type { ServiceRecord } from "@/types";

const db = getFirestore(getApp());

export const useServices = (vehicleId: string | undefined) => {
  const { user } = useAuth();
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!vehicleId) {
      setServices([]);
      setLoading(false);
      return;
    }

    let unsubscribeCloud: (() => void) | null = null;
    let isMounted = true;

    const fb = getAuth(getApp()).currentUser;
    if (fb) {
      setLoading(true);
      unsubscribeCloud = onSnapshot(
        query(collection(db, "services"), where("vehicleId", "==", vehicleId)),
        (snap) => {
          if (!isMounted) return;
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as ServiceRecord)
            .sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
            );
          setServices(list);
          setLoading(false);
        },
        (err) => {
          if (!isMounted) return;
          setError(err);
          setLoading(false);
        },
      );
    } else {
      setLoading(true);
      getServicesForVehicle(vehicleId)
        .then((s) => {
          if (!isMounted) return;
          setServices(s);
          setLoading(false);
        })
        .catch((e) => {
          if (!isMounted) return;
          setError(e);
          setLoading(false);
        });
    }

    return () => {
      isMounted = false;
      if (unsubscribeCloud) unsubscribeCloud();
    };
  }, [vehicleId, user?.id, user?.isGuest]);

  return { services, loading, error };
};
