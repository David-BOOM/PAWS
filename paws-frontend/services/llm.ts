import axios from "axios";
import { getLlmSecrets } from "./secrets";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const llmSecrets = getLlmSecrets();
const DEFAULT_LLM_HOST = "http://127.0.0.1:1234";
const LLM_BASE_URL = process.env.EXPO_PUBLIC_LLM_HOST || llmSecrets.host || DEFAULT_LLM_HOST;
const MODEL_ID = llmSecrets.model || "qwen/qwen3-4b-thinking-2507";
const TEMPERATURE = typeof llmSecrets.temperature === "number" ? llmSecrets.temperature : 0.7;

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