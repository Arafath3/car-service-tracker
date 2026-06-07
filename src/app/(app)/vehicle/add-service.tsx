import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import type { Vehicle } from "@/types";
import { getVehicles, addService } from "@/lib/storage";
import { getServiceIntervals } from "@/lib/serviceIntervals";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { theme } from "@/theme";
import { useUnits } from "@/context/UnitContext";
import { fromKm, toKm, formatDistance, distanceUnitShort } from "@/lib/units";

export default function AddServiceScreen() {
  const router = useRouter();
  const { id: vehicleId } = useLocalSearchParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [serviceType, setServiceType] = useState("");
  const [odometer, setOdometer] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [nextDueOdometer, setNextDueOdometer] = useState("");
  const [nextDueDate, setNextDueDate] = useState(""); // YYYY-MM-DD
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { system } = useUnits();
  useEffect(() => {
    (async () => {
      if (!vehicleId) return;
      const all = await getVehicles();
      const v = all.find((x) => x.id === vehicleId);
      if (v) {
        setVehicle(v);
        setOdometer(String(v.currentOdometer));
      }
    })();
  }, [vehicleId]);

  const handleSave = async () => {
    setError("");
    if (!vehicle) return;
    if (!serviceType) {
      setError("Please select a service type");
      return;
    }
    const odoNum = parseFloat(odometer);
    if (isNaN(odoNum) || odoNum < 0) {
      setError("Enter a valid odometer reading");
      return;
    }
    const costNum = cost ? parseFloat(cost) : undefined;
    if (cost && (isNaN(costNum!) || costNum! < 0)) {
      setError("Enter a valid cost");
      return;
    }

    const nextOdo = nextDueOdometer ? parseFloat(nextDueOdometer) : undefined;
    if (nextOdo != null && (isNaN(nextOdo) || nextOdo < odoNum)) {
      setError("Next service km must be greater than the current odometer");
      return;
    }
    const nextDate = nextDueDate.trim() || undefined;
    if (nextDate && isNaN(new Date(nextDate).getTime())) {
      setError("Enter the date as YYYY-MM-DD");
      return;
    }

    setSaving(true);
    try {
      await addService({
        vehicleId: vehicleId!,
        serviceType,
        odometer: odoNum,
        date: new Date().toISOString(),
        notes: notes.trim() || undefined,
        cost: costNum,
        nextDueOdometer: nextOdo,
        nextDueDate: nextDate ? new Date(nextDate).toISOString() : undefined,
      });
      setSaving(false);
      router.back();
    } catch (err: any) {
      setSaving(false);
      console.error("[AddService] save failed:", err);
      if (err?.code === "firestore/permission-denied") {
        setError("Cloud save denied. Check your Firestore security rules.");
      } else {
        setError(err?.message || "Could not save service. Please try again.");
      }
    }
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

  const intervals = getServiceIntervals(vehicle);

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
          <Text style={styles.title}>Log Service</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>SERVICE TYPE</Text>
          <View style={styles.serviceList}>
            {intervals.map((s) => (
              <TouchableOpacity
                key={s.serviceType}
                style={[
                  styles.serviceChip,
                  serviceType === s.serviceType && styles.serviceChipActive,
                ]}
                onPress={() => setServiceType(s.serviceType)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.serviceChipText,
                    serviceType === s.serviceType &&
                      styles.serviceChipTextActive,
                  ]}
                >
                  {s.serviceType}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label={`Odometer at service (${distanceUnitShort(system)})`}
            value={odometer}
            onChangeText={setOdometer}
            keyboardType="numeric"
            placeholder="e.g. 45000"
          />
          <Input
            label="Cost (optional)"
            value={cost}
            onChangeText={setCost}
            keyboardType="numeric"
            placeholder="e.g. 120"
          />
          <Input
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Where was it done? Anything to remember?"
            multiline
            numberOfLines={3}
            style={{ minHeight: 80, textAlignVertical: "top" }}
          />

          <Text style={[styles.sectionLabel, { marginTop: theme.spacing.lg }]}>
            FROM MECHANIC STICKER (OPTIONAL)
          </Text>
          <Input
            label={`Next service due at (${distanceUnitShort(system)})`}
            value={nextDueOdometer}
            onChangeText={setNextDueOdometer}
            keyboardType="numeric"
            placeholder="e.g. 165000"
          />
          <Input
            label="Next service due by (YYYY-MM-DD)"
            value={nextDueDate}
            onChangeText={setNextDueDate}
            placeholder="e.g. 2026-12-15"
            autoCapitalize="none"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            title="Save Service Record"
            onPress={handleSave}
            loading={saving}
            fullWidth
            size="lg"
            style={{ marginTop: theme.spacing.lg }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  sectionLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
    textTransform: "uppercase",
  },
  serviceList: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: theme.spacing.lg,
  },
  serviceChip: {
    backgroundColor: theme.colors.bgCard,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    margin: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  serviceChipActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accent,
  },
  serviceChipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  serviceChipTextActive: {
    color: theme.colors.accent,
    fontWeight: theme.fontWeight.bold,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.sm,
  },
});
