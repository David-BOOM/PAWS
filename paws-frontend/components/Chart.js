import { Dimensions, StyleSheet, Text, View } from "react-native";
import { LineChart } from "react-native-chart-kit";

export default function Chart({ title, labels, data }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <LineChart
        data={{
          labels: labels,
          datasets: [{ data }],
        }}
        width={Dimensions.get("window").width - 32}
        height={220}
        yAxisSuffix="g"
        chartConfig={{
          backgroundColor: "#f2f2f2",
          backgroundGradientFrom: "#f2f2f2",
          backgroundGradientTo: "#f2f2f2",
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
        }}
        bezier
        style={styles.chart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 16 },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  chart: { borderRadius: 8 },
});
