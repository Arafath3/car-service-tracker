import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';

// IMPORTANT: This import registers the background task with TaskManager.
// It must happen at module load time, BEFORE any UI renders, so the OS
// can wake the app and call our task even if no screens are mounted.
import './src/utils/passiveDetectionService';

// This import sets up notification display and tap handling.
import './src/utils/notificationSetup';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
