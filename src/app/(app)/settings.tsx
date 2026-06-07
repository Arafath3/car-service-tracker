import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useUnits } from "@/context/UnitContext";
import type { UnitSystem } from "@/lib/units";
import { theme } from "@/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { system, setSystem } = useUnits();

  const UnitButton: React.FC<{
    value: UnitSystem;
    label: string;
    sub: string;
  }> = ({ value, label, sub }) => {
    const active = system === value;
    return (
      <TouchableOpacity
        style={[styles.segment, active && styles.segmentActive]}
        activeOpacity={0.85}
        onPress={() => setSystem(value)}
      >
        <Text
          style={[styles.segmentLabel, active && styles.segmentLabelActive]}
        >
          {label}
        </Text>
        <Text style={[styles.segmentSub, active && styles.segmentSubActive]}>
          {sub}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* UNITS */}
        <Text style={styles.sectionLabel}>UNITS</Text>
        <View style={styles.segmentRow}>
          <UnitButton value="metric" label="Kilometers" sub="km · km/h" />
          <View style={{ width: theme.spacing.sm }} />
          <UnitButton value="imperial" label="Miles" sub="mi · mph" />
        </View>
        <Text style={styles.hint}>
          Distances and speed are shown in your chosen units. Your data is
          always stored internally, so switching is safe at any time.
        </Text>

        {/* THEME (disabled placeholder) */}
        <Text style={[styles.sectionLabel, { marginTop: theme.spacing.xl }]}>
          APPEARANCE
        </Text>
        <View style={[styles.row, styles.rowDisabled]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Theme</Text>
            <Text style={styles.rowSub}>System · Light · Dark</Text>
          </View>
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonText}>COMING SOON</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  backText: { color: theme.colors.accent, fontSize: theme.fontSize.md },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  scroll: { padding: theme.spacing.lg },
  sectionLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1.5,
    marginBottom: theme.spacing.sm,
  },
  segmentRow: { flexDirection: "row" },
  segment: {
    flex: 1,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border ?? "#333",
    padding: theme.spacing.md,
    alignItems: "center",
  },
  segmentActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft ?? theme.colors.bgCard,
  },
  segmentLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  segmentLabelActive: { color: theme.colors.accent },
  segmentSub: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  segmentSubActive: { color: theme.colors.accent },
  hint: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing.sm,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  rowDisabled: { opacity: 0.5 },
  rowTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold ?? "600",
  },
  rowSub: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  comingSoon: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  comingSoonText: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 1,
  },
});
