import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ServiceStatus } from "../lib/serviceIntervals";
import { theme } from "../theme";
import { useUnits } from "@/context/UnitContext";
import {
  formatDistance,
  distanceUnitLong,
  distanceUnitShort,
} from "@/lib/units";
interface Props {
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

export const ServiceStatusCard: React.FC<Props> = ({ status }) => {
  const info = statusInfo[status.status];
  const { system } = useUnits();

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.serviceType}>{status.serviceType}</Text>
        <View style={[styles.badge, { backgroundColor: info.soft }]}>
          <Text style={[styles.badgeText, { color: info.color }]}>
            {info.label}
          </Text>
        </View>
      </View>

      <Text style={styles.description}>{status.description}</Text>

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
      {status.daysRemaining != null && (
        <Text
          style={{
            color:
              status.status === "overdue"
                ? theme.colors.danger
                : theme.colors.textSecondary,
            fontSize: theme.fontSize.xs,
            marginTop: 2,
          }}
        >
          {status.daysRemaining <= 0
            ? `${Math.abs(status.daysRemaining)} days overdue`
            : `${status.daysRemaining} days remaining`}
        </Text>
      )}
      {status.source === "sticker" && (
        <Text
          style={{
            color: theme.colors.accent,
            fontSize: theme.fontSize.xs,
            marginTop: 2,
          }}
        >
          📋 From mechanic
        </Text>
      )}
      {status.source === "estimated" && (
        <Text
          style={{
            color: theme.colors.warning,
            fontSize: theme.fontSize.xs,
            marginTop: 2,
          }}
        >
          ~ Estimated
        </Text>
      )}

      <View style={styles.detailsRow}>
        <Text style={styles.detail}>
          {status.lastDoneAt !== null
            ? `Last: ${formatDistance(status.lastDoneAt, system)}  ${distanceUnitLong(system)}`
            : "Never logged"}
        </Text>
        <Text
          style={[
            styles.detail,
            { color: info.color, fontWeight: theme.fontWeight.semibold },
          ]}
        >
          {status.kmRemaining > 0
            ? `${formatDistance(status.kmRemaining, system)} ${distanceUnitLong(system)} left`
            : `${formatDistance(Math.abs(status.kmRemaining), system)} ${distanceUnitLong(system)} overdue`}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
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
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
  },
  badgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0.5,
  },
  description: {
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
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detail: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
});
