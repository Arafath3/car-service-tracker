import { useState, useEffect } from 'react';
import auth from '@react-native-firebase/auth';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';

export function useAuth() {
  const [initializing, setInitializing] = useState(true);
const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);

  // Handle user state changes
  useEffect(() => {
    const subscriber = auth().onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (initializing) setInitializing(false);
    });
    return subscriber; // unsubscribe on unmount
  }, [initializing]);

  // Sign Up function
  const signUp = async (email: string, password:string) => {
    try {
      await auth().createUserWithEmailAndPassword(email, password);
    } catch (error) {
      handleAuthError(error);
    }
  };

  // Sign In function
  const signIn = async (email:string, password:string) => {
    try {
      await auth().signInWithEmailAndPassword(email, password);
    } catch (error) {
      handleAuthError(error);
    }
  };

  // Sign Out function
  const signOut = async () => {
    try {
      await auth().signOut();
    } catch (error) {
      console.error("Sign out error: ", error);
    }
  };

  // Centralized Error Handling
  const handleAuthError = (error:any) => {
    if (error.code === 'auth/email-already-in-use') {
      alert('That email address is already in use!');
    } else if (error.code === 'auth/invalid-email') {
      alert('That email address is invalid!');
    } else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
      alert('Invalid email or password.');
    } else {
      alert(error.message);
    }
    throw error;
  };

  return { user, initializing, signUp, signIn, signOut };
}