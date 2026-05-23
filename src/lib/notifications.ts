import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

// SDK 55: shouldShowBanner and shouldShowList replace shouldShowAlert
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let listenerSubscription: { remove: () => void } | null = null;

export const configureNotificationListeners = (): (() => void) => {
  if (listenerSubscription) listenerSubscription.remove();

  listenerSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as
        | { pendingTripId?: string; type?: string }
        | undefined;
      if (data?.type === 'trip_confirmation' && data?.pendingTripId) {
        // expo-router can navigate via the global router
        router.push({
          pathname: '/(app)/detection/confirm',
          params: { id: data.pendingTripId },
        });
      }
    }
  );

  return () => {
    if (listenerSubscription) {
      listenerSubscription.remove();
      listenerSubscription = null;
    }
  };
};
