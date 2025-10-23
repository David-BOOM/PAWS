import { StyleSheet, Text, TouchableOpacity } from "react-native";

export default function QuickActionButton({ label, onPress }) {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#4CAF50",
    padding: 12,
    borderRadius: 8,
    margin: 5,
    alignItems: "center",
  },
  text: { color: "#fff", fontWeight: "bold" },
});
