import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import 'react-native-get-random-values';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { addVehicle } from '@/lib/storage';
import { theme } from '@/theme';
import type { VehicleType } from '@/types';

export default function AddVehicleScreen() {
  const router = useRouter();
  const [type, setType] = useState<VehicleType>('car');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [nickname, setNickname] = useState('');
  const [odometer, setOdometer] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError('');

    if (!make.trim() || !model.trim() || !year.trim() || !odometer.trim()) {
      setError('Please fill in make, model, year, and odometer');
      return;
    }
    const yearNum = parseInt(year, 10);
    const odoNum = parseFloat(odometer);
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2030) {
      setError('Enter a valid year');
      return;
    }
    if (isNaN(odoNum) || odoNum < 0) {
      setError('Enter a valid odometer reading');
      return;
    }

    setSaving(true);
    await addVehicle({
      type,
      make: make.trim(),
      model: model.trim(),
      year: yearNum,
      nickname: nickname.trim() || undefined,
      currentOdometer: odoNum,
      startingOdometer: odoNum,
      createdAt: new Date().toISOString(),
    });
    setSaving(false);
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Vehicle</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>VEHICLE TYPE</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeBox, type === 'car' && styles.typeBoxActive]}
              onPress={() => setType('car')}
              activeOpacity={0.85}
            >
              <Text style={styles.typeEmoji}>🚗</Text>
              <Text style={[styles.typeLabel, type === 'car' && styles.typeLabelActive]}>
                Car
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBox, type === 'motorbike' && styles.typeBoxActive]}
              onPress={() => setType('motorbike')}
              activeOpacity={0.85}
            >
              <Text style={styles.typeEmoji}>🏍️</Text>
              <Text style={[styles.typeLabel, type === 'motorbike' && styles.typeLabelActive]}>
                Motorbike
              </Text>
            </TouchableOpacity>
          </View>

          <Input
            label="Make"
            value={make}
            onChangeText={setMake}
            placeholder="e.g. Toyota, Honda, Yamaha"
            autoCapitalize="words"
          />
          <Input
            label="Model"
            value={model}
            onChangeText={setModel}
            placeholder="e.g. Corolla, MT-07"
            autoCapitalize="words"
          />
          <Input
            label="Year"
            value={year}
            onChangeText={setYear}
            placeholder="e.g. 2020"
            keyboardType="numeric"
            maxLength={4}
          />
          <Input
            label="Nickname (optional)"
            value={nickname}
            onChangeText={setNickname}
            placeholder="e.g. Daily Driver"
          />
          <Input
            label="Current Odometer (km)"
            value={odometer}
            onChangeText={setOdometer}
            placeholder="e.g. 45000"
            keyboardType="numeric"
            hint="Read from your vehicle's dashboard"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            title="Save Vehicle"
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    textTransform: 'uppercase',
  },
  typeRow: { flexDirection: 'row', marginBottom: theme.spacing.xl },
  typeBox: {
    flex: 1,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
    marginHorizontal: 4,
  },
  typeBoxActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  typeEmoji: { fontSize: 32, marginBottom: theme.spacing.xs },
  typeLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  typeLabelActive: {
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.bold,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing.sm,
  },
});
