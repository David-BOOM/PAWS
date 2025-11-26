import axios from "axios";
import { getLlmSecrets } from "./secrets";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type LlmRuntimeConfig = {
  baseUrl: string;
  modelId: string;
  temperature: number;
};

const normalizeBaseUrl = (url: string): string => {
  let normalized = url.replace(/\/+$/, "");
  // Add http:// if no protocol specified
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = `http://${normalized}`;
  }
  return normalized;
};

const resolveLlmConfig = (): LlmRuntimeConfig => {
  const llmSecrets = getLlmSecrets();
  const resolvedHost = llmSecrets.host;
  if (!resolvedHost) {
    throw new Error("Missing LLM host. Define llm.host inside config/secrets.json.");
  }

  const resolvedModel = llmSecrets.model;
  if (!resolvedModel) {
    throw new Error("Missing LLM model. Define llm.model inside config/secrets.json.");
  }

  const resolvedTemperature = llmSecrets.temperature;
  if (typeof resolvedTemperature !== "number" || Number.isNaN(resolvedTemperature)) {
    throw new Error("Missing LLM temperature. Define llm.temperature inside config/secrets.json.");
  }

  return {
    baseUrl: normalizeBaseUrl(resolvedHost),
    modelId: resolvedModel,
    temperature: resolvedTemperature,
  };
};

export const getLlmConnectionInfo = () => {
  try {
    const { baseUrl, modelId } = resolveLlmConfig();
    return { baseUrl, modelId };
  } catch (error: unknown) {
    return {
      baseUrl: undefined,
      modelId: undefined,
      error: error instanceof Error ? error.message : "Unknown configuration error",
    };
  }
};

const THINK_BLOCK_REGEX = /<think>[\s\S]*?<\/think>/gi;

const stripThinkingSegments = (raw: string): string => {
  if (!raw) {
    return raw;
  }
  const withoutBlocks = raw.replace(THINK_BLOCK_REGEX, "");
  const withoutDanglingTags = withoutBlocks.replace(/<\/?think>/gi, "");
  return withoutDanglingTags.trim();
};

export async function sendPetAssistantChat(messages: LlmMessage[]): Promise<string> {
  const { baseUrl, modelId, temperature } = resolveLlmConfig();

  const payload = {
    model: modelId,
    temperature,
    max_tokens: -1,
    stream: false,
    messages,
  };

  const response = await axios.post(`${baseUrl}/v1/chat/completions`, payload);

  const reply = stripThinkingSegments(response?.data?.choices?.[0]?.message?.content ?? "");
  if (!reply) {
    throw new Error("Empty response from local LLM");
  }
  return reply;
}