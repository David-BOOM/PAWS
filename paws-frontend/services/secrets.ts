import Constants from "expo-constants";
import type { SecretsShape } from "../types/secrets";

type ExtrasShape = {
  secrets?: SecretsShape;
  server?: { host?: string; port?: number };
};

const extras: ExtrasShape =
  (Constants?.expoConfig?.extra as ExtrasShape | undefined) ??
  ((Constants as any)?.manifest2?.extra as ExtrasShape | undefined) ??
  ((Constants as any)?.manifest?.extra as ExtrasShape | undefined) ??
  {};

const cachedSecrets: SecretsShape = extras?.secrets ?? {};

// Server config from extra or defaults
const serverConfig = extras?.server ?? { host: "192.168.0.131", port: 4100 };

export const getSecrets = (): SecretsShape => cachedSecrets;
export const getLlmSecrets = () => cachedSecrets.llm ?? {};
export const getServerSecrets = () => ({
  host: serverConfig.host ?? cachedSecrets.server?.host ?? "192.168.0.131",
  port: serverConfig.port ?? cachedSecrets.server?.port ?? 4100,
});
export const getWifiSecrets = () => cachedSecrets.wifi ?? {};
