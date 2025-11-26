import type { ExpoConfig } from "expo/config";
import fs from "node:fs";
import path from "node:path";
import baseConfig from "./app.json";
import type { SecretsShape } from "./types/secrets";

function loadSecrets(): SecretsShape {
  // Try paths relative to project root (paws-frontend)
  const possiblePaths = [
    // Local config folder (for EAS build)
    path.resolve(__dirname, "config", "secrets.json"),
    path.resolve(__dirname, "config", "secrets.example.json"),
    // Parent config folder (for local development)
    path.resolve(__dirname, "..", "config", "secrets.json"),
    path.resolve(__dirname, "..", "config", "secrets.example.json"),
  ];

  for (const secretsPath of possiblePaths) {
    if (fs.existsSync(secretsPath)) {
      try {
        const raw = fs.readFileSync(secretsPath, "utf-8");
        return JSON.parse(raw) as SecretsShape;
      } catch (error) {
        console.warn(`Unable to parse secrets file at ${secretsPath}:`, error);
      }
    }
  }
  
  console.warn("No secrets file found. Using empty secrets.");
  return {};
}

export default (): ExpoConfig => {
  const secrets = loadSecrets();
  const expoConfig = baseConfig?.expo ?? {};

  return {
    ...expoConfig,
    extra: {
      ...(expoConfig.extra ?? {}),
      secrets,
    },
  } as ExpoConfig;
};
