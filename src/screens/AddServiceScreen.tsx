import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, Vehicle } from '../types';
import { addService } from '../utils/storage';
import { useVehicles } from '../hooks/useVehicles';
import { getServiceIntervals } from '../utils/serviceIntervals';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddService'>;

export const AddServiceScreen: React.FC<Props> = ({ route, navigation }) => {
  const { vehicleId } = route.params;
  const { vehicles, loading: loadingVehicles } = useVehicles();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [serviceType, setServiceType] = useState('');
  const [odometer, setOdometer] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loadingVehicles && vehicles.length > 0) {
      const v = vehicles.find((x) => x.id === vehicleId);
      if (v) {
        setVehicle(v);

        if (!odometer) {
          setOdometer(String(v.currentOdometer));
        }
      }
    }
  }, [vehicles, vehicleId, loadingVehicles, odometer]);

  const handleSave = async () => {
    setError('');

    if (!vehicle) return;

    if (!serviceType) {
      setError('Please select a service type');
      return;
    }

    const odoNum = parseFloat(odometer);
    if (isNaN(odoNum) || odoNum < 0) {
      setError('Enter a valid odometer reading');
      return;
    }

    const costNum = cost ? parseFloat(cost) : undefined;
    if (cost && (isNaN(costNum!) || costNum! < 0)) {
      setError('Enter a valid cost');
      return;
    }

    setSaving(true);

    try {
      await addService({
        vehicleId,
        serviceType,
        odometer: odoNum,
        date: new Date().toISOString(),
        notes: notes.trim() || undefined,
        cost: costNum,
      });

      navigation.goBack();
    } catch (err) {
      setError('Failed to save service record. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingVehicles || !vehicle) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent || '#FF6B35'} />
          <Text style={styles.loadingText}>Loading vehicle details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const intervals = getServiceIntervals(vehicle.type);

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

          <Text style={styles.title}>Log Service</Text>

          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
                    serviceType === s.serviceType && styles.serviceChipTextActive,
                  ]}
                >
                  {s.serviceType}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="Odometer at service (km)"
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
            style={{ minHeight: 80, textAlignVertical: 'top' }}
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
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.md,
  },
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
  serviceList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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