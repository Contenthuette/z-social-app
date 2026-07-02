import { Platform } from "react-native";
import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

// Dynamic imports for expo-notifications (native only)
interface PushTokenData {
  data: string;
}

interface PermissionResponse {
  status: string;
}

interface NotificationsModule {
  getPermissionsAsync: () => Promise<PermissionResponse>;
  requestPermissionsAsync: () => Promise<PermissionResponse>;
  getExpoPushTokenAsync: (opts?: { projectId?: string }) => Promise<PushTokenData>;
  setNotificationHandler: (handler: unknown) => void;
  setNotificationChannelAsync?: (id: string, channel: unknown) => Promise<unknown>;
}

// Show notifications as banners even while the app is in the foreground.
// Without this, iOS silently drops incoming push while the app is open.
let handlerConfigured = false;
function configureNotificationHandler(Notifications: NotificationsModule) {
  if (handlerConfigured) return;
  handlerConfigured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        // Newer expo-notifications uses shouldShowBanner/shouldShowList;
        // older uses shouldShowAlert. Provide all for compatibility.
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // ignore
  }
}

interface ConstantsModule {
  expoConfig?: { extra?: { eas?: { projectId?: string } } };
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const Notifications = require("expo-notifications") as NotificationsModule;
    const Constants = require("expo-constants") as { default: ConstantsModule };

    configureNotificationHandler(Notifications);

    // Android needs a notification channel for heads-up notifications
    if (Platform.OS === "android" && Notifications.setNotificationChannelAsync) {
      try {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Standard",
          importance: 4, // MAX — heads-up banner
          sound: "default",
        });
      } catch { /* ignore */ }
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    const projectId = Constants.default?.expoConfig?.extra?.eas?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId ?? undefined,
    });

    return tokenData.data;
  } catch (error) {
    console.warn("Push notification registration failed:", error);
    return null;
  }
}

export function usePushNotifications() {
  const recordToken = useMutation(api.pushNotifications.recordToken);
  const hasRegistered = useRef(false);

  useEffect(() => {
    if (hasRegistered.current) return;
    if (Platform.OS === "web") return;

    hasRegistered.current = true;

    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        recordToken({ pushToken: token }).catch(console.warn);
      }
    });
  }, [recordToken]);
}
