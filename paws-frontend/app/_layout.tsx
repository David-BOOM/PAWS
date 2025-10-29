import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ThemeProvider, useTheme } from "../components/theme";

export default function Layout() {
  return (
    <ThemeProvider>
      <ThemedTabs />
    </ThemeProvider>
  );
}

function ThemedTabs() {
  const { colors, effectiveScheme } = useTheme();

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
        <Tabs.Screen name="settings" options={{ title: "Settings" }} />
        <Tabs.Screen name="modal" options={{ title: "Summery" }} />
      </Tabs>
      <StatusBar style={effectiveScheme === "dark" ? "light" : "dark"} />
    </>
  );
}
