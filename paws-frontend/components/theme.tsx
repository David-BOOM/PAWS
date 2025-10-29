import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

type ThemePreference = "system" | "light" | "dark";
type Scheme = "light" | "dark";

type ThemeColors = {
  background: string;
  card: string;
  text: string;
  border: string;
  primary: string;
};

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  effectiveScheme: Scheme;
  colors: ThemeColors;
  toggleLightDark: () => void;
};

const lightColors: ThemeColors = {
  background: "#ffffff",
  card: "#f9fafb",
  text: "#111827",
  border: "#e5e7eb",
  primary: "#4CAF50",
};

const darkColors: ThemeColors = {
  background: "#0f172a",
  card: "#1f2937",
  text: "#f9fafb",
  border: "#374151",
  primary: "#22c55e",
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme(); // "light" | "dark" | null
  const [preference, setPreference] = useState<ThemePreference>("system");

  const effectiveScheme: Scheme = useMemo(() => {
    if (preference === "system") return (system ?? "light") as Scheme;
    return preference;
  }, [preference, system]);

  const colors = effectiveScheme === "dark" ? darkColors : lightColors;

  const toggleLightDark = () => {
    // If in system mode, switch to explicit opposite of current
    if (preference === "system") {
      const next: Scheme = effectiveScheme === "dark" ? "light" : "dark";
      setPreference(next);
    } else {
      setPreference(preference === "dark" ? "light" : "dark");
    }
  };

  const value: ThemeContextValue = {
    preference,
    setPreference,
    effectiveScheme,
    colors,
    toggleLightDark,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
