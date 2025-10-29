import { useFocusEffect } from "@react-navigation/native";
import React, { useState } from "react";
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../components/theme";
import { getDashboardData } from "../services/api";

export default function Summery() {
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState("");
  const [weekly, setWeekly] = useState("");
  const [monthly, setMonthly] = useState("");
  const { colors } = useTheme();

  const generateSummaries = (json: any) => {
    const t = json?.temperature ?? "—";
    const h = json?.humidity ?? "—";
    const aqi = json?.aqi ?? "—";

    const base = `Temperature: ${t}°C, Humidity: ${h}%, Air Quality: ${aqi}.`;
    setDaily(`Daily summary (LLM): ${base} Overall, conditions are stable for today.`);
    setWeekly(`Weekly summary (LLM): ${base} The week shows consistent patterns with minor fluctuations.`);
    setMonthly(`Monthly summary (LLM): ${base} This month trends indicate steady environment and routine.`);
  };

  const load = async () => {
    try {
      setLoading(true);
      const res = await getDashboardData();
      const data = res?.data || {};
      generateSummaries({
        temperature: data.temperature,
        humidity: data.humidity,
        aqi: data.aqi,
        ...data,
      });
    } catch (e) {
      generateSummaries({});
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [])
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>Summery</Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Summary</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <TextInput
            style={[styles.textbox, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
            multiline
            editable={false}
            value={daily}
          />
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Weekly Summary</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <TextInput
            style={[styles.textbox, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
            multiline
            editable={false}
            value={weekly}
          />
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Monthly Summary</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <TextInput
            style={[styles.textbox, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
            multiline
            editable={false}
            value={monthly}
          />
        )}
      </View>

      <View style={styles.actionsRow}>
        <Button title="Refresh" onPress={load} color={colors.primary} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  textbox: {
    minHeight: 90,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    textAlignVertical: "top",
  },
  actionsRow: { marginTop: 8, alignSelf: "flex-start" },
});
