import React from "react";
import { StyleSheet, Text, TextProps } from "react-native";
import { useTheme } from "../theme";

export function ThemedText(props: TextProps & { variant?: "title" | "body" }) {
  const { style, variant = "body", ...rest } = props;
  const { colors } = useTheme();
  return <Text style={[styles[variant], { color: colors.text }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "bold" },
  body: { fontSize: 16 },
});
