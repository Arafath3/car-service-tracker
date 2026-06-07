import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import type { Vehicle } from "@/types";
import { getVehicles, updateVehicle } from "@/lib/storage";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { theme } from "@/theme";
import { ThemedAlert, AlertButton } from "@/components/ThemedAlert";
import { useUnits } from "@/context/UnitContext";
import { fromKm, toKm, formatDistance, distanceUnitShort } from "@/lib/units";

export default function EditOdometerScreen() {
  const router = useRouter();
  const { id: vehicleId } = useLocalSearchParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [newOdometer, setNewOdometer] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { system } = useUnits();
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
      if (v) {
        setVehicle(v);
        setNewOdometer(String(fromKm(v.currentOdometer, system)));
      }
    })();
  }, [vehicleId]);

  const handleSave = async () => {
    setError("");
    if (!vehicle) return;

    const odoNum = parseFloat(newOdometer);
    const odoKm = toKm(odoNum, system);
    if (isNaN(odoNum) || odoNum < 0) {
      setError("Enter a valid odometer reading");
      return;
    }

    // Warn if reducing the odometer (cars don't go backwards!)
    if (odoKm < vehicle.currentOdometer) {
      setAlertConfig({
        title: "Decrease odometer?",
        message: `You're reducing the odometer from ${formatDistance(vehicle.currentOdometer, system)} ${distanceUnitShort(system)} to ${formatDistance(odoNum, system)} ${distanceUnitShort(system)}. Vehicle odometers don't normally go down. Continue?`,
        buttons: [
          { text: "Cancel", style: "cancel" },
          {
            text: "Yes, continue",
            style: "default",
            onPress: () => save(odoNum),
          },
        ],
      });

      return;
    }

    // Warn if huge jump (more than 10,000 km in one edit)
    const diff = odoKm - vehicle.currentOdometer;
    if (diff > 10000) {
      setAlertConfig({
        title: "Large increase",
        message: `You're adding ${formatDistance(diff, system)} ${distanceUnitShort(system)} in one edit. This seems large. Are you sure?`,
        buttons: [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, save", style: "default", onPress: () => save(odoNum) },
        ],
      });
      return;
    }

    save(odoNum);
  };

  const save = async (odoNum: number) => {
    if (!vehicle) return;
    setSaving(true);
    const odometerKm = toKm(odoNum, system);
    await updateVehicle({ ...vehicle, currentOdometer: odometerKm });
    setSaving(false);
    router.back();
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

  const newValueKm = toKm(parseFloat(newOdometer) || 0, system);
  const diff = newValueKm - vehicle.currentOdometer; // km

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit Odometer</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.vehicleBlock}>
            <Text style={styles.vehicleEmoji}>
              {vehicle.type === "car" ? "🚗" : "🏍️"}
            </Text>
            <Text style={styles.vehicleName}>
              {vehicle.nickname || `${vehicle.make} ${vehicle.model}`}
            </Text>
            <Text style={styles.vehicleSub}>
              {vehicle.year} · {vehicle.make} {vehicle.model}
            </Text>
          </View>

          <View style={styles.currentCard}>
            <Text style={styles.currentLabel}>Current value</Text>
            <Text style={styles.currentValue}>
              {formatDistance(vehicle.currentOdometer, system)}{" "}
              <Text style={styles.currentUnit}>
                {distanceUnitShort(system)}
              </Text>
            </Text>
          </View>

          <Input
            label={`New Odometer Reading (${distanceUnitShort(system)})`}
            value={newOdometer}
            onChangeText={setNewOdometer}
            keyboardType="numeric"
            placeholder="e.g. 52000"
            hint="Read this from your vehicle's actual dashboard for best accuracy"
          />

          {diff !== 0 && !isNaN(diff) && (
            <View
              style={[
                styles.diffCard,
                {
                  backgroundColor:
                    diff > 0
                      ? theme.colors.successSoft
                      : theme.colors.warningSoft,
                  borderColor:
                    diff > 0 ? theme.colors.success : theme.colors.warning,
                },
              ]}
            >
              <Text
                style={[
                  styles.diffLabel,
                  {
                    color:
                      diff > 0 ? theme.colors.success : theme.colors.warning,
                  },
                ]}
              >
                {diff > 0 ? "CHANGE" : "REDUCTION"}
              </Text>
              <Text
                style={[
                  styles.diffValue,
                  {
                    color:
                      diff > 0 ? theme.colors.success : theme.colors.warning,
                  },
                ]}
              >
                {`${diff > 0 ? "+" : ""}${formatDistance(Math.abs(diff), system)} ${distanceUnitShort(system)}`}
              </Text>
            </View>
          )}

          <Input
            label="Reason (optional, for your records)"
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Fixing wrong reading, missed trip..."
            multiline
            numberOfLines={2}
            style={{ minHeight: 60, textAlignVertical: "top" }}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            title="Save New Reading"
            onPress={handleSave}
            loading={saving}
            fullWidth
            size="lg"
            style={{ marginTop: theme.spacing.lg }}
          />

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>WHEN TO EDIT</Text>
            <Text style={styles.infoText}>
              • Your real dashboard shows a different value than the app{"\n"}•
              You forgot to start tracking before a trip{"\n"}• Auto-detection
              missed a drive{"\n"}• You just bought the vehicle and want to
              enter actual odometer
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  cancelText: {
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
  vehicleBlock: {
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  vehicleEmoji: { fontSize: 40 },
  vehicleName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    marginTop: theme.spacing.sm,
  },
  vehicleSub: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  currentCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  currentLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1,
    marginBottom: 4,
  },
  currentValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
  },
  currentUnit: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.regular,
  },
  diffCard: {
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    alignItems: "center",
  },
  diffLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
  },
  diffValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.black,
    marginTop: 2,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
  infoBox: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
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
