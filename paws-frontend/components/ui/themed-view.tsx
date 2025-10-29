import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { useTheme } from "../theme";

export function ThemedView(props: ViewProps) {
  const { style, ...rest } = props;
  const { colors } = useTheme();
  return <View style={[styles.container, { backgroundColor: colors.background }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
