import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useUnits } from "@/context/UnitContext";
import { theme } from "@/theme";

export const UnitOnboardingModal: React.FC = () => {
  const { ready, hasChosen, setSystem } = useUnits();
  const visible = ready && !hasChosen;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.emoji}>📏</Text>
          <Text style={styles.title}>Which units do you use?</Text>
          <Text style={styles.subtitle}>
            Pick how distances and speed are shown. You can change this anytime
            in Settings.
          </Text>

          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.85}
            onPress={() => setSystem("metric")}
          >
            <Text style={styles.optionTitle}>Kilometers</Text>
            <Text style={styles.optionSub}>km · km/h — metric</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.85}
            onPress={() => setSystem("imperial")}
          >
            <Text style={styles.optionTitle}>Miles</Text>
            <Text style={styles.optionSub}>mi · mph — imperial</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  card: {
    width: "100%",
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: "center",
  },
  emoji: { fontSize: 40, marginBottom: theme.spacing.sm },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    textAlign: "center",
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
  },
  option: {
    width: "100%",
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border ?? "#333",
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    alignItems: "center",
  },
  optionTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  optionSub: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
});
