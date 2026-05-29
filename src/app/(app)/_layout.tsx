import { Stack, ErrorBoundaryProps } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { theme } from "@/theme";

// Fallback shown when a screen in this group crashes during render
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
        backgroundColor: theme.colors.bg,
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: "bold",
          color: theme.colors.textPrimary,
          marginBottom: 8,
        }}
      >
        Something went wrong
      </Text>
      <Text
        style={{
          textAlign: "center",
          color: theme.colors.textSecondary,
          marginBottom: 16,
        }}
      >
        {error.message}
      </Text>
      <TouchableOpacity onPress={retry} style={{ padding: 12 }}>
        <Text style={{ color: theme.colors.accent, fontWeight: "bold" }}>
          Try again
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// The actual layout — this is what renders normally
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="vehicle/add" options={{ presentation: "modal" }} />
      <Stack.Screen name="vehicle/[id]" />
      <Stack.Screen
        name="vehicle/edit-odometer"
        options={{ presentation: "modal" }}
      />
      <Stack.Screen
        name="vehicle/track-trip"
        options={{ presentation: "modal" }}
      />
      <Stack.Screen
        name="vehicle/add-service"
        options={{ presentation: "modal" }}
      />
      <Stack.Screen name="detection/index" />
      <Stack.Screen
        name="detection/confirm"
        options={{ presentation: "modal" }}
      />
      <Stack.Screen
        name="vehicle/rough-estimate"
        options={{ presentation: "modal" }}
      />
      <Stack.Screen
        name="vehicle/manage-intervals"
        options={{ presentation: "modal" }}
      />
    </Stack>
  );
}
