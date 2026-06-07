import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import type { Vehicle } from "@/types";
import {
  getVehiclesForUser,
  getServicesForVehicle,
  getAwaitingConfirmation,
} from "@/lib/storage";

import { calculateServiceStatuses } from "@/lib/serviceIntervals";
import { isPassiveDetectionActive } from "@/lib/passiveDetectionService";
import { VehicleCard } from "@/components";
import { Button } from "@/components/Button";
import { theme } from "@/theme";
import { ThemedAlert, AlertButton } from "@/components/ThemedAlert";
import type { PendingTrip } from "@/types";

interface VehicleWithDue {
  vehicle: Vehicle;
  servicesDue: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleWithDue[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [detectionActive, setDetectionActive] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pending, setPending] = useState<PendingTrip[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message?: string;
    buttons?: AlertButton[];
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    const v = await getVehiclesForUser(user.id);
    const withDue = await Promise.all(
      v.map(async (vehicle) => {
        const services = await getServicesForVehicle(vehicle.id);
        const statuses = calculateServiceStatuses(vehicle, services);
        const due = statuses.filter(
          (s) => s.status === "overdue" || s.status === "due-soon",
        ).length;
        return { vehicle, servicesDue: due };
      }),
    );
    setVehicles(withDue);

    const active = await isPassiveDetectionActive();
    setDetectionActive(active);
    const pending = await getAwaitingConfirmation();
    setPendingCount(pending.length);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useFocusEffect(
    useCallback(() => {
      getAwaitingConfirmation()
        .then(setPending)
        .catch(() => setPending([]));
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleLogout = () => {
    setAlertConfig({
      title: "Sign Out",
      message: "Are you sure?",
      buttons: [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: () => logout() },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {user?.isGuest ? "Welcome, Guest" : `Welcome back`}
          </Text>
          <Text style={styles.username}>
            {user?.isGuest ? "Data saved on this device" : user?.username}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          style={styles.menuBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
          />
        }
      >
        {pending.length > 0 && (
          <TouchableOpacity
            style={styles.pendingBanner}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: "/(app)/detection/confirm",
                params: { id: pending[0].id },
              })
            }
          >
            <View style={styles.pendingDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>
                {pending.length} trip{pending.length > 1 ? "s" : ""} awaiting
                confirmation
              </Text>
              <Text style={styles.pendingSubtitle}>
                {pending.length === 1
                  ? `${pending[0].distanceKm.toFixed(1)} km — tap to review`
                  : "Tap to review"}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryNumber}>{vehicles.length}</Text>
            <Text style={styles.summaryLabel}>Vehicles</Text>
          </View>
          <View style={[styles.summaryCard, { marginLeft: theme.spacing.sm }]}>
            <Text
              style={[styles.summaryNumber, { color: theme.colors.warning }]}
            >
              {vehicles.reduce((sum, v) => sum + v.servicesDue, 0)}
            </Text>
            <Text style={styles.summaryLabel}>Services Due</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.passiveCard,
            detectionActive && styles.passiveCardActive,
          ]}
          onPress={() => router.push("/(app)/detection")}
          activeOpacity={0.85}
        >
          <View style={styles.passiveLeft}>
            <View
              style={[
                styles.passiveIcon,
                {
                  backgroundColor: detectionActive
                    ? theme.colors.successSoft
                    : theme.colors.bgInput,
                },
              ]}
            >
              <Text style={styles.passiveEmoji}>🛰️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.passiveTitle}>Auto-detect Trips</Text>
              <Text style={styles.passiveSubtitle}>
                {pendingCount > 0
                  ? `${pendingCount} trip${pendingCount > 1 ? "s" : ""} awaiting confirmation`
                  : detectionActive
                    ? "Detection active in background"
                    : "Tap to set up passive detection"}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.passiveStatus,
              {
                backgroundColor: detectionActive
                  ? theme.colors.success
                  : theme.colors.textMuted,
              },
            ]}
          />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>YOUR GARAGE</Text>

        {vehicles.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🚗</Text>
            <Text style={styles.emptyTitle}>No vehicles yet</Text>
            <Text style={styles.emptyText}>
              Add your first car or motorbike to start tracking services and
              mileage
            </Text>
          </View>
        ) : (
          vehicles.map(({ vehicle, servicesDue }) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              servicesDue={servicesDue}
              onPress={() => router.push(`/(app)/vehicle/${vehicle.id}`)}
            />
          ))
        )}

        <Button
          title="+  Add Vehicle"
          onPress={() => router.push("/(app)/vehicle/add")}
          variant="secondary"
          fullWidth
          size="lg"
          style={{ marginTop: theme.spacing.md }}
        />
      </ScrollView>
      <ThemedAlert
        visible={!!alertConfig}
        title={alertConfig?.title ?? ""}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={() => setAlertConfig(null)}
      />
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setMenuOpen(false)}
        >
          <View style={styles.menuSheet}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                router.push("/(app)/settings");
              }}
            >
              <Text style={styles.menuItemIcon}>⚙️</Text>
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                handleLogout();
              }}
            >
              <Text style={styles.menuItemIcon}>↗</Text>
              <Text
                style={[styles.menuItemText, { color: theme.colors.danger }]}
              >
                Sign Out
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    justifyContent: "space-between",
    alignItems: "center",
  },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  pendingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
    marginRight: theme.spacing.md,
  },
  pendingTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  pendingSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  greeting: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
  },
  username: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  scroll: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
  },
  summaryRow: { flexDirection: "row", marginBottom: theme.spacing.lg },
  summaryCard: {
    flex: 1,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryNumber: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.huge,
    fontWeight: theme.fontWeight.black,
    lineHeight: 48,
  },
  summaryLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  passiveCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  passiveCardActive: { borderColor: theme.colors.success },
  passiveLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
  passiveIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.md,
  },
  passiveEmoji: { fontSize: 20 },
  passiveTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  passiveSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  passiveStatus: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: theme.spacing.sm,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
    marginBottom: theme.spacing.md,
  },
  empty: { alignItems: "center", paddingVertical: theme.spacing.xxxl },
  emptyEmoji: { fontSize: 60, marginBottom: theme.spacing.md, opacity: 0.5 },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    textAlign: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCard,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIcon: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: theme.fontWeight.bold,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  menuSheet: {
    position: "absolute",
    top: 70, // tweak to sit just under your header
    right: theme.spacing.xl,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 180,
    paddingVertical: theme.spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  menuItemIcon: { fontSize: 16, marginRight: theme.spacing.md },
  menuItemText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  menuDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.sm,
  },
});
