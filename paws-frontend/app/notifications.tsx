import { useFocusEffect } from "@react-navigation/native";
import React, { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import NotificationCard from "../components/NotificationCard";
import { useTheme } from "../components/theme";
import { getNotifications } from "../services/api";

type NotificationItem = { message: string; time: string };

// --- Demo notification generator ---
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)];
const fmtAgo = (d: Date) => {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
};
function generateSampleNotifications(count = 8): NotificationItem[] {
  const now = Date.now();
  const items: NotificationItem[] = [];
  for (let i = 0; i < count; i++) {
    const minutesAgo = randInt(5, 60 * 72); // up to 3 days
    const when = new Date(now - minutesAgo * 60000);
    const type = randInt(1, 7);
    let message = "";

    switch (type) {
      case 1: {
        const hours = randInt(4, 12);
        message = `No food intake detected in the last ${hours} hours.`;
        break;
      }
      case 2: {
        const pct = randInt(5, 25);
        message = `Low water level: ${pct}% remaining. Please refill the tank.`;
        break;
      }
      case 3: {
        const sign = Math.random() > 0.5 ? 1 : -1;
        const delta = Math.round((0.3 + Math.random() * 1.0) * 10) / 10; // 0.3..1.3 kg
        const val = (sign * delta).toFixed(1);
        message = `Abnormal weight change detected: ${val} kg over the last week.`;
        break;
      }
      case 4: {
        const hours = randInt(2, 8);
        message = `No movement detected for ${hours} hours. Please check on your pet.`;
        break;
      }
      case 5: {
        const grams = randInt(20, 80);
        message = `Food was dispensed: ${grams} g.`;
        break;
      }
      case 6: {
        message = "Reminder: Please refill the water tank.";
        break;
      }
      case 7: {
        message = "Reminder: Please refill the food hopper.";
        break;
      }
    }
    items.push({ message, time: fmtAgo(when) });
  }
  // Make latest first
  return items.sort(() => Math.random() - 0.5);
}
// --- end generator ---

export default function Notifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const { colors } = useTheme();

  useFocusEffect(
    React.useCallback(() => {
      const fetchData = async () => {
        try {
          const res = await getNotifications();
          const data = Array.isArray(res?.data) ? (res.data as NotificationItem[]) : [];
          setNotifications(data.length ? data : generateSampleNotifications());
        } catch (err) {
          console.error("Error fetching notifications", err);
          setNotifications(generateSampleNotifications());
        }
      };
      fetchData();
    }, [])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
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
