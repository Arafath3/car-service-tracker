import { useState, useEffect } from 'react';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { getServicesForVehicle } from '../utils/storage';
import { ServiceRecord } from '../types';

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
      const currentUser = auth().currentUser;

      if (currentUser) {
        try {
          unsubscribeCloud = firestore()
            .collection('services')
            .where('vehicleId', '==', vehicleId)
            .onSnapshot(
              (snapshot) => {
                if (!isMounted) return;

                const cloudServices = snapshot.docs
                  .map((doc) => ({ id: doc.id, ...doc.data() } as ServiceRecord))
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime()
                  );

                setServices(cloudServices);
                setLoading(false);
              },
              (err) => {
                if (isMounted) {
                  setError(err);
                  setLoading(false);
                }
              }
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