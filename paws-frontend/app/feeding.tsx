import { useFocusEffect } from "@react-navigation/native";
import React, { useState } from "react";
import { Alert, Button, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../components/theme";
import { getDashboardData, setFeedingSchedule } from "../services/api";

export default function Feeding() {
  const [weightInput, setWeightInput] = useState("");
  const [dbWeight, setDbWeight] = useState<string | null>(null);
  const [meal1Time, setMeal1Time] = useState("");
  const [meal2Time, setMeal2Time] = useState("");
  const [hasExistingTimes, setHasExistingTimes] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(true);
  const { colors } = useTheme();

  useFocusEffect(
    React.useCallback(() => {
      const load = async () => {
        try {
          const res = await getDashboardData();
          const data = res?.data || {};
          // Prefer a dedicated pet weight field if present; otherwise try common alternatives
          const w =
            (data.petWeight as string | number | undefined) ??
            (data.weight as string | number | undefined) ??
            null;
          if (w !== null && w !== undefined) {
            const wStr = String(w);
            setDbWeight(wStr);
            setWeightInput(wStr);
          }

          const times =
            (data.feedingTimes as string[] | undefined) ??
            (data.mealTimes as string[] | undefined) ??
            undefined;

          if (Array.isArray(times) && times.length >= 2) {
            setMeal1Time(times[0] || "");
            setMeal2Time(times[1] || "");
            setHasExistingTimes(true);
            setEditingSchedule(false);
          } else {
            setEditingSchedule(true);
          }
        } catch (e) {
          console.error("Error loading feeding data", e);
          // no data: allow user to input
          setEditingSchedule(true);
        }
      };
      load();
    }, [])
  );

  const validateTime = (t: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(t.trim());

  const handleSaveSchedule = async () => {
    if (!weightInput.trim()) {
      Alert.alert("Validation", "Please enter the pet's weight.");
      return;
    }
    if (!validateTime(meal1Time) || !validateTime(meal2Time)) {
      Alert.alert("Validation", "Please enter times in HH:MM (24h) format for both meals.");
      return;
    }
    try {
      await setFeedingSchedule({
        weight: weightInput.trim(),
        meal1Time: meal1Time.trim(),
        meal2Time: meal2Time.trim(),
      } as any);
      setHasExistingTimes(true);
      setEditingSchedule(false);
      Alert.alert("Success", "Feeding schedule saved!");
    } catch (err) {
      console.error("Error saving feeding schedule", err);
      Alert.alert("Error", "Could not save schedule. Please try again.");
    }
  };

  const currentWeightDisplay = dbWeight ?? (weightInput ? weightInput : "N/A");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Feeding & Weight</Text>

      {/* Weight section */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Pet Weight</Text>
        <Text style={[styles.muted, { color: colors.text }]}>{`Current weight: ${currentWeightDisplay}`}</Text>
        <TextInput
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
          placeholder="Weight (kg)"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          value={weightInput}
          onChangeText={setWeightInput}
        />
      </View>

      {/* Meal times section */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Meal Times</Text>

        {hasExistingTimes && !editingSchedule ? (
          <>
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>Meal 1</Text>
              <Text style={styles.timeValue}>{meal1Time || "-"}</Text>
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>Meal 2</Text>
              <Text style={styles.timeValue}>{meal2Time || "-"}</Text>
            </View>
            <View style={styles.actionsRow}>
              <Button title="Edit" onPress={() => setEditingSchedule(true)} />
            </View>
          </>
        ) : (
          <>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
              placeholder="Meal 1 time (HH:MM)"
              value={meal1Time}
              onChangeText={setMeal1Time}
              autoCapitalize="none"
              placeholderTextColor="#9ca3af"
            />
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
              placeholder="Meal 2 time (HH:MM)"
              value={meal2Time}
              onChangeText={setMeal2Time}
              autoCapitalize="none"
              placeholderTextColor="#9ca3af"
            />
            <View style={styles.actionsRow}>
              <Button title="Save Schedule" onPress={handleSaveSchedule} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  muted: { marginBottom: 8 },
  input: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  timeLabel: {},
  timeValue: { fontWeight: "600" },
  actionsRow: { marginTop: 6, alignSelf: "flex-start" },
});
