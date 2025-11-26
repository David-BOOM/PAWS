import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import QuickActionButton from "../components/QuickActionButton";
import SensorCard from "../components/SensorCard";
import { useTheme } from "../components/theme";
import { getDashboardData, triggerQuickAction } from "../services/api";
import { AUTO_REFRESH_INTERVAL_MS, REQUEST_TIMEOUT_MS } from "../services/config";

// Helper to format water level display
const formatWaterLevel = (waterLevel?: number, waterLevelState?: string) => {
  // If we have a numeric water level, use threshold to determine state
  if (waterLevel != null) {
    return waterLevel <= 20 ? "Low" : "Sufficient";
  }
  // Fall back to state string
  if (waterLevelState) {
    return waterLevelState === "low" ? "Low" : "Sufficient";
  }
  return "N/A";
};

// Check if water level is low
const isWaterLow = (waterLevel?: number, waterLevelState?: string) => {
  if (waterLevel != null) return waterLevel <= 20;
  return waterLevelState === "low";
};

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lightOn, setLightOn] = useState<boolean>(false);
  const { colors, effectiveScheme } = useTheme();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      const res = await withTimeout(getDashboardData());
      setData(res.data);
      const initialLight =
        (res?.data?.lightOn as boolean | undefined) ??
        (res?.data?.deviceStatus?.lightOn as boolean | undefined) ??
        false;
      setLightOn(Boolean(initialLight));
    } catch (err) {
      console.error("Error fetching dashboard data", err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  // Initial fetch and auto-refresh synced with Arduino upload rate
  useFocusEffect(
    useCallback(() => {
      fetchData(true); // Show spinner on initial load
      
      // Start auto-refresh interval
      intervalRef.current = setInterval(() => {
        fetchData(false); // Silent refresh
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

  const withTimeout = <T,>(p: Promise<T>, ms = REQUEST_TIMEOUT_MS) =>
    Promise.race<T>([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
    ]);

  const handleToggleLight = async (next: boolean) => {
    setLightOn(next);
    try {
      await triggerQuickAction("toggle_light");
    } catch (e) {
      console.error("Error toggling light", e);
      setLightOn(!next);
    }
  };

  const formatLastMealTime = (iso?: string) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const handleResetFood = async () => {
    try {
      await triggerQuickAction("reset_food_amount");
      fetchData();
    } catch (e) {
      console.error("Error resetting food amount", e);
    }
  };

  if (loading && !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.text }}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>PAWS Dashboard</Text>

      {data && (
        <>
          <SensorCard
            label="Last Meal"
            value={(() => {
              const lastMealAmount = data.lastMeal != null ? `${data.lastMeal} g` : "Not recorded";
              const lastMealTimeText = formatLastMealTime(data.lastMealTime);
              return lastMealTimeText ? `${lastMealAmount} • ${lastMealTimeText}` : lastMealAmount;
            })()}
          />
          <SensorCard label="Air Quality" value={data.aqi ?? "N/A"} />
          <SensorCard label="Temperature" value={data.temperature != null ? `${data.temperature} °C` : "N/A"} />
          <SensorCard 
            label="Water Level" 
            value={formatWaterLevel(data.waterLevel, data.waterLevelState)}
            valueStyle={isWaterLow(data.waterLevel, data.waterLevelState) ? { color: "#dc2626" } : undefined}
          />
          <SensorCard
            label="Device Status"
            value={data.deviceStatus ?? "N/A"}
            valueStyle={
              data.deviceStatus === "Online" 
                ? { color: "#16a34a" } 
                : data.deviceStatus?.startsWith("Offline") 
                  ? { color: "#dc2626" } 
                  : undefined
            }
          />
        </>
      )}

      <View style={[styles.actions, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <QuickActionButton label="Reset Food Amount" onPress={handleResetFood} />
        <QuickActionButton label="Dispense Food" onPress={() => triggerQuickAction("dispense_food")} />
        <QuickActionButton label="Refill Water" onPress={() => triggerQuickAction("refill_water")} />
        <View style={[styles.controlRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.controlLabel, { color: colors.text }]}>Light</Text>
          <Switch
            value={lightOn}
            onValueChange={handleToggleLight}
            trackColor={{ false: effectiveScheme === "dark" ? "#4b5563" : "#ccc", true: colors.primary }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  actions: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  controlRow: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  controlLabel: { fontSize: 16, fontWeight: "500" },
});
