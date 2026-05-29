import React, { useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Pressable,
} from "react-native";
import { theme } from "@/theme";

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

export interface ThemedAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onRequestClose?: () => void; // backdrop tap / Android back
}

export const ThemedAlert: React.FC<ThemedAlertProps> = ({
  visible,
  title,
  message,
  buttons = [{ text: "OK" }],
  onRequestClose,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.92);
    }
  }, [visible]);

  const stacked = buttons.length > 2;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={[styles.buttonWrap, stacked && styles.buttonColumn]}>
            {buttons.map((b, i) => {
              const isDestructive = b.style === "destructive";
              const isCancel = b.style === "cancel";
              const isDefault = !isDestructive && !isCancel;
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.8}
                  onPress={() => {
                    onRequestClose?.();
                    b.onPress?.();
                  }}
                  style={[
                    styles.button,
                    stacked ? styles.buttonStacked : styles.buttonInline,
                    isDefault && styles.buttonDefault,
                    isCancel && styles.buttonCancel,
                    isDestructive && styles.buttonDestructive,
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isDefault && styles.buttonTextDefault,
                      isCancel && styles.buttonTextCancel,
                      isDestructive && styles.buttonTextDestructive,
                    ]}
                  >
                    {b.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    textAlign: "center",
  },
  message: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    textAlign: "center",
    marginTop: theme.spacing.sm,
    lineHeight: 22,
  },
  buttonWrap: {
    flexDirection: "row",
    marginTop: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  buttonColumn: { flexDirection: "column" },
  button: {
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonInline: { flex: 1 },
  buttonStacked: { width: "100%" },
  buttonDefault: { backgroundColor: theme.colors.accent },
  buttonCancel: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  buttonDestructive: { backgroundColor: theme.colors.danger },
  buttonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  buttonTextDefault: { color: "#fff" },
  buttonTextCancel: { color: theme.colors.textSecondary },
  buttonTextDestructive: { color: "#fff" },
});
