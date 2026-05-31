import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import BluetoothDetection from "@/../modules/bluetooth-detection/src/BluetoothDetectionModule";
import type { PairedDevice } from "@/../modules/bluetooth-detection/src/BluetoothDetection.types";
import { theme } from "@/theme";

interface Props {
  visible: boolean;
  vehicleName: string;
  onSelect: (device: PairedDevice) => void;
  onSkip: () => void;
  onCancel: () => void;
}

export const BluetoothPickerModal: React.FC<Props> = ({
  visible,
  vehicleName,
  onSelect,
  onSkip,
  onCancel,
}) => {
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    BluetoothDetection.getPairedDevices()
      .then((d) => setDevices(d))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false));
  }, [visible]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.card}>
          <Text style={styles.title}>
            Which Bluetooth is your {vehicleName}'s?
          </Text>
          <Text style={styles.subtitle}>
            Pick the device you connect to in this vehicle — car stereo, FM
            adapter, or helmet intercom.
          </Text>

          {loading ? (
            <ActivityIndicator
              color={theme.colors.accent}
              style={{ marginVertical: theme.spacing.xl }}
            />
          ) : (
            <ScrollView
              style={{ maxHeight: 260 }}
              contentContainerStyle={{ gap: theme.spacing.sm }}
            >
              {devices.length === 0 ? (
                <Text style={styles.empty}>No paired devices found.</Text>
              ) : (
                devices.map((d) => (
                  <TouchableOpacity
                    key={d.address}
                    style={styles.deviceRow}
                    onPress={() => onSelect(d)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.deviceName}>{d.name}</Text>
                    <Text style={styles.deviceAddr}>{d.address}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}

          <Text style={styles.hint}>
            Can't find your car or intercom? Pair it in your phone's Bluetooth
            settings first, then try again.
          </Text>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={onSkip}
            activeOpacity={0.8}
          >
            <Text style={styles.skipText}>
              Skip — no Bluetooth (use GPS only)
            </Text>
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
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 380,
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
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    lineHeight: 19,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: theme.spacing.lg,
  },
  deviceRow: {
    backgroundColor: theme.colors.bgInput,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  deviceName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  deviceAddr: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing.md,
    lineHeight: 16,
  },
  skipBtn: {
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  skipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
});
