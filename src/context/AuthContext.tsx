import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@/types';

const GUEST_KEY = '@st_guest_user';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const mapFirebaseUser = (fb: FirebaseAuthTypes.User): User => ({
  id: fb.uid,
  email: fb.email,
  displayName: fb.displayName,
  isGuest: false,
  createdAt: fb.metadata.creationTime ?? new Date().toISOString(),
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore guest session on cold boot, before Firebase fires
    (async () => {
      const raw = await AsyncStorage.getItem(GUEST_KEY);
      if (raw && !auth().currentUser) setUser(JSON.parse(raw));
    })();

    const unsub = auth().onAuthStateChanged(async (fb) => {
      if (fb) {
        // Cloud login wins — clear guest session
        await AsyncStorage.removeItem(GUEST_KEY);
        setUser(mapFirebaseUser(fb));
      } else {
        // No Firebase user: keep guest if one exists, otherwise null
        const raw = await AsyncStorage.getItem(GUEST_KEY);
        setUser(raw ? JSON.parse(raw) : null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loginAsGuest = async () => {
    const guest: User = {
      id: 'guest_' + uuidv4(),
      email: null,
      displayName: 'Guest',
      isGuest: true,
      createdAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(GUEST_KEY, JSON.stringify(guest));
    setUser(guest);
  };

  const logout = async () => {
    if (auth().currentUser) await auth().signOut();
    await AsyncStorage.removeItem(GUEST_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginAsGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};