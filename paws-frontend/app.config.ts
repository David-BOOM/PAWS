import type { ExpoConfig } from "expo/config";
import * as fs from "fs";
import * as path from "path";
import baseConfig from "./app.json";

// Load secrets from config/secrets.json
const loadSecrets = () => {
  const secretsPath = path.resolve(__dirname, "..", "config", "secrets.json");
  const secretsExamplePath = path.resolve(__dirname, "..", "config", "secrets.example.json");
  
  const fileToRead = fs.existsSync(secretsPath) ? secretsPath : 
                     fs.existsSync(secretsExamplePath) ? secretsExamplePath : null;
  
  if (!fileToRead) {
    console.warn("[app.config] No secrets file found");
    return {};
  }
  
  try {
    const raw = fs.readFileSync(fileToRead, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.warn("[app.config] Failed to load secrets:", error);
    return {};
  }
};

const secrets = loadSecrets();

// In EAS builds, secrets should be provided via EAS Environment Variables
// For local development, we use the app.json config directly
// Secrets can be added at runtime via Expo Constants or EAS Secrets

export default (): ExpoConfig => {
  const expoConfig = baseConfig?.expo ?? {};

  return {
    ...expoConfig,
    extra: {
      ...(expoConfig.extra ?? {}),
      // Load secrets from config/secrets.json
      secrets: {
        llm: secrets.llm ?? {},
        wifi: secrets.wifi ?? {},
        server: secrets.server ?? {},
      },
      // Server config can be overridden via EAS Environment Variables
      server: {
        host: process.env.SERVER_HOST || secrets.server?.host || "192.168.0.131",
        port: process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : (secrets.server?.port || 4100),
      },
    },
  } as ExpoConfig;
};