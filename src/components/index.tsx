import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import type { Vehicle } from "@/types";
import type { ServiceStatus } from "@/lib/serviceIntervals";
import { theme } from "@/theme";
import { useUnits } from "@/context/UnitContext";
import {
  fromKm,
  toKm,
  formatDistance,
  distanceUnitLong,
  speedUnitShort,
  distanceUnitShort,
} from "@/lib/units";

// ---------- VehicleCard ----------
interface VehicleCardProps {
  vehicle: Vehicle;
  servicesDue: number;
  onPress: () => void;
}

export const VehicleCard: React.FC<VehicleCardProps> = ({
  vehicle,
  servicesDue,
  onPress,
}) => {
  const isCar = vehicle.type === "car";
  const { system } = useUnits();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.vehicleCard}
    >
      <View style={styles.vehicleHeader}>
        <View
          style={[
            styles.vehicleIconBox,
            { backgroundColor: theme.colors.accentSoft },
          ]}
        >
          <Text style={styles.vehicleIconText}>{isCar ? "🚗" : "🏍️"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.vehicleNickname}>
            {vehicle.nickname || `${vehicle.make} ${vehicle.model}`}
          </Text>
          <Text style={styles.vehicleSub}>
            {vehicle.year} · {vehicle.make} {vehicle.model}
          </Text>
        </View>
        {servicesDue > 0 && (
          <View style={styles.vehicleBadge}>
            <Text style={styles.vehicleBadgeText}>{servicesDue}</Text>
          </View>
        )}
      </View>
      <View style={styles.vehicleDivider} />
      <View style={styles.vehicleFooter}>
        <View style={{ flex: 1 }}>
          <Text style={styles.statLabel}>ODOMETER</Text>
          <Text style={styles.statValue}>
            {formatDistance(vehicle.currentOdometer, system)}{" "}
            <Text style={styles.unit}>{distanceUnitShort(system)}</Text>
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statLabel}>TYPE</Text>
          <Text style={styles.statValue}>{isCar ? "Car" : "Motorbike"}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ---------- ServiceStatusCard ----------
interface ServiceStatusCardProps {
  status: ServiceStatus;
}

const statusInfo = {
  overdue: {
    color: theme.colors.danger,
    soft: theme.colors.dangerSoft,
    label: "OVERDUE",
  },
  "due-soon": {
    color: theme.colors.warning,
    soft: theme.colors.warningSoft,
    label: "DUE SOON",
  },
  ok: {
    color: theme.colors.success,
    soft: theme.colors.successSoft,
    label: "OK",
  },
  "never-done": {
    color: theme.colors.info,
    soft: theme.colors.infoSoft,
    label: "NOT LOGGED",
  },
};

export const ServiceStatusCard: React.FC<ServiceStatusCardProps> = ({
  status,
}) => {
  const info = statusInfo[status.status];
  const { system } = useUnits();
  return (
    <View style={styles.serviceCard}>
      <View style={styles.serviceHeader}>
        <Text style={styles.serviceType}>{status.serviceType}</Text>
        <View style={[styles.serviceBadge, { backgroundColor: info.soft }]}>
          <Text style={[styles.serviceBadgeText, { color: info.color }]}>
            {info.label}
          </Text>
        </View>
      </View>
      <Text style={styles.serviceDesc}>{status.description}</Text>
      <View style={styles.progressBg}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${status.progressPercent}%`,
              backgroundColor: info.color,
            },
          ]}
        />
      </View>
      <View style={styles.serviceDetails}>
        <Text style={styles.serviceDetail}>
          {status.lastDoneAt !== null
            ? `Last: ${formatDistance(status.lastDoneAt, system)} ${distanceUnitShort(system)}`
            : "Never logged"}
        </Text>
        <Text
          style={[
            styles.serviceDetail,
            { color: info.color, fontWeight: theme.fontWeight.semibold },
          ]}
        >
          {status.kmRemaining > 0
            ? `${formatDistance(status.kmRemaining, system)} ${distanceUnitShort(system)} left`
            : `${formatDistance(Math.abs(status.kmRemaining), system)} ${distanceUnitShort(system)} overdue`}
        </Text>
      </View>
    </View>
  );
};

// ---------- StatTile ----------
interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  unit,
  accent,
}) => {
  return (
    <View
      style={[
        styles.statTile,
        accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : null,
      ]}
    >
      <Text style={styles.statTileLabel}>{label}</Text>
      <View style={styles.statTileValueRow}>
        <Text style={styles.statTileValue}>{value}</Text>
        {unit && <Text style={styles.statTileUnit}>{unit}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Vehicle card
  vehicleCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  vehicleHeader: { flexDirection: "row", alignItems: "center" },
  vehicleIconBox: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.md,
  },
  vehicleIconText: { fontSize: 26 },
  vehicleNickname: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    marginBottom: 2,
  },
  vehicleSub: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  vehicleBadge: {
    backgroundColor: theme.colors.warning,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  vehicleBadgeText: {
    color: "#000",
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
  },
  vehicleDivider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: theme.spacing.md,
  },
  vehicleFooter: { flexDirection: "row" },
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

  // Service card
  serviceCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  serviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  serviceType: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    flex: 1,
  },
  serviceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  serviceBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0.5,
  },
  serviceDesc: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing.md,
  },
  progressBg: {
    height: 6,
    backgroundColor: theme.colors.bgInput,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: theme.spacing.sm,
  },
  progressFill: { height: "100%", borderRadius: 3 },
  serviceDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  serviceDetail: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },

  // Stat tile
  statTile: {
    flex: 1,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statTileLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
    textTransform: "uppercase",
  },
  statTileValueRow: { flexDirection: "row", alignItems: "baseline" },
  statTileValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.black,
  },
  statTileUnit: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginLeft: 4,
  },
});
