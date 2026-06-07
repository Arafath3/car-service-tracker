import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import type { Vehicle, ServiceInterval } from "@/types";
import { getBaseIntervals } from "@/lib/serviceIntervals";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { theme } from "@/theme";
import {
  getVehicles,
  updateVehicle,
  getShareCommunityData,
  setShareCommunityData,
  contributeToCommunity,
} from "@/lib/storage";
import { useAuth } from "@/context/AuthContext";
import { trySave } from "@/lib/asyncWrapper";
import { useUnits } from "@/context/UnitContext";
import { fromKm, toKm, formatDistance, distanceUnitShort } from "@/lib/units";

export default function ManageIntervalsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [shareData, setShareData] = useState(false);
  const { id: vehicleId } = useLocalSearchParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

  // overrides for default service types
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // custom service types user is adding
  const [customs, setCustoms] = useState<ServiceInterval[]>([]);
  const [newName, setNewName] = useState("");
  const [newKm, setNewKm] = useState("");
  const [error, setError] = useState("");
  const { system } = useUnits();

  useEffect(() => {
    (async () => {
      if (!vehicleId) return;
      const all = await getVehicles();
      const v = all?.find((x) => x?.id === vehicleId);
      if (v) {
        setVehicle(v);
        const init: Record<string, string> = {};
        getBaseIntervals(v.type).forEach((iv) => {
          init[iv?.serviceType] = String(
            v?.customIntervals?.[iv.serviceType] ?? iv?.intervalKm,
          );
        });
        setOverrides(init);
        setCustoms(v.customServiceTypes ?? []);
      }
    })();
  }, [vehicleId]);

  useEffect(() => {
    getShareCommunityData()?.then(setShareData);
  }, []);
  const addCustom = () => {
    setError("");
    if (!newName.trim()) {
      setError("Enter a service name");
      return;
    }
    const km = toKm(parseFloat(newKm), system);
    if (isNaN(km) || km <= 0) {
      setError(`Enter a valid interval in ${distanceUnitShort(system)}`);
      return;
    }
    if (customs.some((c) => c.serviceType === newName.trim())) {
      setError("A custom service with that name already exists");
      return;
    }
    setCustoms([
      ...customs,
      {
        serviceType: newName.trim(),
        intervalKm: km,
        description: "Custom service",
      },
    ]);
    setNewName("");
    setNewKm("");
  };

  const removeCustom = (name: string) => {
    setCustoms(customs.filter((c) => c.serviceType !== name));
  };

  const save = async () => {
    if (!vehicle) return;

    // Build customIntervals only with values that differ from base
    const base = getBaseIntervals(vehicle.type);
    const customIntervals: Record<string, number> = {};
    base.forEach((iv) => {
      const v = parseFloat(overrides[iv.serviceType]);
      if (!isNaN(v) && v > 0 && v !== iv.intervalKm) {
        customIntervals[iv.serviceType] = v;
      }
    });

    const updated = {
      ...vehicle,
      customIntervals: Object.keys(customIntervals).length
        ? customIntervals
        : undefined,
      customServiceTypes: customs.length ? customs : undefined,
    };
    const ok = await trySave(updateVehicle(updated));
    if (!ok) return;
    contributeToCommunity(updated).catch(() => {});
    router.back();
  };

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const base = getBaseIntervals(vehicle.type);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Service Intervals</Text>
          <TouchableOpacity onPress={save}>
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {user && !user.isGuest && (
            <View style={styles?.shareRow}>
              <View style={{ flex: 1, marginRight: theme.spacing.md }}>
                <Text style={styles.rowLabel}>
                  Share my intervals anonymously
                </Text>
                <Text style={styles.rowDesc}>
                  Help other owners of this vehicle. Only the numbers are shared
                  — never your name, location, or odometer.
                </Text>
              </View>
              <Switch
                value={shareData}
                onValueChange={async (v) => {
                  setShareData(v);
                  await setShareCommunityData(v);
                }}
              />
            </View>
          )}
          <Text style={styles.section}>STANDARD SERVICES</Text>
          <Text style={styles.hint}>
            Override how often each service is needed (in km).
          </Text>
          {base.map((iv) => (
            <View key={iv.serviceType} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{iv.serviceType}</Text>
                <Text style={styles.rowDesc}>{iv.description}</Text>
              </View>
              <Input
                value={overrides[iv.serviceType] ?? ""}
                onChangeText={(t) =>
                  setOverrides({ ...overrides, [iv.serviceType]: t })
                }
                keyboardType="numeric"
                placeholder={String(iv.intervalKm)}
                style={{ width: 100 }}
              />
            </View>
          ))}

          <Text style={[styles.section, { marginTop: theme.spacing.xl }]}>
            CUSTOM SERVICES & PARTS
          </Text>
          <Text style={styles.hint}>
            Add custom services for modifications (new tires, brake upgrades,
            etc.).
          </Text>

          {customs.map((c) => (
            <View key={c.serviceType} style={styles.customRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{c.serviceType}</Text>
                <Text style={styles.rowDesc}>
                  Every {c.intervalKm.toLocaleString()} km
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeCustom(c.serviceType)}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.addBox}>
            <Input
              label="Service name"
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Tire Replacement"
            />
            <Input
              label={`Interval (${distanceUnitShort(system)})`}
              value={newKm}
              onChangeText={setNewKm}
              keyboardType="numeric"
              placeholder="e.g. 40000"
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Button
              title="+ Add Service"
              onPress={addCustom}
              variant="secondary"
              fullWidth
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  loading: { color: theme.colors.textPrimary, padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cancelText: { color: theme.colors.textSecondary },
  saveText: { color: theme.colors.accent, fontWeight: theme.fontWeight.bold },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl },
  section: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
    marginBottom: theme.spacing.sm,
  },
  hint: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing.md,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgCard,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgCard,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgCard,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
  },
  rowLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  rowDesc: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  removeText: {
    color: theme.colors.danger,
    fontWeight: theme.fontWeight.semibold,
  },
  addBox: {
    backgroundColor: theme.colors.bgCard,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  errorText: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
});
