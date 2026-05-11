import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import type { User } from '@/types';
import {
  getCurrentUser,
  setCurrentUser,
  getUsers,
  saveUsers,
} from '@/lib/storage';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const simpleHash = (input: string): string => {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return `h_${hash}_${input.length}`;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const u = await getCurrentUser();
        setUser(u);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login: AuthContextValue['login'] = async (username, password) => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || !password) {
      return { success: false, error: 'Username and password required' };
    }
    const users = await getUsers();
    const found = users.find((u) => u.username === trimmed);
    if (!found) return { success: false, error: 'User not found' };
    if (found.passwordHash !== simpleHash(password)) {
      return { success: false, error: 'Incorrect password' };
    }
    await setCurrentUser(found);
    setUser(found);
    return { success: true };
  };

  const signup: AuthContextValue['signup'] = async (username, password) => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || !password) {
      return { success: false, error: 'Username and password required' };
    }
    if (trimmed.length < 3) return { success: false, error: 'Username too short (min 3)' };
    if (password.length < 4) return { success: false, error: 'Password too short (min 4)' };
    const users = await getUsers();
    if (users.find((u) => u.username === trimmed)) {
      return { success: false, error: 'Username already exists' };
    }
    const newUser: User = {
      id: uuidv4(),
      username: trimmed,
      passwordHash: simpleHash(password),
      isGuest: false,
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    await saveUsers(users);
    await setCurrentUser(newUser);
    setUser(newUser);
    return { success: true };
  };

  const loginAsGuest = async () => {
    const guestUser: User = {
      id: 'guest_' + uuidv4(),
      username: 'guest',
      passwordHash: '',
      isGuest: true,
      createdAt: new Date().toISOString(),
    };
    await setCurrentUser(guestUser);
    setUser(guestUser);
  };

  const logout = async () => {
    await setCurrentUser(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, loginAsGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
