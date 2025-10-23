import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import QuickActionButton from "../components/QuickActionButton";
import SensorCard from "../components/SensorCard";
import { getDashboardData, triggerQuickAction } from "../services/api";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await getDashboardData();
      setData(res.data);
    } catch (err) {
      console.error("Error fetching dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>PAWS Dashboard</Text>

      {data && (
        <>
          <SensorCard label="Last Meal" value={`${data.lastMeal} g`} />
          <SensorCard label="Air Quality" value={data.aqi} />
          <SensorCard label="Temperature" value={`${data.temperature} °C`} />
          <SensorCard label="Water Level" value={data.waterLevel} />
          <SensorCard label="Device Status" value={data.deviceStatus} />
        </>
      )}

      {/* Evenly spaced vertical buttons */}
      <View style={styles.actions}>
        <QuickActionButton
          label="Dispense Food"
          onPress={() => triggerQuickAction("dispense_food")}
        />
        <QuickActionButton
          label="Refill Water"
          onPress={() => triggerQuickAction("refill_water")}
        />
        <QuickActionButton
          label="Toggle Light"
          onPress={() => triggerQuickAction("toggle_light")}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Updated layout for evenly distributed buttons
  actions: {
    flex: 1,
    marginTop: 30,
    justifyContent: "space-evenly", // evenly distribute vertically
    alignItems: "center",
  },
});
