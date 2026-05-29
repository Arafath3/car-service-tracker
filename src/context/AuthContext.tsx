import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { getApp } from "@react-native-firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  FirebaseAuthTypes,
} from "@react-native-firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import type { User } from "@/types";

const GUEST_KEY = "@st_guest_user";
const authInstance = getAuth(getApp());

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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(authInstance, async (fb) => {
      if (fb) {
        await AsyncStorage.removeItem(GUEST_KEY);
        setUser(mapFirebaseUser(fb));
      } else {
        const raw = await AsyncStorage.getItem(GUEST_KEY);
        setUser(raw ? JSON.parse(raw) : null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loginAsGuest = async () => {
    const guest: User = {
      id: "guest_" + uuidv4(),
      email: null,
      displayName: "Guest",
      isGuest: true,
      createdAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(GUEST_KEY, JSON.stringify(guest));
    setUser(guest);
  };

  const logout = async () => {
    if (authInstance.currentUser) await signOut(authInstance);
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
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
