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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
<<<<<<< Updated upstream
import { addVehicle } from '../utils/storage';
=======
import { addVehicle } from '../utils/storage'; 
>>>>>>> Stashed changes
import { theme } from '../theme';
import { RootStackParamList, VehicleType } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AddVehicle'>;

export const AddVehicleScreen: React.FC<Props> = ({ navigation }) => {
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
<<<<<<< Updated upstream

=======
    
    // 1. Basic validation
>>>>>>> Stashed changes
    if (!make.trim() || !model.trim() || !year.trim() || !odometer.trim()) {
      setError('Please fill in make, model, year, and odometer');
      return;
    }
<<<<<<< Updated upstream

=======
    
>>>>>>> Stashed changes
    const yearNum = parseInt(year, 10);
    const odoNum = parseFloat(odometer);
    const currentYear = new Date().getFullYear();

<<<<<<< Updated upstream
=======
    // 2. Numerical evaluation boundaries
>>>>>>> Stashed changes
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > currentYear + 1) {
      setError(`Enter a valid year between 1900 and ${currentYear + 1}`);
      return;
    }

    if (isNaN(odoNum) || odoNum < 0) {
      setError('Enter a valid odometer reading');
      return;
    }

    setSaving(true);
<<<<<<< Updated upstream

    try {
=======
    
    try {
      // Stripped client-side uuid and user allocation blocks: 
      // Handled dynamically by our background storage router layer
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream

      navigation.goBack();
    } catch (err: any) {
      console.error('Error saving vehicle inside AddVehicleScreen:', err);

=======
      
      navigation.goBack();
    } catch (err: any) {
      // Production debugging fallbacks
      console.error('Error saving vehicle inside AddVehicleScreen line 63:', err);
      
      // Friendly, descriptive error outputs based on common exceptions
>>>>>>> Stashed changes
      if (err?.code === 'firestore/permission-denied') {
        setError('Storage sync failed: Access denied. Try re-logging in.');
      } else if (err?.message?.includes('Storage is full')) {
        setError('Device storage limit reached. Free up space or log in to use the cloud.');
      } else {
        setError(err?.message || 'An unexpected error occurred while saving. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
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
            hint="Read this from your vehicle's dashboard"
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
  typeRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.xl,
  },
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
  typeEmoji: {
    fontSize: 32,
    marginBottom: theme.spacing.xs,
  },
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
    marginBottom: theme.spacing.lg,
  },
});