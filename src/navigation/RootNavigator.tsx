import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  NavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import {
  setNavigationRef,
  configureNotificationListeners,
} from '../utils/notificationSetup';

import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { AddVehicleScreen } from '../screens/AddVehicleScreen';
import { VehicleDetailScreen } from '../screens/VehicleDetailScreen';
import { TrackTripScreen } from '../screens/TrackTripScreen';
import { AddServiceScreen } from '../screens/AddServiceScreen';
import { PassiveDetectionScreen } from '../screens/PassiveDetectionScreen';
import { ConfirmTripScreen } from '../screens/ConfirmTripScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.bgElevated,
    text: theme.colors.textPrimary,
    border: theme.colors.border,
    primary: theme.colors.accent,
  },
};

export const RootNavigator: React.FC = () => {
  const { user, loading } = useAuth();
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    setNavigationRef(navRef.current);
    const unsubscribe = configureNotificationListeners();
    return () => {
      unsubscribe();
      setNavigationRef(null);
    };
  }, [navRef.current]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={navTheme}
      ref={navRef}
      onReady={() => setNavigationRef(navRef.current)}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen
              name="AddVehicle"
              component={AddVehicleScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} />
            <Stack.Screen
              name="TrackTrip"
              component={TrackTripScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="AddService"
              component={AddServiceScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen name="PassiveDetection" component={PassiveDetectionScreen} />
            <Stack.Screen
              name="ConfirmTrip"
              component={ConfirmTripScreen}
              options={{ presentation: 'modal' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
