import React, { useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";
import { setFeedingSchedule } from "../services/api";

export default function Feeding() {
  const [grams, setGrams] = useState("");
  const [time, setTime] = useState("");

  const handleSave = async () => {
    try {
      await setFeedingSchedule({ grams, time });
      alert("Feeding schedule saved!");
    } catch (err) {
      console.error("Error saving feeding schedule", err);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Feeding Schedule</Text>
      <TextInput
        style={styles.input}
        placeholder="Portion (grams)"
        keyboardType="numeric"
        value={grams}
        onChangeText={setGrams}
      />
      <TextInput
        style={styles.input}
        placeholder="Time (HH:MM)"
        value={time}
        onChangeText={setTime}
      />
      <Button title="Save Schedule" onPress={handleSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    marginBottom: 12,
    borderRadius: 6,
  },
});
