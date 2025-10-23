import React, { useState } from "react";
import { Button, StyleSheet, Switch, Text, View } from "react-native";
import { updateSettings } from "../services/api";

export default function Settings() {
  const [circadian, setCircadian] = useState(false);
  const [notifications, setNotifications] = useState(true);

  const handleSave = async () => {
    try {
      await updateSettings({ circadian, notifications });
      alert("Settings updated!");
    } catch (err) {
      console.error("Error updating settings", err);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.row}>
        <Text>Circadian Lighting</Text>
        <Switch value={circadian} onValueChange={setCircadian} />
      </View>

      <View style={styles.row}>
        <Text>Enable Notifications</Text>
        <Switch value={notifications} onValueChange={setNotifications} />
      </View>

      <Button title="Save Settings" onPress={handleSave} />
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
  },
});
