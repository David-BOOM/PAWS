import { useFocusEffect } from "@react-navigation/native";
import React, { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import NotificationCard from "../components/NotificationCard";
import { useTheme } from "../components/theme";
import { getNotifications } from "../services/api";

type NotificationItem = { message: string; time: string };

export default function Notifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const fetchData = async () => {
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
      };
      fetchData();
    }, [])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
      {!!error && <Text style={{ color: colors.text, marginBottom: 8 }}>{error}</Text>}
      <FlatList
        data={notifications}
        keyExtractor={(_, index) => index.toString()}
        renderItem={({ item }) => <NotificationCard message={item.message} time={item.time} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
});
