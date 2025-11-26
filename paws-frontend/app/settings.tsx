import React, { useState } from "react";
import { Alert, Button, Platform, StyleSheet, Switch, Text, View } from "react-native";
import { useTheme } from "../components/theme";
import { replaceDatabaseFile, updateSettings } from "../services/api";

// All database files to be cleared (content reset but files kept)
const DATABASE_FILES = [
  "actions",
  "activity-history",
  "analysis",
  "bark-events",
  "dashboard",
  "environment-current",
  "environment-history",
  "environment",
  "feeder-events",
  "feeding-history",
  "feeding",
  "motion-events",
  "notifications",
  "water-events",
  "weight-history",
];

// Files that should be cleared to empty arrays (list-like data)
const ARRAY_FILES = [
  "activity-history",
  "bark-events",
  "environment-history",
  "feeder-events",
  "feeding-history",
  "motion-events",
  "notifications",
  "water-events",
  "weight-history",
];

export default function Settings() {
  const [notifications, setNotifications] = useState(true);
  const [clearing, setClearing] = useState(false);
  const { preference, setPreference, effectiveScheme, colors, toggleLightDark } = useTheme();

  const useSystem = preference === "system";
  const nextLabel = effectiveScheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";

  const handleSave = async () => {
    try {
      await updateSettings({ notifications });
      alert("Settings updated!");
    } catch (err) {
      console.error("Error updating settings", err);
    }
  };

  const handleClearPastData = () => {
    const message = "Are you sure you want to clear all database data? This will remove all environment history, feeding history, event logs, and other stored data. This action cannot be undone.";
    
    // Use window.confirm for web, Alert.alert for native
    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        performClearData();
      }
    } else {
      Alert.alert(
        "Clear Past Data",
        message,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Clear",
            style: "destructive",
            onPress: performClearData,
          },
        ]
      );
    }
  };

  const performClearData = async () => {
    setClearing(true);
    try {
      // Clear each database file by replacing with empty array or object
      const clearPromises = DATABASE_FILES.map((file) =>
        replaceDatabaseFile(file, ARRAY_FILES.includes(file) ? [] : {})
      );
      await Promise.all(clearPromises);
      
      if (Platform.OS === "web") {
        window.alert("All database data has been cleared.");
      } else {
        Alert.alert("Success", "All database data has been cleared.");
      }
    } catch (err) {
      console.error("Error clearing data:", err);
      if (Platform.OS === "web") {
        window.alert("Failed to clear some data. Please try again.");
      } else {
        Alert.alert("Error", "Failed to clear some data. Please try again.");
      }
    } finally {
      setClearing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      {/* Theme controls */}
      <View style={[styles.row, { borderColor: colors.border }]}>

        <Text style={{ color: colors.text }}>Use System Theme</Text>
        <Switch
          value={useSystem}
          onValueChange={(val) => {
            if (val) setPreference("system");
            else setPreference(effectiveScheme); // keep current look when leaving system
          }}
        />
      </View>

      <View style={[styles.row, { borderColor: colors.border }]}>

        <Text style={{ color: colors.text }}>Theme</Text>
        <Button
          title={nextLabel}
          onPress={toggleLightDark}
          color={colors.primary}
        />
      </View>

      <View style={[styles.row, { borderColor: colors.border }]}>

        <Text style={{ color: colors.text }}>Enable Notifications</Text>
        <Switch value={notifications} onValueChange={setNotifications} />
      </View>

      <Button title="Save Settings" onPress={handleSave} color={colors.primary} />

      <View style={styles.dangerSection}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Danger Zone</Text>
        <Text style={[styles.sectionDescription, { color: colors.text }]}>
          Clear all historical data including environment history, feeding logs, and event records.
        </Text>
        <Button
          title={clearing ? "Clearing..." : "Clear Past Data"}
          onPress={handleClearPastData}
          color="#dc2626"
          disabled={clearing}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
  },
  dangerSection: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#dc2626",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 12,
  },
});
