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
import { getServicesForVehicle } from "../lib/storage";
import { ServiceRecord } from "../types";

const db = getFirestore(getApp());

export const useServices = (vehicleId: string | undefined) => {
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

    const setupServiceListener = async () => {
      setLoading(true);
      const currentUser = getAuth(getApp()).currentUser;

      if (currentUser) {
        try {
          unsubscribeCloud = onSnapshot(
            query(
              collection(db, "services"),
              where("vehicleId", "==", vehicleId),
            ),
            (snapshot) => {
              if (!isMounted) return;

              const cloudServices = snapshot.docs
                .map((doc) => ({ id: doc.id, ...doc.data() }) as ServiceRecord)
                .sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime(),
                );

              setServices(cloudServices);
              setLoading(false);
            },
            (err) => {
              if (isMounted) {
                setError(err);
                setLoading(false);
              }
            },
          );
        } catch (err) {
          if (isMounted) {
            setError(err as Error);
            setLoading(false);
          }
        }
      } else {
        try {
          const localServices = await getServicesForVehicle(vehicleId);

          if (isMounted) {
            setServices(localServices);
            setLoading(false);
          }
        } catch (err) {
          if (isMounted) {
            setError(err as Error);
            setLoading(false);
          }
        }
      }
    };

    setupServiceListener();

    return () => {
      isMounted = false;
      if (unsubscribeCloud) unsubscribeCloud();
    };
  }, [vehicleId]);

  return { services, loading, error };
};
