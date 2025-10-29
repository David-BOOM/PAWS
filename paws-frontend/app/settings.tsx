import React, { useState } from "react";
import { Button, StyleSheet, Switch, Text, View } from "react-native";
import { useTheme } from "../components/theme";
import { updateSettings } from "../services/api";

export default function Settings() {
  const [circadian, setCircadian] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const { preference, setPreference, effectiveScheme, colors, toggleLightDark } = useTheme();

  const useSystem = preference === "system";
  const nextLabel = effectiveScheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";

  const handleSave = async () => {
    try {
      await updateSettings({ circadian, notifications });
      alert("Settings updated!");
    } catch (err) {
      console.error("Error updating settings", err);
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

      {/* Existing settings */}
      <View style={[styles.row, { borderColor: colors.border }]}>

        <Text style={{ color: colors.text }}>Circadian Lighting</Text>
        <Switch value={circadian} onValueChange={setCircadian} />
      </View>

      <View style={[styles.row, { borderColor: colors.border }]}>

        <Text style={{ color: colors.text }}>Enable Notifications</Text>
        <Switch value={notifications} onValueChange={setNotifications} />
      </View>

      <Button title="Save Settings" onPress={handleSave} color={colors.primary} />
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
});
