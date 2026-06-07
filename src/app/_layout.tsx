import React, { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { theme } from "@/theme";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { configureNotificationListeners } from "@/lib/notifications";
import { reconcileColdTrips } from "@/lib/passiveDetectionService";
import { AppState } from "react-native";
import { useLinkingURL } from "expo-linking";
import { getAwaitingConfirmation } from "@/lib/storage";
import { UnitProvider } from "@/context/UnitContext";
import { UnitOnboardingModal } from "@/components/UnitOnboardingModal";
// IMPORTANT: This import registers the background task at module load,
// before any UI renders. Required for Android to wake the app properly.
import "@/lib/passiveDetectionService";

const InitialLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const launchUrl = useLinkingURL();
  const handledRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = (segments[0] as string) === "(auth)";
    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      router.replace("/(app)");
    }
  }, [user, loading, segments]);

  useEffect(() => {
    if (loading || !user) return;

    const run = async () => {
      // Always: turn any sealed files into real PendingTrips first.
      await reconcileColdTrips();

      // Was the app opened by the native "trip ended" notification?
      const fromColdNotification =
        !!launchUrl && launchUrl.includes("coldTrip=1") && !handledRef.current;

      if (fromColdNotification) {
        handledRef.current = true;
        const awaiting = await getAwaitingConfirmation();
        const newest = [...awaiting].sort((a, b) => b.endTime - a.endTime)[0];
        if (newest) {
          router.push({
            pathname: "/(app)/detection/confirm",
            params: { id: newest.id },
          });
        }
      }
    };

    run().catch((e) => console.error("[ColdTrip]", e));

    // Foreground reconcile — unchanged
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        reconcileColdTrips().catch((e) => console.error("[ColdTrip]", e));
      }
    });
    return () => sub.remove();
  }, [user, loading, launchUrl]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    />
  );
};

export default function RootLayout() {
  useEffect(() => {
    const cleanup = configureNotificationListeners();
    return cleanup;
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <UnitProvider>
            <StatusBar style="light" />
            <InitialLayout />
            <UnitOnboardingModal />
          </UnitProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
