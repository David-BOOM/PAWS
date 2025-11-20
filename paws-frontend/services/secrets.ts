import Constants from "expo-constants";
import type { SecretsShape } from "../types/secrets";

type ExtrasShape = {
  secrets?: SecretsShape;
};

const extras: ExtrasShape =
  (Constants?.expoConfig?.extra as ExtrasShape | undefined) ??
  ((Constants as any)?.manifest2?.extra as ExtrasShape | undefined) ??
  ((Constants as any)?.manifest?.extra as ExtrasShape | undefined) ??
  {};

const cachedSecrets: SecretsShape = extras?.secrets ?? {};

export const getSecrets = (): SecretsShape => cachedSecrets;
export const getLlmSecrets = () => cachedSecrets.llm ?? {};
export const getServerSecrets = () => cachedSecrets.server ?? {};
export const getWifiSecrets = () => cachedSecrets.wifi ?? {};
