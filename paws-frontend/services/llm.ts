import axios from "axios";
import { getLlmSecrets } from "./secrets";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const llmSecrets = getLlmSecrets();
const resolvedHost = process.env.EXPO_PUBLIC_LLM_HOST || llmSecrets.host;

if (!resolvedHost) {
  throw new Error(
    "Missing LLM host. Set EXPO_PUBLIC_LLM_HOST or define llm.host inside config/secrets.json."
  );
}

const LLM_BASE_URL = resolvedHost;

const resolvedModel = process.env.EXPO_PUBLIC_LLM_MODEL || llmSecrets.model;
if (!resolvedModel) {
  throw new Error(
    "Missing LLM model. Set EXPO_PUBLIC_LLM_MODEL or define llm.model inside config/secrets.json."
  );
}

const resolvedTemperature =
  process.env.EXPO_PUBLIC_LLM_TEMPERATURE !== undefined
    ? Number(process.env.EXPO_PUBLIC_LLM_TEMPERATURE)
    : llmSecrets.temperature;

if (typeof resolvedTemperature !== "number" || Number.isNaN(resolvedTemperature)) {
  throw new Error(
    "Missing LLM temperature. Set EXPO_PUBLIC_LLM_TEMPERATURE or define llm.temperature inside config/secrets.json."
  );
}

const MODEL_ID = resolvedModel;
const TEMPERATURE = resolvedTemperature;

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
  const response = await axios.post(`${LLM_BASE_URL}/v1/chat/completions`, {
    model: MODEL_ID,
    temperature: TEMPERATURE,
    max_tokens: -1,
    stream: false,
    messages,
  });

  const reply = stripThinkingSegments(response?.data?.choices?.[0]?.message?.content ?? "");
  if (!reply) {
    throw new Error("Empty response from local LLM");
  }
  return reply;
}