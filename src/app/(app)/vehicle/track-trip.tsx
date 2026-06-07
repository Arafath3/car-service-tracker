import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import type { Vehicle, Trip } from "@/types";
import { getVehicles, addTrip, incrementOdometer } from "@/lib/storage";
import { haversineKm } from "@/lib/detectionEngine";
import { Button } from "@/components/Button";
import { theme } from "@/theme";
import { safeAwait } from "@/lib/asyncWrapper";
import { ThemedAlert, AlertButton } from "@/components/ThemedAlert";
import { useUnits } from "@/context/UnitContext";
import {
  fromKm,
  formatDistance,
  distanceUnitLong,
  speedUnitShort,
  distanceUnitShort,
} from "@/lib/units";

export default function TrackTripScreen() {
  const router = useRouter();
  const { id: vehicleId } = useLocalSearchParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [tracking, setTracking] = useState(false);
  const [distanceKm, setDistanceKm] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState("");
  const { system } = useUnits();

  const watchSubscription = useRef<Location.LocationSubscription | null>(null);
  const lastLocation = useRef<Location.LocationObject | null>(null);
  const startTime = useRef<Date | null>(null);
  const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const tripIdRef = useRef<string>("");

  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message?: string;
    buttons?: AlertButton[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      if (!vehicleId) return;
      const all = await getVehicles();
      const v = all.find((x) => x.id === vehicleId);
      if (v) setVehicle(v);
    })();
    return () => {
      if (watchSubscription.current) watchSubscription.current.remove();
      if (elapsedInterval.current) clearInterval(elapsedInterval.current);
    };
  }, [vehicleId]);

  const startTracking = async () => {
    setError("");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setError("Location permission denied");
      return;
    }
    if (!vehicle) return;

    setDistanceKm(0);
    setElapsedSec(0);
    setCurrentSpeed(0);
    lastLocation.current = null;
    startTime.current = new Date();
    tripIdRef.current = uuidv4();

    elapsedInterval.current = setInterval(() => {
      if (startTime.current) {
        const sec = Math.floor(
          (Date.now() - startTime.current.getTime()) / 1000,
        );
        setElapsedSec(sec);
      }
    }, 1000);

    try {
      watchSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
          timeInterval: 2000,
        },
        (loc) => {
          if (lastLocation.current) {
            const km = haversineKm(
              lastLocation.current.coords.latitude,
              lastLocation.current.coords.longitude,
              loc.coords.latitude,
              loc.coords.longitude,
            );
            if (km > 0.003) {
              setDistanceKm((prev) => prev + km);
            }
          }
          lastLocation.current = loc;
          const speedKmh = (loc.coords.speed || 0) * 3.6;
          setCurrentSpeed(Math.max(0, speedKmh));
        },
      );
      setTracking(true);
    } catch (e: any) {
      setError("Failed to start GPS: " + (e?.message || "unknown"));
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
      setAlertConfig({
        title: "Trip too short",
        message: "No distance recorded.",
      });
      router.back();
      return;
    }

    const finalDistance = parseFloat(distanceKm.toFixed(2));
    const newOdometer = vehicle.currentOdometer + finalDistance;

    const trip: Trip = {
      id: tripIdRef.current,
      vehicleId: vehicle.id,
      startTime: startTime.current.toISOString(),
      endTime: new Date().toISOString(),
      distanceKm: finalDistance,
      startOdometer: vehicle.currentOdometer,
      endOdometer: newOdometer,
      isActive: false,
      source: "manual",
    };
    const [saveErr] = await safeAwait(
      Promise.all([
        addTrip(trip),
        incrementOdometer(vehicle.id, finalDistance),
      ]),
    );
    if (saveErr) {
      setAlertConfig({
        title: "Save failed",
        message: "Could not save the trip. Please try again.",
      });
      return;
    }
    setAlertConfig({
      title: "Trip Saved",
      message: `Distance: ${formatDistance(finalDistance, system)} ${distanceUnitShort(system)}\nNew odometer: ${formatDistance(newOdometer, system)} ${distanceUnitShort(system)}`,
      buttons: [{ text: "OK", onPress: () => router.back() }],
    });
  };

  const formatTime = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.textPrimary, padding: 20 }}>
          Loading...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => {
            if (tracking) {
              setAlertConfig({
                title: "Trip in progress",
                message: "Stop tracking before leaving",
              });
              return;
            }
            router.back();
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

        <View style={styles.distanceCard}>
          <Text style={styles.distanceLabel}>DISTANCE</Text>
          <Text style={styles.distanceValue}>
            {formatDistance(distanceKm, system)}
          </Text>
          <Text style={styles.distanceUnit}>{distanceUnitLong(system)}</Text>

          {tracking && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>SPEED</Text>
            <Text style={styles.statValue}>
              {fromKm(currentSpeed, system).toFixed(0)}
            </Text>
            <Text style={styles.statUnit}>{speedUnitShort(system)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>TIME</Text>
            <Text style={styles.statValue}>{formatTime(elapsedSec)}</Text>
            <Text style={styles.statUnit}>elapsed</Text>
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
      </ScrollView>
      <ThemedAlert
        visible={!!alertConfig}
        title={alertConfig?.title ?? ""}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={() => setAlertConfig(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  distanceCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    alignItems: "center",
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
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.md,
    textAlign: "center",
  },
});
