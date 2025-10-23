import React from "react";
import { StyleSheet, Text, TextProps } from "react-native";

export function ThemedText(props: TextProps & { variant?: "title" | "body" }) {
  const { style, variant = "body", ...rest } = props;
  return <Text style={[styles[variant], style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "bold", color: "#333" },
  body: { fontSize: 16, color: "#444" },
});
