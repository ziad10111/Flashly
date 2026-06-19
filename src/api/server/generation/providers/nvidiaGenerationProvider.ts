import {
  FLASHLY_AI_API_KEY,
  FLASHLY_AI_BASE_URL,
  FLASHLY_AI_MODEL,
} from "../../config";
import { GenerationServiceFailureError, GenerationServiceNotConfiguredError } from "../types";

type NvidiaChatCompletionChoice = {
  message?: {
    content?: unknown;
  };
};

type NvidiaChatCompletionResponse = {
  choices?: unknown;
};

export const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";

const PROVIDER_TIMEOUT_MS = 90_000;

export type NvidiaGenerationConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export const getNvidiaGenerationConfig = (): NvidiaGenerationConfig => {
  if (!FLASHLY_AI_API_KEY || !FLASHLY_AI_MODEL) {
    throw new GenerationServiceNotConfiguredError(
      "generation.provider.nvidia",
      "NVIDIA generation requires FLASHLY_AI_API_KEY and FLASHLY_AI_MODEL as server-only environment variables.",
    );
  }

  return {
    apiKey: FLASHLY_AI_API_KEY,
    baseUrl: (FLASHLY_AI_BASE_URL || NVIDIA_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: FLASHLY_AI_MODEL,
  };
};

const extractNvidiaOutputText = (body: unknown) => {
  const choices =
    typeof body === "object" && body !== null && "choices" in body
      ? (body as NvidiaChatCompletionResponse).choices
      : undefined;

  if (!Array.isArray(choices)) {
    throw new GenerationServiceFailureError("processing-failed", "NVIDIA provider response did not include choices.");
  }

  const firstChoice = choices[0] as NvidiaChatCompletionChoice | undefined;
  const content = firstChoice?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new GenerationServiceFailureError("processing-failed", "NVIDIA provider returned empty flashcard output.");
  }

  return content.trim();
};

export const callNvidiaChatCompletionsApi = async (prompt: string) => {
  const config = getNvidiaGenerationConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You are Flashly's MCQ generator. Return strict JSON only. Do not include markdown, commentary, reasoning, or extra text. Generate high-quality MCQ study cards based only on the provided source material.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 4096,
        temperature: 0.2,
        top_p: 0.9,
        stream: false,
      }),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new GenerationServiceFailureError(
        "processing-failed",
        `NVIDIA provider request failed with HTTP ${response.status}.`,
        response.status >= 500 || response.status === 429,
      );
    }

    return extractNvidiaOutputText(await response.json());
  } catch (error) {
    if (error instanceof GenerationServiceFailureError || error instanceof GenerationServiceNotConfiguredError) {
      throw error;
    }

    throw new GenerationServiceFailureError(
      "processing-failed",
      "NVIDIA provider request failed before flashcards could be generated.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
};
