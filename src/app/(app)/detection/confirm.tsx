// ============================================================================
// MULTI-STEP TRIP CONFIRMATION FLOW
// ============================================================================
// Steps:
//   1. "Is this you in a vehicle?" → Yes / No
//   2. "Is the distance correct?" → Yes / Edit
//   3. If multi-vehicle: "Which vehicle did you use?" → pick one
//   4. Save trip + update odometer
// ============================================================================

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import type { Vehicle, PendingTrip, Trip } from "@/types";
import {
  getPendingTripById,
  getVehicles,
  removePendingTrip,
  addTrip,
  updateVehicle,
  saveDetectionContext,
  getDetectionContext,
} from "@/lib/storage";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { theme } from "@/theme";
import { safeAwait } from "@/lib/asyncWrapper";
import { ThemedAlert, AlertButton } from "@/components/ThemedAlert";
import { useUnits } from "@/context/UnitContext";
import {
  fromKm,
  toKm,
  formatDistance,
  distanceUnitLong,
  distanceUnitShort,
  speedUnitShort,
} from "@/lib/units";
type Step = "verify" | "distance" | "vehicle" | "saving";

export default function ConfirmTripScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id: pendingTripId } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<PendingTrip | null>(null);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [step, setStep] = useState<Step>("verify");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { system } = useUnits();
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message?: string;
    buttons?: AlertButton[];
  } | null>(null);

  // Editable values for the confirmation flow
  const [editedDistance, setEditedDistance] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  );
  const [distanceError, setDistanceError] = useState("");
  const [editingDistance, setEditingDistance] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!pendingTripId || !user) return;

      const [tripError, t] = await safeAwait(getPendingTripById(pendingTripId));
      if (!mounted) return;
      if (tripError) {
        setAlertConfig({
          title: "Oops",
          message: "Something went wrong getting the trip details",
        });
        setLoading(false);
        return;
      }
      if (!t) {
        setLoading(false);
        setAlertConfig({
          title: "Not found",
          message: "This trip could not be found. It may already be confirmed.",
          buttons: [
            { text: "OK", style: "default", onPress: () => router.back() },
          ],
        });

        return;
      }
      setTrip(t);
      setEditedDistance(fromKm(t.distanceKm, system).toFixed(2));
      setSelectedVehicleId(t.vehicleId);

      const [vehicleError, vs] = await safeAwait(getVehicles());
      if (!mounted) return;
      if (vehicleError || !vs) {
        setAlertConfig({
          title: "Error",
          message: "Could not load your vehicles. Please try again.",
        });
        setLoading(false);
        return;
      }

      setAllVehicles(vs);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [pendingTripId, user?.id]);

  const resetDetectionContext = async () => {
    const [ctxError, ctx] = await safeAwait(getDetectionContext());

    if (ctxError || !ctx) {
      return;
    }

    const updatedContext = {
      ...ctx,
      state: ctx.enabled ? ("monitoring" as const) : ("idle" as const),
      currentTripStartTime: null,
      currentTripStartIndex: null,
      accumulatedDistanceKm: 0,
      stoppedSinceTimestamp: null,
      recentSnapshots: [],
      lastStateChangeAt: Date.now(),
    };

    // 3. Safely SAVE the updated context (Fixing the crash risk)
    const [saveError] = await safeAwait(saveDetectionContext(updatedContext));

    if (saveError) {
      // Log it or handle the save failure gracefully so the app stays alive
      console.error("Failed to save the reset detection context:", saveError);
      return;
    }
  };

  // ---------- STEP 1: VERIFY ----------
  const handleNotMe = () => {
    setAlertConfig({
      title: "Discard trip?",
      message:
        "This trip will be permanently deleted because it wasn't a real drive.",
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            if (!trip) return;
            setBusy(true);
            await removePendingTrip(trip.id);
            await resetDetectionContext();
            setBusy(false);
            router.back();
          },
        },
      ],
    });
  };

  const handleYesItWasMe = () => {
    setStep("distance");
  };

  // ---------- STEP 2: DISTANCE ----------
  const handleDistanceCorrect = () => {
    // Decide whether to ask about vehicle
    if (allVehicles.length > 1) {
      setStep("vehicle");
    } else {
      // where you currently call saveTripFinal:
      const typedInDisplayUnits = parseFloat(editedDistance);
      const distanceKmToStore = Number.isFinite(typedInDisplayUnits)
        ? toKm(typedInDisplayUnits, system)
        : trip!.distanceKm;
      saveTripFinal(distanceKmToStore, selectedVehicleId);
    }
  };

  const handleEditDistance = () => {
    setEditingDistance(true);
  };

  const handleConfirmEditedDistance = () => {
    setDistanceError("");
    const num = parseFloat(editedDistance);
    if (isNaN(num) || num <= 0) {
      setDistanceError("Enter a valid distance");
      return;
    }
    if (num > 1000) {
      setAlertConfig({
        title: "Large distance",
        message: "That's a very long trip. Are you sure?",
        buttons: [
          { text: "Cancel", style: "cancel" },
          {
            text: "Yes",
            style: "default",
            onPress: () => {
              setEditingDistance(false);
              handleDistanceCorrect();
            },
          },
        ],
      });
      return;
    }
    setEditingDistance(false);
    handleDistanceCorrect();
  };

  // ---------- STEP 3: VEHICLE PICKER ----------
  const handleSelectVehicle = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
  };

  const handleConfirmVehicle = () => {
    if (!selectedVehicleId) {
      setAlertConfig({
        title: "Pick a vehicle",
        message: "Select which vehicle you drove.",
      });

      return;
    }
    // where you currently call saveTripFinal:
    const typedInDisplayUnits = parseFloat(editedDistance);
    const distanceKmToStore = Number.isFinite(typedInDisplayUnits)
      ? toKm(typedInDisplayUnits, system)
      : trip!.distanceKm;
    saveTripFinal(distanceKmToStore, selectedVehicleId);
  };

  // ---------- FINAL SAVE ----------
  const saveTripFinal = async (distance: number, vehicleId: string) => {
    if (!trip) return;
    setStep("saving");
    setBusy(true);

    const vehicle = allVehicles.find((v) => v?.id === vehicleId);
    if (!vehicle) {
      setBusy(false);
      setAlertConfig({ title: "Error", message: "Vehicle not found." });
      return;
    }

    const newOdometer = vehicle.currentOdometer + distance;

    const newTrip: Trip = {
      id: uuidv4(),
      vehicleId,
      startTime: new Date(trip.startTime).toISOString(),
      endTime: new Date(trip.endTime).toISOString(),
      distanceKm: distance,
      startOdometer: vehicle.currentOdometer,
      endOdometer: newOdometer,
      isActive: false,
      source: "passive",
    };

    // 1. Critical writes — the trip and the odometer must both land.
    const [saveError] = await safeAwait(
      Promise.all([
        addTrip(newTrip),
        updateVehicle({ ...vehicle, currentOdometer: newOdometer }),
      ]),
    );

    if (saveError) {
      setBusy(false);
      setAlertConfig({
        title: "Save failed",
        message: "Could not save the trip. Please try again.",
      });
      return; // pending trip preserved → user can retry
    }

    // 2. Cleanup — only after the save is confirmed. Non-critical, best-effort.
    await safeAwait(
      Promise.all([removePendingTrip(trip.id), resetDetectionContext()]),
    );

    setBusy(false);
    setAlertConfig({
      title: "✓ Trip Saved",
      message: `${formatDistance(distance, system)} ${distanceUnitShort(system)} added to ${vehicle.nickname || vehicle.make + " " + vehicle.model}.\n\nNew odometer: ${formatDistance(newOdometer, system)} ${distanceUnitShort(system)}`,
      buttons: [{ text: "OK", style: "default", onPress: () => router.back() }],
    });
  };

  // ---------- RENDER ----------
  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator
          color={theme.colors.accent}
          size="large"
          style={{ flex: 1 }}
        />
      </SafeAreaView>
    );
  }

  const originalVehicle = allVehicles.find((v) => v.id === trip.vehicleId);
  const startDate = new Date(trip.startTime);
  const endDate = new Date(trip.endTime);
  const durationMin = Math.round((trip.endTime - trip.startTime) / 60000);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Progress dots */}
        <View style={styles.progressRow}>
          <View
            style={[
              styles.progressDot,
              step === "verify" && styles.progressDotActive,
            ]}
          />
          <View
            style={[
              styles.progressDot,
              (step === "distance" || step === "vehicle") &&
                styles.progressDotActive,
            ]}
          />
          {allVehicles.length > 1 && (
            <View
              style={[
                styles.progressDot,
                step === "vehicle" && styles.progressDotActive,
              ]}
            />
          )}
        </View>

        {/* ============== STEP 1: VERIFY ============== */}
        {step === "verify" && (
          <>
            <View style={styles.header}>
              <Text style={styles.headerEmoji}>🚗</Text>
              <Text style={styles.title}>Trip detected</Text>
              <Text style={styles.subtitle}>
                Was this you driving a vehicle?
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Distance</Text>
                <Text style={styles.summaryValue}>
                  {formatDistance(trip.distanceKm, system)}{" "}
                  {distanceUnitShort(system)}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Started</Text>
                <Text style={styles.summaryValue}>
                  {startDate.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Ended</Text>
                <Text style={styles.summaryValue}>
                  {endDate.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Duration</Text>
                <Text style={styles.summaryValue}>{durationMin} min</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Average Speed</Text>
                <Text style={styles.summaryValue}>
                  {formatDistance(trip.averageSpeedKmh, system)}{" "}
                  {speedUnitShort(system)}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Max Speed</Text>
                <Text style={styles.summaryValue}>
                  {formatDistance(trip.maxSpeedKmh, system)}{" "}
                  {speedUnitShort(system)}
                </Text>
              </View>
            </View>

            <Text style={styles.questionTitle}>Was this you in a vehicle?</Text>
            <Text style={styles.questionSub}>
              If you weren't actually driving (e.g. you were a passenger on a
              bus or train), tap "No, discard".
            </Text>

            <Button
              title="✓  Yes, this was me driving"
              onPress={handleYesItWasMe}
              fullWidth
              size="lg"
              style={{ marginTop: theme.spacing.lg }}
            />
            <Button
              title="✗  No, discard this trip"
              onPress={handleNotMe}
              variant="secondary"
              fullWidth
              size="lg"
              style={{ marginTop: theme.spacing.sm }}
            />
          </>
        )}

        {/* ============== STEP 2: DISTANCE ============== */}
        {step === "distance" && (
          <>
            <View style={styles.header}>
              <Text style={styles.headerEmoji}>📏</Text>
              <Text style={styles.title}>Is the distance correct?</Text>
              <Text style={styles.subtitle}>
                Compare with your dashboard or memory
              </Text>
            </View>

            {!editingDistance ? (
              <>
                <View style={styles.distanceBigCard}>
                  <Text style={styles.distanceBigLabel}>
                    ESTIMATED DISTANCE
                  </Text>
                  <Text style={styles.distanceBigValue}>
                    {formatDistance(trip.distanceKm, system)}
                  </Text>
                  <Text style={styles.distanceBigUnit}>
                    {distanceUnitLong(system)}
                  </Text>
                </View>

                <Text style={styles.helperText}>
                  This was estimated from GPS coordinates. Real distance may
                  differ slightly due to road curvature and GPS sampling
                  intervals.
                </Text>

                <Button
                  title="✓  Yes, distance is correct"
                  onPress={handleDistanceCorrect}
                  fullWidth
                  size="lg"
                  style={{ marginTop: theme.spacing.lg }}
                />
                <Button
                  title="✎  Edit distance"
                  onPress={handleEditDistance}
                  variant="secondary"
                  fullWidth
                  size="lg"
                  style={{ marginTop: theme.spacing.sm }}
                />
                <Button
                  title="← Back"
                  onPress={() => setStep("verify")}
                  variant="ghost"
                  fullWidth
                  style={{ marginTop: theme.spacing.sm }}
                />
              </>
            ) : (
              <>
                <View style={styles.editCard}>
                  <Text style={styles.editCardLabel}>Original estimate</Text>
                  <Text style={styles.editCardValue}>
                    {formatDistance(trip.distanceKm, system)}{" "}
                    {distanceUnitShort(system)}
                  </Text>
                </View>

                <Input
                  label="Actual Distance (km)"
                  value={editedDistance}
                  onChangeText={(t) => {
                    setEditedDistance(t);
                    setDistanceError("");
                  }}
                  keyboardType="numeric"
                  placeholder="e.g. 13.5"
                  error={distanceError}
                  hint="Enter the value from Google Maps or your dashboard"
                />

                <Button
                  title="Confirm Distance"
                  onPress={handleConfirmEditedDistance}
                  fullWidth
                  size="lg"
                />
                <Button
                  title="Cancel Edit"
                  onPress={() => {
                    setEditedDistance(
                      fromKm(trip.distanceKm, system).toFixed(2),
                    );
                    setEditingDistance(false);
                  }}
                  variant="ghost"
                  fullWidth
                  style={{ marginTop: theme.spacing.sm }}
                />
              </>
            )}
          </>
        )}

        {/* ============== STEP 3: VEHICLE PICKER ============== */}
        {step === "vehicle" && (
          <>
            <View style={styles.header}>
              <Text style={styles.headerEmoji}>🚙</Text>
              <Text style={styles.title}>Which vehicle did you drive?</Text>
              <Text style={styles.subtitle}>
                You have multiple vehicles — pick the right one
              </Text>
            </View>

            <View style={styles.distanceSmallCard}>
              <Text style={styles.distanceSmallLabel}>Distance to add:</Text>
              <Text style={styles.distanceSmallValue}>
                {(parseFloat(editedDistance) || 0).toFixed(2)}{" "}
                {distanceUnitShort(system)}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>SELECT VEHICLE</Text>

            {allVehicles.map((v) => {
              const isSelected = selectedVehicleId === v.id;
              const isOriginal = v.id === trip.vehicleId;
              const newOdoKm =
                v.currentOdometer +
                toKm(parseFloat(editedDistance) || 0, system);
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    styles.vehicleOption,
                    isSelected && styles.vehicleOptionActive,
                  ]}
                  onPress={() => handleSelectVehicle(v.id)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.vehicleOptionEmoji}>
                    {v.type === "car" ? "🚗" : "🏍️"}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <View style={styles.vehicleOptionTitleRow}>
                      <Text style={styles.vehicleOptionName}>
                        {v.nickname || `${v.make} ${v.model}`}
                      </Text>
                      {isOriginal && (
                        <View style={styles.originalBadge}>
                          <Text style={styles.originalBadgeText}>TRACKED</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.vehicleOptionSub}>
                      {v.year} · {v.make} {v.model}
                    </Text>
                    <Text style={styles.vehicleOptionOdo}>
                      {formatDistance(v.currentOdometer, system)} →{" "}
                      {formatDistance(newOdoKm, system)}{" "}
                      {distanceUnitShort(system)}
                    </Text>
                  </View>
                  <View
                    style={[styles.radio, isSelected && styles.radioActive]}
                  />
                </TouchableOpacity>
              );
            })}

            <Button
              title="Save Trip"
              onPress={handleConfirmVehicle}
              loading={busy}
              fullWidth
              size="lg"
              style={{ marginTop: theme.spacing.lg }}
            />
            <Button
              title="← Back"
              onPress={() => setStep("distance")}
              variant="ghost"
              fullWidth
              style={{ marginTop: theme.spacing.sm }}
            />
          </>
        )}

        {/* ============== STEP 4: SAVING ============== */}
        {step === "saving" && (
          <View style={styles.savingWrap}>
            <ActivityIndicator color={theme.colors.accent} size="large" />
            <Text style={styles.savingText}>Saving trip...</Text>
          </View>
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
  scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl },

  // Progress
  progressRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  progressDot: {
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  progressDotActive: {
    backgroundColor: theme.colors.accent,
  },

  // Header (used in each step)
  header: {
    alignItems: "center",
    paddingVertical: theme.spacing.lg,
  },
  headerEmoji: { fontSize: 48 },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    marginTop: 4,
    textAlign: "center",
  },

  // Step 1: Verify
  summaryCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginVertical: theme.spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
  },
  summaryLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  summaryValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
  },
  questionTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    marginTop: theme.spacing.lg,
    textAlign: "center",
  },
  questionSub: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.sm,
    textAlign: "center",
    paddingHorizontal: theme.spacing.md,
    lineHeight: 20,
  },

  // Step 2: Distance
  distanceBigCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.accent,
    marginVertical: theme.spacing.lg,
  },
  distanceBigLabel: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 3,
  },
  distanceBigValue: {
    color: theme.colors.textPrimary,
    fontSize: 64,
    fontWeight: theme.fontWeight.black,
    lineHeight: 72,
    marginTop: theme.spacing.xs,
  },
  distanceBigUnit: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: theme.spacing.md,
  },
  editCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  editCardLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1,
  },
  editCardValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    marginTop: 4,
  },

  // Step 3: Vehicle
  distanceSmallCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  distanceSmallLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  distanceSmallValue: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
    marginVertical: theme.spacing.md,
  },
  vehicleOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  vehicleOptionActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  vehicleOptionEmoji: {
    fontSize: 32,
    marginRight: theme.spacing.md,
  },
  vehicleOptionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  vehicleOptionName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  originalBadge: {
    backgroundColor: theme.colors.info,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: theme.spacing.sm,
  },
  originalBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0.5,
  },
  vehicleOptionSub: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  vehicleOptionOdo: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    marginTop: 4,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  radioActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },

  // Saving
  savingWrap: {
    alignItems: "center",
    paddingVertical: theme.spacing.xxxl * 2,
  },
  savingText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    marginTop: theme.spacing.lg,
  },
});
