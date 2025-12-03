import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import NotificationCard from "../components/NotificationCard";
import { useTheme } from "../components/theme";
import { getNotifications } from "../services/api";
import { AUTO_REFRESH_INTERVAL_MS } from "../services/config";

type NotificationItem = { message: string; time: string };

// Convert ISO timestamp to human-readable local time
const formatTime = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString; // Return original if invalid
    
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    const timeStr = date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    
    if (isToday) {
      return `Today at ${timeStr}`;
    } else if (isYesterday) {
      return `Yesterday at ${timeStr}`;
    } else {
      const dateStr = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: now.getFullYear() !== date.getFullYear() ? "numeric" : undefined,
      });
      return `${dateStr} at ${timeStr}`;
    }
  } catch {
    return isoString; // Return original on error
  }
};

export default function Notifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await getNotifications();
      const data = Array.isArray(res?.data) ? (res.data as NotificationItem[]) : [];
      setNotifications(data);
    } catch (err) {
      console.error("Error fetching notifications", err);
      setError("Failed to load notifications from database");
      setNotifications([]);
    }
  }, []);

  // Initial fetch and auto-refresh synced with Arduino upload rate
  useFocusEffect(
    useCallback(() => {
      fetchData();
      
      // Start auto-refresh interval
      intervalRef.current = setInterval(() => {
        fetchData();
      }, AUTO_REFRESH_INTERVAL_MS);

      // Cleanup on blur
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, [fetchData])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
      {!!error && <Text style={{ color: colors.text, marginBottom: 8 }}>{error}</Text>}
      <FlatList
        data={notifications}
        keyExtractor={(_, index) => index.toString()}
        renderItem={({ item }) => <NotificationCard message={item.message} time={formatTime(item.time)} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
});
