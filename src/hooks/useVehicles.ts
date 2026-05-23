import { useState, useEffect } from 'react';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { getVehicles } from '../utils/storage';
import { Vehicle } from '../types';

export const useVehicles = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let unsubscribeCloud: (() => void) | null = null;
    let isMounted = true;

    const setupVehicleListener = async () => {
      setLoading(true);
      const currentUser = auth().currentUser;

      if (currentUser) {
        try {
          unsubscribeCloud = firestore()
            .collection('vehicles')
            .where('userId', '==', currentUser.uid)
            .onSnapshot(
              (snapshot) => {
                if (!isMounted) return;

                const cloudVehicles = snapshot.docs.map(
                  (doc) => ({ id: doc.id, ...doc.data() } as Vehicle)
                );

                setVehicles(cloudVehicles);
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
          const localVehicles = await getVehicles();

          if (isMounted) {
            setVehicles(localVehicles);
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

    setupVehicleListener();

    return () => {
      isMounted = false;
      if (unsubscribeCloud) unsubscribeCloud();
    };
  }, []);

  return { vehicles, loading, error };
};