import { useFocusEffect } from "@react-navigation/native";
import React, { useState } from "react";
import { Alert, Button, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../components/theme";
import { getDashboardData, readDatabaseFile, setFeedingSchedule } from "../services/api";

export default function Feeding() {
  const [weightInput, setWeightInput] = useState("");
  const [dbWeight, setDbWeight] = useState<string | null>(null);
  const [mealAmountInput, setMealAmountInput] = useState("");
  const [dbMealAmount, setDbMealAmount] = useState<string | null>(null);
  const [mealAmountTouched, setMealAmountTouched] = useState(false);
  const [meal1Time, setMeal1Time] = useState("");
  const [meal2Time, setMeal2Time] = useState("");
  const [hasExistingSchedule, setHasExistingSchedule] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(true);
  const { colors } = useTheme();

  const computeDefaultMealAmount = React.useCallback((weightValue: string | null | undefined) => {
    if (weightValue == null) return "";
    const trimmed = weightValue.trim();
    if (!trimmed) return "";
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) return "";
    const meal = numeric * 20;
    return Number.isInteger(meal) ? String(meal) : meal.toFixed(2);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const load = async () => {
        try {
          const [dashboardRes, feedingRes] = await Promise.all([
            getDashboardData(),
            readDatabaseFile("feeding").catch((err) => {
              if (err?.response?.status === 404) {
                return { data: {} };
              }
              throw err;
            }),
          ]);

          const dashboard = (dashboardRes?.data || {}) as any;
          const feedingData = (feedingRes?.data || {}) as any;

          const storedWeight =
            feedingData?.weight ??
            dashboard?.petWeight ??
            dashboard?.weight ??
            null;
          const storedWeightStr =
            storedWeight !== null && storedWeight !== undefined && storedWeight !== ""
              ? String(storedWeight)
              : null;

          if (storedWeightStr) {
            setDbWeight(storedWeightStr);
            setWeightInput(storedWeightStr);
          } else {
            setDbWeight(null);
          }

          const feedingTimes = Array.isArray(dashboard?.feedingTimes) ? dashboard.feedingTimes : [];
          const meal1 = typeof feedingData?.meal1Time === "string" && feedingData.meal1Time
            ? feedingData.meal1Time
            : (feedingTimes[0] || "");
          const meal2 = typeof feedingData?.meal2Time === "string" && feedingData.meal2Time
            ? feedingData.meal2Time
            : (feedingTimes[1] || "");

          setMeal1Time(meal1);
          setMeal2Time(meal2);

          setMealAmountTouched(false);
          const storedMealAmountRaw =
            feedingData?.mealAmount ??
            dashboard?.mealAmount ??
            null;
          const storedMealAmount =
            storedMealAmountRaw !== null && storedMealAmountRaw !== undefined && String(storedMealAmountRaw).trim() !== ""
              ? String(storedMealAmountRaw).trim()
              : null;
          setDbMealAmount(storedMealAmount);

          const fallbackMeal = computeDefaultMealAmount(storedWeightStr ?? dbWeight);
          setMealAmountInput(storedMealAmount ?? fallbackMeal ?? "");

          const hasSchedule = Boolean((meal1 && meal2) || storedMealAmount);
          setHasExistingSchedule(hasSchedule);
          setEditingSchedule(!hasSchedule);
        } catch (e) {
          console.error("Error loading feeding data", e);
          setDbMealAmount(null);
          setHasExistingSchedule(false);
          setEditingSchedule(true);
          setMealAmountTouched(false);
        }
      };
      load();
    }, [computeDefaultMealAmount, dbWeight])
  );

  React.useEffect(() => {
    if (dbMealAmount !== null || mealAmountTouched) {
      return;
    }
    const fallback = computeDefaultMealAmount((weightInput && weightInput.trim()) ? weightInput : dbWeight);
    if (!fallback) return;
    setMealAmountInput((prev) => (prev.trim().length ? prev : fallback));
  }, [dbMealAmount, mealAmountTouched, computeDefaultMealAmount, weightInput, dbWeight]);

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

    let mealAmountToPersist = mealAmountInput.trim();
    if (!mealAmountToPersist) {
      mealAmountToPersist = computeDefaultMealAmount(weightInput);
    }

    if (!mealAmountToPersist) {
      Alert.alert("Validation", "Meal amount could not be determined. Please enter a value.");
      return;
    }

    try {
      await setFeedingSchedule({
        weight: weightInput.trim(),
        meal1Time: meal1Time.trim(),
        meal2Time: meal2Time.trim(),
        mealAmount: mealAmountToPersist,
      } as any);
      setHasExistingSchedule(true);
      setEditingSchedule(false);
      setDbMealAmount(mealAmountToPersist);
      setMealAmountInput(mealAmountToPersist);
      setMealAmountTouched(false);
      Alert.alert("Success", "Feeding schedule saved!");
    } catch (err) {
      console.error("Error saving feeding schedule", err);
      Alert.alert("Error", "Could not save schedule. Please try again.");
    }
  };

  const currentWeightDisplay = dbWeight ?? (weightInput ? weightInput : "N/A");
  const resolvedMealAmount = ((dbMealAmount ?? mealAmountInput) || "").trim();
  const mealAmountDisplay = resolvedMealAmount
    ? (/[^0-9.]/.test(resolvedMealAmount) ? resolvedMealAmount : `${resolvedMealAmount} g`)
    : "-";

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

        {hasExistingSchedule && !editingSchedule ? (
          <>
            <View style={styles.timeRow}>
              <Text style={[styles.timeLabel, { color: colors.text }]}>Meal 1</Text>
              <Text style={[styles.timeValue, { color: colors.text }]}>{meal1Time || "-"}</Text>
            </View>
            <View style={styles.timeRow}>
              <Text style={[styles.timeLabel, { color: colors.text }]}>Meal 2</Text>
              <Text style={[styles.timeValue, { color: colors.text }]}>{meal2Time || "-"}</Text>
            </View>
            <View style={styles.timeRow}>
              <Text style={[styles.timeLabel, { color: colors.text }]}>Meal Amount</Text>
              <Text style={[styles.timeValue, { color: colors.text }]}>{mealAmountDisplay}</Text>
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
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
              placeholder="Meal amount per meal (g)"
              value={mealAmountInput}
              onChangeText={(value) => {
                setMealAmountTouched(true);
                setMealAmountInput(value);
              }}
              keyboardType="numeric"
              placeholderTextColor="#9ca3af"
            />
            <Text style={[styles.helper, { color: colors.text }]}>
              Leave blank to auto-calc as weight × 20.
            </Text>
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
  helper: { fontSize: 12, marginBottom: 8, opacity: 0.75 },
});
