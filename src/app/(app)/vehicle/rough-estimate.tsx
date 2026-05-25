import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Vehicle, VehicleEstimation } from '@/types';
import { getVehicles, updateVehicle } from '@/lib/storage';
import { Button } from '@/components/Button';
import { theme } from '@/theme';

const OPTIONS: { label: string; months: number }[] = [
  { label: '3 months ago',  months: 3 },
  { label: '6 months ago',  months: 6 },
  { label: '1 year ago',    months: 12 },
  { label: '18 months ago', months: 18 },
  { label: '2+ years ago',  months: 24 },
];

export default function RoughEstimateScreen() {
  const router = useRouter();
  const { id: vehicleId } = useLocalSearchParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!vehicleId) return;
      const all = await getVehicles();
      const v = all.find((x) => x.id === vehicleId);
      if (v) setVehicle(v);
    })();
  }, [vehicleId]);

  const handleSave = async () => {
    if (!vehicle || selected == null) return;
    setSaving(true);

    const estimation: VehicleEstimation = {
      status: 'pending_observation',
      roughIntervalMonths: selected,
      observationStartedAt: new Date().toISOString(),
      observationStartOdometer: vehicle.currentOdometer,
      // Use 30 km/day as the placeholder estimate until observation completes
      estimatedDailyKm: 30,
      estimatedLastServiceOdometer: Math.max(0, vehicle.currentOdometer - 30 * selected * 30),
    };

    await updateVehicle({ ...vehicle, estimation });
    setSaving(false);

    Alert.alert(
      'Estimate started',
      "We'll track your driving for 2 weeks to refine this estimate. Reminders will work in the meantime.",
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.title}>When did you last service this car?</Text>
        <Text style={styles.subtitle}>
          Pick the closest option. We'll observe your driving for 2 weeks to refine the estimate.
        </Text>

        {OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.months}
            style={[
              styles.optionBox,
              selected === opt.months && styles.optionBoxActive,
            ]}
            onPress={() => setSelected(opt.months)}
            activeOpacity={0.85}
          >
            <Text style={[
              styles.optionLabel,
              selected === opt.months && styles.optionLabelActive,
            ]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}

        <Button
          title="Start estimate"
          onPress={handleSave}
          loading={saving}
          disabled={selected == null}
          fullWidth
          size="lg"
          style={{ marginTop: theme.spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { padding: theme.spacing.xl },
  loading: { color: theme.colors.textPrimary, padding: 20 },
  backText: { color: theme.colors.accent, marginBottom: theme.spacing.lg },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    marginBottom: theme.spacing.xl,
    lineHeight: 22,
  },
  optionBox: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  optionBoxActive: { borderColor: theme.colors.accent },
  optionLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  optionLabelActive: { color: theme.colors.accent },
});