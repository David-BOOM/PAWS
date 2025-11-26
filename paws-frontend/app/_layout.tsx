import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { ThemeProvider, useTheme } from "../components/theme";
import { getNotifications, markNotificationsPushed } from "../services/api";
import { AUTO_REFRESH_INTERVAL_MS } from "../services/config";
import {
  addNotificationResponseListener,
  NotificationType,
  registerForPushNotificationsAsync,
  sendLocalNotification,
} from "../services/pushNotifications";

export default function Layout() {
  return (
    <ThemeProvider>
      <ThemedTabs />
    </ThemeProvider>
  );
}

function ThemedTabs() {
  const { colors, effectiveScheme } = useTheme();
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const lastCheckedRef = useRef<string | null>(null);

  useEffect(() => {
    // Initialize push notifications
    registerForPushNotificationsAsync();

    // Listen for notification taps
    responseListener.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      console.log("Notification tapped:", data);
      // Could navigate to specific screen based on notification type
    });

    // Start polling for new notifications that need push
    const checkForNewNotifications = async () => {
      try {
        const res = await getNotifications();
        const notifications = Array.isArray(res?.data) ? res.data : [];
        
        // Find notifications that have pushType but haven't been pushed yet
        const toPush = notifications.filter(
          (n: any) => n.pushType && !n.pushed
        );

        if (toPush.length > 0) {
          // Send local push notifications
          const pushedTimes: string[] = [];
          for (const notification of toPush) {
            await sendLocalNotification(
              notification.pushType as NotificationType,
              notification.message
            );
            pushedTimes.push(notification.time);
          }

          // Mark as pushed on server
          if (pushedTimes.length > 0) {
            await markNotificationsPushed(pushedTimes);
          }
        }
      } catch (error) {
        // Silently fail - don't disrupt the app
        console.log("Error checking notifications:", error);
      }
    };

    // Check immediately and then on interval
    checkForNewNotifications();
    const interval = setInterval(checkForNewNotifications, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return (
    <>
      <Tabs
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === "index") iconName = "home";
            else if (route.name === "feeding") iconName = "fast-food";
            else if (route.name === "environment") iconName = "leaf";
            else if (route.name === "notifications") iconName = "notifications";
            else if (route.name === "settings") iconName = "settings";
            else if (route.name === "modal") iconName = "information-circle";
            return <Ionicons name={iconName as any} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: effectiveScheme === "dark" ? "#9ca3af" : "gray",
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
          },
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
          sceneStyle: { backgroundColor: colors.background },

          // Added: performance improvements
          lazy: true,
          detachInactiveScreens: true,
          freezeOnBlur: true,
        })}
      >
        <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
        <Tabs.Screen name="feeding" options={{ title: "Feeding" }} />
        <Tabs.Screen name="environment" options={{ title: "Environment" }} />
        <Tabs.Screen name="notifications" options={{ title: "Notifications" }} />
        <Tabs.Screen name="modal" options={{ title: "Summery" }} />
        <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      </Tabs>
      <StatusBar style={effectiveScheme === "dark" ? "light" : "dark"} />
    </>
  );
}
