import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Clipboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import type { Vehicle } from "@/types";
import {
  getVehicles,
  createInviteCode,
  redeemInviteCode,
  leaveSharedVehicle,
} from "@/lib/storage";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { theme } from "@/theme";
import { safeAwait } from "@/lib/asyncWrapper";
import { ThemedAlert, AlertButton } from "@/components/ThemedAlert";

export default function ShareVehicleScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id: vehicleId } = useLocalSearchParams<{ id: string }>();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [busy, setBusy] = useState(false);

  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message?: string;
    buttons?: AlertButton[];
  } | null>(null);

  const load = useCallback(async () => {
    if (!vehicleId) return;
    const all = await getVehicles();
    setVehicle(all.find((v) => v.id === vehicleId) ?? null);
    setLoading(false);
  }, [vehicleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const isGuest = !user || user.isGuest;
  const members = vehicle?.memberIds ?? (vehicle ? [vehicle.userId] : []);
  const memberCount = members.length;
  const isShared = memberCount > 1;
  const amOwner = !!user && vehicle?.ownerId === user.id;

  const handleGenerate = async () => {
    if (!vehicleId) return;
    setGenerating(true);
    const [err, generated] = await safeAwait(createInviteCode(vehicleId));
    setGenerating(false);
    if (err || !generated) {
      setAlertConfig({
        title: "Couldn't create code",
        message:
          "Something went wrong generating the invite code. Please try again.",
      });
      return;
    }
    setCode(generated);
  };

  const handleCopy = () => {
    if (!code) return;
    Clipboard.setString(code);
    setAlertConfig({
      title: "Copied",
      message: "Invite code copied to clipboard.",
    });
  };

  const handleJoin = async () => {
    setJoinError("");
    const trimmed = joinCode.trim();
    if (!trimmed) {
      setJoinError("Enter a code.");
      return;
    }
    setJoining(true);
    const [err, joined] = await safeAwait(redeemInviteCode(trimmed));
    setJoining(false);
    if (err || !joined) {
      setJoinError(
        (err as Error)?.message?.includes("valid")
          ? "That code isn't valid."
          : "Couldn't join. Check the code and try again.",
      );
      return;
    }
    setJoinCode("");
    setAlertConfig({
      title: "Joined!",
      message: `You now share "${joined.nickname || `${joined.make} ${joined.model}`}". Its odometer stays in sync between you both.`,
      buttons: [{ text: "OK", onPress: () => router.back() }],
    });
  };

  const handleLeave = () => {
    if (!vehicleId) return;
    setAlertConfig({
      title: "Leave shared vehicle?",
      message:
        "You'll stop seeing this vehicle and its synced odometer. The other person keeps it. You can rejoin later with a new code.",
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const [err] = await safeAwait(leaveSharedVehicle(vehicleId));
            setBusy(false);
            if (err) {
              setAlertConfig({
                title: "Couldn't leave",
                message: "Something went wrong. Please try again.",
              });
              return;
            }
            router.dismissAll(); // pop every modal back to the tab
            router.replace("/(app)");
          },
        },
      ],
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator
          color={theme.colors.accent}
          size="large"
          style={{ flex: 1 }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelText}>Close</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Share Vehicle</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {isGuest ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in to share</Text>
            <Text style={styles.cardBody}>
              Sharing keeps a vehicle's odometer in sync between accounts. Guest
              data lives only on this device, so you'll need an account to
              share.
            </Text>
          </View>
        ) : (
          <>
            {vehicle && (
              <View style={styles.vehicleBlock}>
                <Text style={styles.vehicleEmoji}>
                  {vehicle.type === "car" ? "🚗" : "🏍️"}
                </Text>
                <Text style={styles.vehicleName}>
                  {vehicle.nickname || `${vehicle.make} ${vehicle.model}`}
                </Text>
                <Text style={styles.memberLine}>
                  {isShared ? `Shared · ${memberCount} people` : "Only you"}
                </Text>
              </View>
            )}

            {/* GENERATE CODE — invite someone to this vehicle */}
            <Text style={styles.sectionLabel}>INVITE SOMEONE</Text>
            <Text style={styles.hint}>
              Generate a code and send it to the other person. They enter it in
              their app to share this vehicle's odometer.
            </Text>

            {code ? (
              <View style={styles.codeCard}>
                <Text style={styles.codeLabel}>SHARE THIS CODE</Text>
                <Text style={styles.codeValue}>{code}</Text>
                <TouchableOpacity onPress={handleCopy} style={styles.copyBtn}>
                  <Text style={styles.copyText}>Copy</Text>
                </TouchableOpacity>
                <Text style={styles.codeFootnote}>
                  Anyone with this code can join until you remove them. Share it
                  only with people you trust.
                </Text>
              </View>
            ) : (
              <Button
                title="Generate invite code"
                onPress={handleGenerate}
                loading={generating}
                fullWidth
                size="lg"
              />
            )}

            {/* JOIN — redeem a code from someone else */}
            <Text
              style={[styles.sectionLabel, { marginTop: theme.spacing.xl }]}
            >
              JOIN A SHARED VEHICLE
            </Text>
            <Text style={styles.hint}>
              Got a code from someone? Enter it to share their vehicle.
            </Text>
            <Input
              label="Invite code"
              value={joinCode}
              onChangeText={(t) => {
                setJoinCode(t.toUpperCase());
                setJoinError("");
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="e.g. 7F3K2Q"
              error={joinError}
            />
            <Button
              title="Join vehicle"
              onPress={handleJoin}
              loading={joining}
              variant="secondary"
              fullWidth
              size="lg"
            />

            {/* LEAVE — only shown when actually shared */}
            {isShared && (
              <>
                <Text
                  style={[styles.sectionLabel, { marginTop: theme.spacing.xl }]}
                >
                  MEMBERSHIP
                </Text>
                <Text style={styles.hint}>
                  {amOwner
                    ? "You created this vehicle. You can leave, but the other person keeps their copy."
                    : "You joined this shared vehicle. Leaving removes it from your account only."}
                </Text>
                <Button
                  title="Leave shared vehicle"
                  onPress={handleLeave}
                  loading={busy}
                  variant="danger"
                  fullWidth
                  size="lg"
                />
              </>
            )}
          </>
        )}
      </ScrollView>

      <ThemedAlert
        visible={!!alertConfig}
        title={alertConfig?.title ?? ""}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={() => setAlertConfig(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  vehicleBlock: {
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  vehicleEmoji: { fontSize: 40 },
  vehicleName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    marginTop: theme.spacing.sm,
  },
  memberLine: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
    marginBottom: theme.spacing.sm,
  },
  hint: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing.md,
    lineHeight: 19,
  },
  card: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    marginBottom: theme.spacing.sm,
  },
  cardBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  codeCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  codeLabel: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 3,
  },
  codeValue: {
    color: theme.colors.textPrimary,
    fontSize: 40,
    fontWeight: theme.fontWeight.black,
    letterSpacing: 6,
    marginTop: theme.spacing.sm,
  },
  copyBtn: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  copyText: {
    color: theme.colors.accent,
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.sm,
  },
  codeFootnote: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
    marginTop: theme.spacing.md,
    lineHeight: 16,
  },
});
