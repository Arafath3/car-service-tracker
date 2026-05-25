import { useState, useEffect } from 'react';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getVehicles, getServicesForVehicle } from '../utils/storage';
import { Vehicle, ServiceRecord } from '../types';

const STORAGE_KEYS = {
  VEHICLES: '@service_tracker_vehicles',
};

// --------------------------------------------------------
// 1. USE VEHICLES HOOK (Handles Guest vs Cloud Real-time Fetching)
// --------------------------------------------------------
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
        // --- CLOUD USER: Stream real-time database snapshots ---
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
        // --- GUEST USER: Fetch from device storage ---
        try {
          const localVehicles = await getVehicles();
          if (isMounted) {
            setVehicles(localVehicles);
            setLoading(false);
          }

          // Optional: Listen to local AsyncStorage changes if changed outside this hook hierarchy
          // Usually handled by re-fetching when the screen focuses, or simple local state management
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
  }, [auth().currentUser]); // Re-run lifecycle if authentication status transitions

  return { vehicles, loading, error };
};