// src/hooks/useVehicles.ts
import { useState, useEffect } from 'react';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { getVehicles } from '@/lib/storage';
import { useAuth } from '@/context/AuthContext';
import type { Vehicle } from '@/types';

export const useVehicles = () => {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let mounted = true;

    const fb = auth().currentUser;
    if (fb) {
      unsub = firestore()
        .collection('vehicles')
        .where('userId', '==', fb.uid)
        .onSnapshot(
          snap => {
            if (!mounted) return;
            setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle)));
            setLoading(false);
          },
          err => { if (mounted) { setError(err); setLoading(false); } }
        );
    } else {
      // Guest: one-shot local read
      getVehicles()
        .then(v => { if (mounted) { setVehicles(v); setLoading(false); } })
        .catch(e => { if (mounted) { setError(e); setLoading(false); } });
    }

    return () => { mounted = false; unsub?.(); };
  }, [user?.id, user?.isGuest]); // re-run when auth state changes
  
  return { vehicles, loading, error };
};