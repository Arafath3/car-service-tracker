import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Vehicle } from '../types';
import { theme } from '../theme';

interface Props {
  vehicle: Vehicle;
  servicesDue: number;
  onPress: () => void;
}

export const VehicleCard: React.FC<Props> = ({ vehicle, servicesDue, onPress }) => {
  const isCar = vehicle.type === 'car';
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: theme.colors.accentSoft }]}>
          <Text style={styles.iconText}>{isCar ? '🚗' : '🏍️'}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.nickname}>{vehicle.nickname || `${vehicle.make} ${vehicle.model}`}</Text>
          <Text style={styles.makeModel}>
            {vehicle.year} · {vehicle.make} {vehicle.model}
          </Text>
        </View>
        {servicesDue > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{servicesDue}</Text>
          </View>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.footer}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>ODOMETER</Text>
          <Text style={styles.statValue}>{vehicle.currentOdometer.toLocaleString()} <Text style={styles.unit}>km</Text></Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>TYPE</Text>
          <Text style={styles.statValue}>{isCar ? 'Car' : 'Motorbike'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  iconText: { fontSize: 26 },
  headerText: { flex: 1 },
  nickname: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    marginBottom: 2,
  },
  makeModel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  badge: {
    backgroundColor: theme.colors.warning,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#000',
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: theme.spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 1,
    marginBottom: 4,
  },
  statValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  unit: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.regular,
  },
});
