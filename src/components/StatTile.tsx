import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../theme";

interface Props {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}

export const StatTile: React.FC<Props> = ({ label, value, unit, accent }) => {
  return (
    <View
      style={[
        styles.tile,
        accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : null,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
    textTransform: "uppercase",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  value: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.black,
  },
  unit: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginLeft: 4,
  },
});
