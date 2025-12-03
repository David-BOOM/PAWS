import { StyleSheet, Text, View } from "react-native";

export default function NotificationCard({ message, time }) {
  return (
    <View style={styles.card}>
      <Text style={styles.message}>{message}</Text>
      <Text style={styles.time}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    marginVertical: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 8,
  },
  message: { fontSize: 16 },
  time: { fontSize: 12, color: "gray", marginTop: 4 },
});
