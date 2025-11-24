import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, InteractionManager, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import SensorCard from "../components/SensorCard";
import { useTheme } from "../components/theme";
import { getEnvironmentCurrent, getEnvironmentSeries } from "../services/api";

const { width: screenWidth } = Dimensions.get("window");

type EnvData = {
  temperature?: number;
  co2?: number;
  voc?: number;
  methanal?: number;
  aqi?: string | number;
  humidity?: number;
};

type SeriesPoint = { t: string; v: number };

const LineChart = React.memo(function LineChart({
  title,
  unit,
  series,
  lineColor,
}: {
  title: string;
  unit: string;
  series: SeriesPoint[];
  lineColor: string;
}) {
  const { colors, effectiveScheme } = useTheme();
  const width = screenWidth - 32;
  const height = 180;
  const pad = { top: 20, right: 16, bottom: 28, left: 36 };

  const values = useMemo(() => series.map((p) => p.v), [series]);
  const [yMin, yMax] = useMemo(() => {
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const extra = (maxV - minV || 1) * 0.1;
    return [minV - extra, maxV + extra];
  }, [values]);

  const toX = useCallback(
    (i: number) => pad.left + (i * (width - pad.left - pad.right)) / Math.max(series.length - 1, 1),
    [pad.left, pad.right, width, series.length]
  );
  const toY = useCallback(
    (v: number) => pad.top + ((yMax - v) * (height - pad.top - pad.bottom)) / (yMax - yMin || 1),
    [pad.top, pad.bottom, height, yMax, yMin]
  );

  const points = useMemo(() => series.map((p, i) => `${toX(i)},${toY(p.v)}`).join(" "), [series, toX, toY]);
  const gridColor = effectiveScheme === "dark" ? "#475569" : "#e5e7eb";
  const axisColor = effectiveScheme === "dark" ? "#94a3b8" : "#6b7280";
  const textColor = colors.text;

  const ticks = 4;
  const tickVals = useMemo(
    () => Array.from({ length: ticks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / ticks),
    [yMin, yMax]
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill={effectiveScheme === "dark" ? "#111827" : "#ffffff"} rx={10} />
        <G>
          {tickVals.map((v, idx) => {
            const y = toY(v);
            return (
              <G key={`grid-${idx}`}>
                <Line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={gridColor} strokeWidth={1} />
                <SvgText x={pad.left - 8} y={y + 4} fill={axisColor} fontSize="10" textAnchor="end">
                  {Number.isFinite(v) ? v.toFixed(1) : "0.0"}
                </SvgText>
              </G>
            );
          })}
        </G>
        <G>
          {[0, Math.floor(series.length / 2), series.length - 1]
            .filter((i, idx, arr) => i >= 0 && i < series.length && arr.indexOf(i) === idx)
            .map((i) => (
              <SvgText key={`x-${i}`} x={toX(i)} y={height - 6} fill={axisColor} fontSize="10" textAnchor="middle">
                {series[i].t}
              </SvgText>
            ))}
        </G>
        <Line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke={axisColor} />
        <Line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke={axisColor} />
        <Polyline points={points} fill="none" stroke={lineColor} strokeWidth={2.5} />
        {series.map((p, i) => (
          <Circle key={`pt-${i}`} cx={toX(i)} cy={toY(p.v)} r={3} fill={lineColor} />
        ))}
        <SvgText x={width - pad.right} y={pad.top - 6} fill={textColor} fontSize="10" textAnchor="end">
          {unit}
        </SvgText>
      </Svg>
    </View>
  );
});

export default function Environment() {
  const [currentData, setCurrentData] = useState<EnvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { colors, effectiveScheme } = useTheme();

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchData();
    }, [])
  );

  const [series, setSeries] = useState<{ temperature: SeriesPoint[]; co2: SeriesPoint[]; voc: SeriesPoint[]; methanal: SeriesPoint[] } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch current readings and series strictly from the database server
      const [curRes, serRes] = await Promise.all([
        getEnvironmentCurrent().catch((err) => {
          if (err?.response?.status === 404) {
            return { data: {} };
          }
          throw err;
        }),
        getEnvironmentSeries().catch((err) => {
          if (err?.response?.status === 404) {
            return { data: {} };
          }
          throw err;
        }),
      ]);
      const current = (curRes?.data || {}) as EnvData;
      const s = (serRes?.data || {}) as any;
      setSeries({
        temperature: Array.isArray(s.temperature) ? s.temperature : [],
        co2: Array.isArray(s.co2) ? s.co2 : [],
        voc: Array.isArray(s.voc) ? s.voc : [],
        methanal: Array.isArray(s.methanal) ? s.methanal : [],
      });
      setCurrentData({
        temperature: current.temperature,
        co2: current.co2,
        voc: current.voc,
        methanal: current.methanal,
        aqi: current.aqi,
        humidity: (current as any).humidity,
      });
    } catch (err: any) {
      console.error("Error fetching environment data:", err?.message || err);
      setError("Failed to load environment data from database");
      setCurrentData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.text }}>Loading environment data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.error, { color: colors.text }]}>{error}</Text>
      </View>
    );
  }

  if (!currentData) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>No environment data available</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <Text style={[styles.title, { color: colors.text }]}>Environment Monitoring</Text>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Current Environment</Text>
        <Text style={[styles.sectionDescription, { color: colors.text }]}>
          Live readings uploaded from the habitat controller.
        </Text>
      </View>

      <View style={styles.currentGrid}>
        <SensorCard label="Temperature" value={currentData.temperature !== undefined ? `${currentData.temperature} °C` : "--"} />
        <SensorCard label="Humidity" value={currentData.humidity !== undefined ? `${currentData.humidity}%` : "--"} />
        <SensorCard label="CO2" value={currentData.co2 !== undefined ? `${currentData.co2} ppm` : "--"} />
        <SensorCard label="Methanal" value={currentData.methanal !== undefined ? `${currentData.methanal} ppb` : "--"} />
        <SensorCard label="VOC" value={currentData.voc !== undefined ? `${currentData.voc} ppb` : "--"} />
        <SensorCard label="Air Quality Index" value={currentData.aqi !== undefined ? `${currentData.aqi}` : "--"} />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Past Environment</Text>
        <Text style={[styles.sectionDescription, { color: colors.text }]}>
          Rolling history from the last few hours stored in the local database.
        </Text>
      </View>

      {ready && series ? (
        <>
          <LineChart
            title={`Temperature • ${currentData.temperature ?? "--"} °C`}
            unit="°C"
            series={series.temperature}
            lineColor={effectiveScheme === "dark" ? "#60a5fa" : "#2563eb"}
          />
          <LineChart
            title={`CO2 Level • ${currentData.co2 ?? "--"} ppm`}
            unit="ppm"
            series={series.co2}
            lineColor={effectiveScheme === "dark" ? "#fbbf24" : "#f59e0b"}
          />
          <LineChart
            title={`VOC Level • ${currentData.voc ?? "--"} ppb`}
            unit="ppb"
            series={series.voc}
            lineColor={effectiveScheme === "dark" ? "#34d399" : "#10b981"}
          />
          <LineChart
            title={`Methanal (Formaldehyde) • ${currentData.methanal ?? "--"} ppb`}
            unit="ppb"
            series={series.methanal}
            lineColor={effectiveScheme === "dark" ? "#f472b6" : "#db2777"}
          />
        </>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.text }}>No historical readings captured yet.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  error: { fontSize: 16 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 6 },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "600" },
  sectionDescription: { fontSize: 13, opacity: 0.75 },
  currentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
});
