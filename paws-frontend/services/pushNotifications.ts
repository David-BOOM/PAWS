import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Notification types for important events
export type NotificationType =
  | "feeding_time"
  | "feeding_complete"
  | "water_low"
  | "abnormal_barking"
  | "air_quality_alert"
  | "motion_detected"
  | "pet_activity"
  | "system_alert";

// Get notification title and configure based on type
const getNotificationConfig = (type: NotificationType) => {
  const configs: Record<NotificationType, { title: string; sound: boolean; priority: Notifications.AndroidNotificationPriority }> = {
    feeding_time: {
      title: "🍽️ Feeding Time",
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    feeding_complete: {
      title: "✅ Feeding Complete",
      sound: false,
      priority: Notifications.AndroidNotificationPriority.DEFAULT,
    },
    water_low: {
      title: "💧 Water Level Low",
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    abnormal_barking: {
      title: "🐕 Abnormal Barking Detected",
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    air_quality_alert: {
      title: "🌬️ Air Quality Alert",
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    motion_detected: {
      title: "👀 Motion Detected",
      sound: false,
      priority: Notifications.AndroidNotificationPriority.DEFAULT,
    },
    pet_activity: {
      title: "🐾 Pet Activity",
      sound: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
    },
    system_alert: {
      title: "⚠️ PAWS Alert",
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
  };
  return configs[type] || configs.system_alert;
};

// Request notification permissions
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  // Set up Android notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("paws-alerts", {
      name: "PAWS Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF6B35",
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });

    // Create a separate channel for critical alerts
    await Notifications.setNotificationChannelAsync("paws-critical", {
      name: "PAWS Critical Alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: "#FF0000",
      sound: "default",
      enableVibrate: true,
      showBadge: true,
      bypassDnd: true,
    });
  }

  // Check if running on a physical device
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Failed to get push notification permissions");
      return null;
    }

    // Get the Expo push token (for future remote push notifications)
    try {
      const pushToken = await Notifications.getExpoPushTokenAsync({
        projectId: "paws-pet-care", // Replace with your Expo project ID if using EAS
      });
      token = pushToken.data;
      console.log("Push notification token:", token);
    } catch (error) {
      console.log("Error getting push token (this is normal for local notifications):", error);
    }
  } else {
    console.log("Push notifications require a physical device");
  }

  return token;
}

// Schedule an immediate local notification
export async function sendLocalNotification(
  type: NotificationType,
  body: string,
  data?: Record<string, unknown>
): Promise<string | null> {
  const config = getNotificationConfig(type);
  const isCritical = type === "abnormal_barking" || type === "water_low" || type === "air_quality_alert";

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: config.title,
        body,
        sound: config.sound ? "default" : undefined,
        priority: config.priority,
        data: { type, ...data },
        badge: 1,
      },
      trigger: null, // null = immediate
    });

    console.log(`Local notification sent: ${type} - ${body}`);
    return notificationId;
  } catch (error) {
    console.error("Error sending local notification:", error);
    return null;
  }
}

// Schedule a notification for a specific time (e.g., feeding time)
export async function scheduleNotification(
  type: NotificationType,
  body: string,
  triggerDate: Date,
  data?: Record<string, unknown>
): Promise<string | null> {
  const config = getNotificationConfig(type);

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: config.title,
        body,
        sound: config.sound ? "default" : undefined,
        priority: config.priority,
        data: { type, ...data },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });

    console.log(`Scheduled notification for ${triggerDate.toISOString()}: ${type}`);
    return notificationId;
  } catch (error) {
    console.error("Error scheduling notification:", error);
    return null;
  }
}

// Schedule daily feeding reminders
export async function scheduleFeedingReminders(
  meal1Time?: string,
  meal2Time?: string
): Promise<void> {
  // Cancel existing feeding reminders
  await cancelNotificationsByType("feeding_time");

  const scheduleDaily = async (timeStr: string, mealName: string) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🍽️ Feeding Time",
          body: `Time for ${mealName}! Your pet is waiting.`,
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { type: "feeding_time", mealTime: timeStr },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: hours,
          minute: minutes,
        },
      });
      console.log(`Scheduled daily feeding reminder at ${timeStr}`);
    } catch (error) {
      console.error(`Error scheduling feeding reminder at ${timeStr}:`, error);
    }
  };

  if (meal1Time) await scheduleDaily(meal1Time, "breakfast");
  if (meal2Time) await scheduleDaily(meal2Time, "dinner");
}

// Cancel notifications by type
export async function cancelNotificationsByType(type: NotificationType): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduled) {
    if (notification.content.data?.type === type) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
}

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Get all scheduled notifications
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return await Notifications.getAllScheduledNotificationsAsync();
}

// Add notification response listener (for handling taps on notifications)
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

// Add notification received listener (for handling notifications when app is open)
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}

// Dismiss all notifications from notification center
export async function dismissAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
}
