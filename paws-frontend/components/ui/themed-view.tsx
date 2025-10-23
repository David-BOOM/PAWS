import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";

export function ThemedView(props: ViewProps) {
  const { style, ...rest } = props;
  return <View style={[styles.container, style]} {...rest} />;
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#fff", flex: 1 },
});
