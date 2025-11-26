import type { ExpoConfig } from "expo/config";
import baseConfig from "./app.json";

// In EAS builds, secrets should be provided via EAS Environment Variables
// For local development, we use the app.json config directly
// Secrets can be added at runtime via Expo Constants or EAS Secrets

export default (): ExpoConfig => {
  const expoConfig = baseConfig?.expo ?? {};

  return {
    ...expoConfig,
    extra: {
      ...(expoConfig.extra ?? {}),
      // Server config can be overridden via EAS Environment Variables
      server: {
        host: process.env.SERVER_HOST || "192.168.0.131",
        port: process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : 4100,
      },
    },
  } as ExpoConfig;
};
