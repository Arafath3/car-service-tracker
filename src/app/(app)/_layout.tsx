import { Stack } from 'expo-router';
import { theme } from '@/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="vehicle/add" options={{ presentation: 'modal' }} />
      <Stack.Screen name="vehicle/[id]" />
      <Stack.Screen name="vehicle/edit-odometer" options={{ presentation: 'modal' }} />
      <Stack.Screen name="vehicle/track-trip" options={{ presentation: 'modal' }} />
      <Stack.Screen name="vehicle/add-service" options={{ presentation: 'modal' }} />
      <Stack.Screen name="detection/index" />
      <Stack.Screen name="detection/confirm" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
