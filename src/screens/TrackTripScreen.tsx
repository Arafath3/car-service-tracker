import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { Vehicle, Trip, RootStackParamList } from '../types';
import { useVehicles } from '../utils/useVehicles'; // Our reactive data layer hook
import { addTrip } from '../utils/storage';
import { Button } from '../components/Button';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TrackTrip'>;

// Haversine distance formula - returns km between two GPS points
const haversineKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const TrackTripScreen: React.FC<Props> = ({ route, navigation }) => {
  const { vehicleId } = route.params;
  
  // Stream reactive garage updates and extract our vehicle update handler
  const { vehicles, updateVehicleMeta, loading: loadingVehicles } = useVehicles();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

  const [tracking, setTracking] = useState(false);
  const [distanceKm, setDistanceKm] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<string>('unknown');
  const [error, setError] = useState('');

  const watchSubscription = useRef<Location.LocationSubscription | null>(null);
  const lastLocation = useRef<Location.LocationObject | null>(null);
  const startTime = useRef<Date | null>(null);
  const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const tripIdRef = useRef<string>('');

  // Find and update the local target identity whenever our context cache updates
  useEffect(() => {
    const target = vehicles.find((x) => x.id === vehicleId);
    if (target) {
      setVehicle(target);
    }
  }, [vehicles, vehicleId]);

  useEffect(() => {
    return () => {
      // Direct teardown during unexpected component unmount transitions
      if (watchSubscription.current) watchSubscription.current.remove();
      if (elapsedInterval.current) clearInterval(elapsedInterval.current);
    };
  }, []);

  const requestPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermissionStatus(status);
    return status === 'granted';
  };

  const startTracking = async () => {
    setError('');
    const granted = await requestPermission();
    if (!granted) {
      setError('Location permission denied. Cannot track trip.');
      return;
    }
    if (!vehicle) return;

    // Reset state parameters cleanly
    setDistanceKm(0);
    setElapsedSec(0);
    setCurrentSpeed(0);
    lastLocation.current = null;
    startTime.current = new Date();
    tripIdRef.current = uuidv4();

    // Fire foreground elapsed clock
    elapsedInterval.current = setInterval(() => {
      if (startTime.current) {
        const sec = Math.floor((Date.now() - startTime.current.getTime()) / 1000);
        setElapsedSec(sec);
      }
    }, 1000);

    // Bind GPS watch listener
    try {
      watchSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5, // update every 5 meters
          timeInterval: 2000,  // or every 2 seconds
        },
        (loc) => {
          if (lastLocation.current) {
            const km = haversineKm(
              lastLocation.current.coords.latitude,
              lastLocation.current.coords.longitude,
              loc.coords.latitude,
              loc.coords.longitude
            );
            // Ignore minor background GPS jitter artifacts
            if (km > 0.003) {
              setDistanceKm((prev) => prev + km);
            }
          }
          lastLocation.current = loc;
          // Calculate conversion values cleanly: m/s -> km/h
          const speedKmh = (loc.coords.speed || 0) * 3.6;
          setCurrentSpeed(Math.max(0, speedKmh));
        }
      );
      setTracking(true);
    } catch (e: any) {
      setError('Failed to start GPS engine: ' + (e?.message || 'unknown error'));
    }
  };

  const stopTracking = async () => {
    if (watchSubscription.current) {
      watchSubscription.current.remove();
      watchSubscription.current = null;
    }
    if (elapsedInterval.current) {
      clearInterval(elapsedInterval.current);
      elapsedInterval.current = null;
    }
    setTracking(false);

    if (!vehicle || !startTime.current || distanceKm < 0.01) {
      Alert.alert('Trip too short', 'No meaningful distance recorded. Trip discarded.');
      navigation.goBack();
      return;
    }

    const finalDistance = parseFloat(distanceKm.toFixed(2));
    const newOdometer = vehicle.currentOdometer + finalDistance;

    try {
      // Commit the trip details to history records
      const trip: Trip = {
        id: tripIdRef.current,
        vehicleId: vehicle.id,
        startTime: startTime.current.toISOString(),
        endTime: new Date().toISOString(),
        distanceKm: finalDistance,
        startOdometer: vehicle.currentOdometer,
        endOdometer: newOdometer,
        isActive: false,
      };
      await addTrip(trip);

      // Mutate odometer updates downstream using our stream engine's state mutation tool
      const updatedVehicle: Vehicle = { ...vehicle, currentOdometer: newOdometer };
      await updateVehicleMeta(updatedVehicle);

      Alert.alert(
        'Trip Saved',
        `Distance: ${finalDistance.toFixed(2)} km\nNew odometer: ${newOdometer.toLocaleString()} km`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      console.error('Failed to commit trip log entries safely:', err);
      Alert.alert('Error', 'Could not sync trip changes.');
    }
  };

  const formatTime = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!vehicle && loadingVehicles) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.textPrimary, padding: 20 }}>Loading garage parameters...</Text>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.danger, padding: 20 }}>Vehicle context not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => {
            if (tracking) {
              Alert.alert('Trip in progress', 'Please stop tracking before leaving this panel.', [
                { text: 'OK' },
              ]);
              return;
            }
            navigation.goBack();
          }}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Track Trip</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.vehicleName}>
          {vehicle.nickname || `${vehicle.make} ${vehicle.model}`}
        </Text>

        {/* Big distance display */}
        <View style={styles.distanceCard}>
          <Text style={styles.distanceLabel}>DISTANCE</Text>
          <Text style={styles.distanceValue}>{distanceKm.toFixed(2)}</Text>
          <Text style={styles.distanceUnit}>kilometers</Text>

          {tracking && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>SPEED</Text>
            <Text style={styles.statValue}>{currentSpeed.toFixed(0)}</Text>
            <Text style={styles.statUnit}>km/h</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>TIME</Text>
            <Text style={styles.statValue}>{formatTime(elapsedSec)}</Text>
            <Text style={styles.statUnit}>elapsed</Text>
          </View>
        </View>

        <View style={styles.odoCard}>
          <View style={styles.odoRow}>
            <Text style={styles.odoLabel}>Starting odometer</Text>
            <Text style={styles.odoValue}>
              {vehicle.currentOdometer.toLocaleString()} km
            </Text>
          </View>
          <View style={styles.odoRow}>
            <Text style={styles.odoLabel}>Estimated new odometer</Text>
            <Text style={[styles.odoValue, { color: theme.colors.accent }]}>
              {(vehicle.currentOdometer + distanceKm).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{' '}
              km
            </Text>
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!tracking ? (
          <Button
            title="🛰  Start Tracking"
            onPress={startTracking}
            fullWidth
            size="lg"
            style={{ marginTop: theme.spacing.lg }}
          />
        ) : (
          <Button
            title="⏹  Stop & Save Trip"
            onPress={stopTracking}
            variant="danger"
            fullWidth
            size="lg"
            style={{ marginTop: theme.spacing.lg }}
          />
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>HOW IT WORKS</Text>
          <Text style={styles.infoText}>
            • The app tracks your GPS position while driving{'\n'}
            • Distance is calculated in real time using GPS coordinates{'\n'}
            • When you stop, the trip distance is added to your odometer{'\n'}
            • Keep the app open during the trip for best accuracy
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    width: 60,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl },
  vehicleName: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  distanceCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.accent,
    marginBottom: theme.spacing.md,
  },
  distanceLabel: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 3,
  },
  distanceValue: {
    color: theme.colors.textPrimary,
    fontSize: 72,
    fontWeight: theme.fontWeight.black,
    lineHeight: 80,
    marginTop: theme.spacing.xs,
  },
  distanceUnit: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.dangerSoft,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.danger,
    marginRight: theme.spacing.xs,
  },
  liveText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1,
  },
  statRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1,
  },
  statValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.black,
    marginTop: 4,
  },
  statUnit: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  odoCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  odoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  odoLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  odoValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  infoBox: {
    marginTop: theme.spacing.xl,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.info,
  },
  infoTitle: {
    color: theme.colors.info,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1.5,
    marginBottom: theme.spacing.sm,
  },
  infoText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
});