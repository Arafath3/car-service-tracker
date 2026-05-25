import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import type { Vehicle, ServiceRecord, Trip } from "@/types";
import {
  getVehicles,
  getServicesForVehicle,
  getTripsForVehicle,
  deleteVehicle,
  updateVehicle,
} from "@/lib/storage";
import {
  calculateServiceStatuses,
  ServiceStatus,
} from "@/lib/serviceIntervals";
import { ServiceStatusCard, StatTile } from "@/components";
import { Button } from "@/components/Button";
import { theme } from "@/theme";

export default function VehicleDetailScreen() {
  const router = useRouter();
  const { id: vehicleId } = useLocalSearchParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);

  const load = useCallback(async () => {
    if (!vehicleId) return;
    const all = await getVehicles();
    const v = all.find((x) => x.id === vehicleId);
    if (!v) {
      router.back();
      return;
    }
    setVehicle(v);
    // Finalize estimation if 14 days have passed
    if (v.estimation?.status === "pending_observation") {
      const start = new Date(v.estimation.observationStartedAt).getTime();
      const daysElapsed = (Date.now() - start) / (24 * 60 * 60 * 1000);
      if (daysElapsed >= 14) {
        const trips = await getTripsForVehicle(v.id);
        const tripsDuringWindow = trips.filter(
          (t) => new Date(t.startTime).getTime() >= start,
        );
        const totalKm = tripsDuringWindow.reduce(
          (sum, t) => sum + t.distanceKm,
          0,
        );
        const { finalizeEstimation } = await import("@/lib/serviceIntervals");
        const finalized = finalizeEstimation(v, totalKm);
        if (finalized) {
          const updated = { ...v, estimation: finalized };
          await updateVehicle(updated);
          setVehicle(updated);
        }
      }
    }
    const s = await getServicesForVehicle(vehicleId);
    setServices(s);
    const t = await getTripsForVehicle(vehicleId);
    setTrips(t);
    setStatuses(calculateServiceStatuses(v, s));
  }, [vehicleId, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleDelete = () => {
    Alert.alert("Delete Vehicle", "This removes all data. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteVehicle(vehicleId!);
          router.back();
        },
      },
    ]);
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

  const totalDistance = vehicle.currentOdometer - vehicle.startingOdometer;
  const totalTrips = trips.length;
  const totalServices = services.length;
  const overdueCount = statuses.filter((s) => s.status === "overdue").length;
  const dueSoonCount = statuses.filter((s) => s.status === "due-soon").length;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>
            {vehicle.type === "car" ? "🚗" : "🏍️"}
          </Text>
          <Text style={styles.heroNickname}>
            {vehicle.nickname || `${vehicle.make} ${vehicle.model}`}
          </Text>
          <Text style={styles.heroSubtitle}>
            {vehicle.year} · {vehicle.make} {vehicle.model}
          </Text>
          {vehicle.estimation?.status === "pending_observation" && (
            <View
              style={{
                backgroundColor: theme.colors.bgCard,
                borderLeftWidth: 3,
                borderLeftColor: theme.colors.accent,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                marginTop: theme.spacing.md,
              }}
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.bold,
                  letterSpacing: 2,
                }}
              >
                REFINING ESTIMATE
              </Text>
              <Text
                style={{
                  color: theme.colors.textPrimary,
                  fontSize: theme.fontSize.sm,
                  marginTop: 4,
                }}
              >
                We're learning your driving habits. Reminders use a rough
                estimate for now.
              </Text>
            </View>
          )}
        </View>

        {/* Big odometer with EDIT button */}
        <TouchableOpacity
          style={styles.odometerCard}
          onPress={() =>
            router.push({
              pathname: "/(app)/vehicle/edit-odometer",
              params: { id: vehicle.id },
            })
          }
          activeOpacity={0.85}
        >
          <View style={styles.odometerHeader}>
            <Text style={styles.odometerLabel}>CURRENT ODOMETER</Text>
            <View style={styles.editPill}>
              <Text style={styles.editPillText}>✎ EDIT</Text>
            </View>
          </View>
          <Text style={styles.odometerValue}>
            {vehicle.currentOdometer.toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })}
          </Text>
          <Text style={styles.odometerUnit}>kilometers</Text>
        </TouchableOpacity>

        <View style={styles.statRow}>
          <StatTile
            label="Distance Driven"
            value={totalDistance.toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })}
            unit="km"
            accent={theme.colors.accent}
          />
          <View style={{ width: theme.spacing.sm }} />
          <StatTile
            label="Trips"
            value={String(totalTrips)}
            accent={theme.colors.info}
          />
        </View>
        <View style={[styles.statRow, { marginTop: theme.spacing.sm }]}>
          <StatTile
            label="Services Logged"
            value={String(totalServices)}
            accent={theme.colors.success}
          />
          <View style={{ width: theme.spacing.sm }} />
          <StatTile
            label="Services Due"
            value={String(overdueCount + dueSoonCount)}
            accent={theme.colors.warning}
          />
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          <Button
            title="🛰  Track Trip Manually"
            onPress={() =>
              router.push({
                pathname: "/(app)/vehicle/track-trip",
                params: { id: vehicle.id },
              })
            }
            fullWidth
            size="lg"
          />
          <Button
            title="+ Log Service"
            onPress={() =>
              router.push({
                pathname: "/(app)/vehicle/add-service",
                params: { id: vehicle.id },
              })
            }
            variant="secondary"
            fullWidth
            size="lg"
            style={{ marginTop: theme.spacing.sm }}
          />
          <Button
            title="⚙ Manage Service Intervals"
            onPress={() =>
              router.push({
                pathname: "./(app)/vehicle/manage-intervals",
                params: { id: vehicle.id },
              })
            }
            variant="ghost"
            fullWidth
            size="lg"
            style={{ marginTop: theme.spacing.sm }}
          />
        </View>

        <Text style={styles.sectionTitle}>SCHEDULED SERVICES</Text>
        {statuses.map((s) => (
          <ServiceStatusCard key={s.serviceType} status={s} />
        ))}

        {services.length > 0 && (
          <>
            <Text
              style={[styles.sectionTitle, { marginTop: theme.spacing.xl }]}
            >
              SERVICE HISTORY
            </Text>
            {services.slice(0, 10).map((s) => (
              <View key={s.id} style={styles.historyCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyType}>{s.serviceType}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(s.date).toLocaleDateString()} ·{" "}
                    {s.odometer.toLocaleString()} km
                  </Text>
                  {s.notes ? (
                    <Text style={styles.historyNotes}>{s.notes}</Text>
                  ) : null}
                </View>
                {s.cost ? (
                  <Text style={styles.historyCost}>${s.cost.toFixed(0)}</Text>
                ) : null}
              </View>
            ))}
          </>
        )}

        {trips.length > 0 && (
          <>
            <Text
              style={[styles.sectionTitle, { marginTop: theme.spacing.xl }]}
            >
              RECENT TRIPS
            </Text>
            {trips.slice(0, 5).map((t) => (
              <View key={t.id} style={styles.tripCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripType}>
                    {t.source === "passive" ? "🛰 Auto-detected" : "📍 Manual"}
                  </Text>
                  <Text style={styles.tripDate}>
                    {new Date(t.startTime).toLocaleDateString()} ·{" "}
                    {new Date(t.startTime).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <Text style={styles.tripDistance}>
                  {t.distanceKm.toFixed(2)} km
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
  },
  backText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  deleteText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  scroll: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
  },
  hero: { alignItems: "center", paddingVertical: theme.spacing.lg },
  heroEmoji: { fontSize: 56 },
  heroNickname: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    marginTop: theme.spacing.sm,
  },
  heroSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    marginTop: 2,
  },
  odometerCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: "center",
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  odometerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  odometerLabel: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
  },
  editPill: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
    marginLeft: theme.spacing.sm,
  },
  editPillText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1,
  },
  odometerValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.huge + 8,
    fontWeight: theme.fontWeight.black,
    letterSpacing: 1,
    marginTop: 4,
  },
  odometerUnit: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  statRow: { flexDirection: "row" },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  historyCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  historyType: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  historyDate: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  historyNotes: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    marginTop: 4,
    fontStyle: "italic",
  },
  historyCost: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  tripCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tripType: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  tripDate: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  tripDistance: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
});
