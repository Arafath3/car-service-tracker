// ============================================================================
// NOTIFICATION SETUP
// ============================================================================
// Configures how notifications are shown and handles user taps on them.
// ============================================================================

import * as Notifications from 'expo-notifications';
import { NavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let navigationRef: NavigationContainerRef<RootStackParamList> | null = null;
let pendingNavigation: { tripId: string } | null = null;

export const setNavigationRef = (
  ref: NavigationContainerRef<RootStackParamList> | null
): void => {
  navigationRef = ref;
  // If a notification was tapped before nav was ready, handle it now
  if (pendingNavigation && ref) {
    ref.navigate('ConfirmTrip', { pendingTripId: pendingNavigation.tripId });
    pendingNavigation = null;
  }
};

export const configureNotificationListeners = (): (() => void) => {
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as any;
      if (data?.type === 'trip_confirmation' && data?.pendingTripId) {
        if (navigationRef && navigationRef.isReady()) {
          navigationRef.navigate('ConfirmTrip', { pendingTripId: data.pendingTripId });
        } else {
          pendingNavigation = { tripId: data.pendingTripId };
        }
      }
    }
  );

  return () => {
    responseSubscription.remove();
  };
};
