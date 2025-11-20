import type { ExpoConfig } from "expo/config";
import fs from "node:fs";
import path from "node:path";
import baseConfig from "./app.json";
import type { SecretsShape } from "./types/secrets";

function loadSecrets(): SecretsShape {
  const projectRoot = path.resolve(__dirname, "..");
  const secretsPath = path.join(projectRoot, "config", "secrets.json");
  const fallbackPath = path.join(projectRoot, "config", "secrets.example.json");

  const fileToRead = fs.existsSync(secretsPath) ? secretsPath : fallbackPath;
  try {
    const raw = fs.readFileSync(fileToRead, "utf-8");
    return JSON.parse(raw) as SecretsShape;
  } catch (error) {
    console.warn(`Unable to read secrets file at ${fileToRead}. Using empty secrets.`, error);
    return {};
  }
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
