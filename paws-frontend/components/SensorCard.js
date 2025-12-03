import { StyleSheet, Text, View } from "react-native";

export default function SensorCard({ label, value, valueStyle }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    marginVertical: 8,
    backgroundColor: "#f2f2f2",
    borderRadius: 8,
  },
  label: { fontSize: 16, fontWeight: "600" },
  value: { fontSize: 18, fontWeight: "bold", marginTop: 4 },
});
