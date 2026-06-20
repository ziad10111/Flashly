import type { DeckDTO, FlashcardDTO } from "@/api/contracts";
import {
  FLASHLY_AI_API_KEY,
  FLASHLY_AI_MODEL,
  FLASHLY_AI_PROVIDER,
} from "../config";
import { buildValidatedFlashcards, parseAiFlashcardJson, type RawFlashcard } from "./aiOutputValidation";
import { splitExtractedTextForGeneration, type DetectedMcqBlock } from "./textChunking";
import type {
  FlashlyGenerationService,
  GenerateFlashcardDTOsInput,
  PrepareGenerationInput,
} from "./types";
import { GenerationServiceFailureError, GenerationServiceNotConfiguredError } from "./types";
import { callNvidiaChatCompletionsApi, getNvidiaGenerationConfig } from "./providers/nvidiaGenerationProvider";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const GEMINI_GENERATE_CONTENT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const PROVIDER_TIMEOUT_MS = 90_000;
const MIN_SOURCE_TEXT_LENGTH = 40;

type OpenAiResponseContent = {
  text?: unknown;
  type?: unknown;
};

type OpenAiResponseOutputItem = {
  content?: unknown;
  type?: unknown;
};

type GeminiResponsePart = {
  text?: unknown;
};

type GeminiResponseCandidate = {
  content?: {
    parts?: unknown;
  };
};

const nowIso = () => new Date().toISOString();

const getAiConfig = () => {
  if (!FLASHLY_AI_PROVIDER || !FLASHLY_AI_API_KEY || !FLASHLY_AI_MODEL) {
    throw new GenerationServiceNotConfiguredError(
      "generation.externalConfig",
      "External generation requires FLASHLY_AI_PROVIDER=openai, gemini, or nvidia, FLASHLY_AI_API_KEY, and FLASHLY_AI_MODEL as server-only environment variables.",
    );
  }

  if (FLASHLY_AI_PROVIDER !== "openai" && FLASHLY_AI_PROVIDER !== "gemini" && FLASHLY_AI_PROVIDER !== "nvidia") {
    throw new GenerationServiceNotConfiguredError(
      `generation.provider.${FLASHLY_AI_PROVIDER}`,
      `Unsupported AI provider "${FLASHLY_AI_PROVIDER}". The current MVP external generation path supports FLASHLY_AI_PROVIDER=openai, gemini, or nvidia.`,
    );
  }

  return {
    apiKey: FLASHLY_AI_API_KEY,
    model: FLASHLY_AI_MODEL,
    provider: FLASHLY_AI_PROVIDER,
  };
};

const getSourceText = (input: PrepareGenerationInput) => {
  const sourceText = input.extractedTextPreview?.trim();

  if (!sourceText || sourceText.length < MIN_SOURCE_TEXT_LENGTH) {
    throw new GenerationServiceFailureError(
      "not-ready",
      "External flashcard generation requires extracted study material text. Extract the material first, then pass extracted text to the generation service.",
      true,
    );
  }

  return sourceText;
};

const createExternalDeckId = (materialId: string, idempotencyKey: string) =>
  `ai-generated-deck-${materialId}-${idempotencyKey}`;

const titleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const getGeneratedDeckTitle = (cards: FlashcardDTO[]) => {
  const topic = cards.find((card) => card.topic?.trim())?.topic?.trim();

  if (topic) {
    return `${titleCase(topic).slice(0, 48)} Flashcards`;
  }

  const question = cards.find((card) => card.question.trim())?.question.trim();

  if (!question) {
    return "AI Study Flashcards";
  }

  const keywords = question
    .replace(/[^\w\s-]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 4)
    .join(" ");

  return keywords ? `${titleCase(keywords)} Flashcards` : "AI Study Flashcards";
};

const createExternalDeck = (input: PrepareGenerationInput, cards: FlashcardDTO[]): DeckDTO => {
  const now = nowIso();

  return {
    id: createExternalDeckId(input.materialId, input.metadata.idempotencyKey),
    materialId: input.materialId,
    title: getGeneratedDeckTitle(cards),
    description: "AI-generated flashcards from extracted study material.",
    sourceFileName: "extracted-study-material",
    sourceType: "unknown",
    status: "ready",
    cardCount: cards.length,
    reviewedCount: 0,
    weakCardCount: 0,
    xpEarned: 0,
    completionPercentage: 0,
    createdAt: now,
    updatedAt: now,
  };
};

const flashcardOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    flashcards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["mcq"] },
          question: { type: "string" },
          answer: { type: "string" },
          explanation: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          topic: { type: "string" },
          choices: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                text: { type: "string" },
              },
              required: ["id", "label", "text"],
            },
          },
          correctChoiceId: { type: "string" },
        },
        required: ["type", "question", "answer", "explanation", "difficulty", "topic", "choices", "correctChoiceId"],
      },
    },
  },
  required: ["flashcards"],
} as const;

const buildPrompt = (input: PrepareGenerationInput, sourceText: string) => {
  const difficulty = input.metadata.difficulty ?? "medium";
  const topics =
    input.metadata.topicFocus.length > 0
      ? `Focus on these topics when the material supports them: ${input.metadata.topicFocus.join(", ")}.`
      : "Use the most important topics from the material.";

  return [
    `Generate ${input.metadata.requestedCardCount} study flashcards from the provided study material.`,
    "Use only facts supported by the material. Do not invent unsupported details.",
    "Return valid JSON only. Do not include markdown, commentary, or extra text.",
    'Return JSON in this shape: {"flashcards":[{"type":"mcq","question":"...","choices":[{"id":"A","label":"A","text":"..."},{"id":"B","label":"B","text":"..."},{"id":"C","label":"C","text":"..."},{"id":"D","label":"D","text":"..."}],"correctChoiceId":"A","answer":"...","explanation":"...","difficulty":"medium","topic":"..."}]}.',
    'Every flashcard must be a multiple-choice question with type "mcq". Do not return qa cards.',
    "Each flashcard must include type, question, answer, explanation, difficulty, topic, choices, and correctChoiceId.",
    "Each MCQ must have exactly four choices with ids and labels A, B, C, and D.",
    "There must be exactly one clearly correct choice. correctChoiceId must be one of A, B, C, or D, and answer must match or clearly name that correct choice.",
    "For normal explanatory text, create a high-quality MCQ from one important supported fact: one correct answer and three plausible but incorrect distractors.",
    "Distractors must be realistic, related to the topic, mutually distinct, and not silly or obviously wrong.",
    'Avoid "All of the above" and "None of the above" unless the source itself strongly justifies that wording.',
    "For source material that already contains MCQs, preserve the original question, choices, and correct answer when possible.",
    "Detect choices written as A., B., C., D., A), B), C), D), or quoted options. Preserve the meaning of original options.",
    "Do not return MCQ cards without a supported correct answer. If a fact is not directly supported by the material, choose a different fact.",
    "Include a concise explanation that says why the correct choice is right.",
    `Target difficulty: ${difficulty}. ${topics}`,
    "Avoid language-learning framing, vocabulary-course framing, generic motivational cards, and duplicate questions.",
    "Match the requested card count as closely as possible while staying faithful to the material.",
    "",
    "Study material:",
    sourceText,
  ].join("\n");
};

const buildMcqBatchPrompt = (input: PrepareGenerationInput, blocks: DetectedMcqBlock[], batchIndex: number) =>
  [
    `Convert these ${blocks.length} OCR-detected multiple-choice source blocks into Flashly MCQ flashcards.`,
    "Return one flashcard per complete MCQ block. Do not summarize into sample cards.",
    "The source blocks may have damaged OCR, missing answer marks, merged lines, or unlabeled choices.",
    "Preserve the original question meaning and preserve choices where possible.",
    'Return JSON in this shape: {"flashcards":[{"type":"mcq","question":"...","choices":[{"id":"A","label":"A","text":"..."},{"id":"B","label":"B","text":"..."},{"id":"C","label":"C","text":"..."},{"id":"D","label":"D","text":"..."}],"correctChoiceId":"A","answer":"...","explanation":"...","difficulty":"medium","topic":"..."}]}.',
    "Use type \"mcq\". Use exactly four choices with ids A, B, C, D. correctChoiceId must match the inferred correct choice.",
    "If a source block contains five choices, choose the best supported four choices and preserve the correct answer if known.",
    "Infer the correct answer carefully from the question and choices when the visual answer mark was lost. Include a short explanation.",
    "Do not invent extra unrelated questions. Skip only blocks that cannot be converted into a coherent MCQ.",
    "If one block is malformed or the correct answer is too uncertain, skip only that block.",
    `Target difficulty: ${input.metadata.difficulty ?? "medium"}.`,
    `Batch ${batchIndex + 1} sourceBlocks JSON lines:`,
    blocks.map((block) => JSON.stringify({
      choices: block.choices,
      confidence: block.confidence,
      correctChoiceId: block.correctChoiceId ?? null,
      question: block.question,
      rawText: block.rawText.slice(0, 1200),
      sourcePage: block.sourcePage ?? null,
    })).join("\n"),
  ].join("\n");

const logComprehensiveGeneration = (payload: Record<string, unknown>) => {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.info("[Flashly Generation] comprehensive MCQ", payload);
  }
};

const callConfiguredAiProviderWithRetry = async (
  input: PrepareGenerationInput,
  sourceText: string,
  promptOverride?: string,
  attempts = 1,
) => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await callConfiguredAiProvider(input, sourceText, promptOverride);
    } catch (error) {
      lastError = error;
      logComprehensiveGeneration({
        attempt,
        providerRetry: true,
      });

      if (
        attempt >= attempts ||
        !(error instanceof GenerationServiceFailureError) ||
        !error.retryable
      ) {
        throw error;
      }
    }
  }

  throw lastError;
};

const buildNvidiaJsonRepairPrompt = (prompt: string, invalidOutput: string) =>
  [
    "Your previous response was not valid Flashly MCQ JSON.",
    "Return strict JSON only. Do not include markdown, commentary, reasoning, or extra text.",
    'Use this exact shape: {"cards":[{"type":"mcq","question":"Question text","choices":[{"id":"A","text":"Choice A"},{"id":"B","text":"Choice B"},{"id":"C","text":"Choice C"},{"id":"D","text":"Choice D"}],"correctChoiceId":"A","answer":"Choice A","explanation":"Short explanation based only on the source material."}]}',
    "Every card must have type mcq, exactly four unique choices, a valid correctChoiceId, and answer equal to the correct choice text.",
    "Do not invent facts outside the source material.",
    "",
    "Original prompt:",
    prompt,
    "",
    "Invalid previous output:",
    invalidOutput.slice(0, 4000),
  ].join("\n");

const parseProviderOutputWithOptionalRepair = async ({
  input,
  outputText,
  prompt,
}: {
  input: PrepareGenerationInput;
  outputText: string;
  prompt: string;
}) => {
  try {
    const parsedCards = parseAiFlashcardJson(outputText);

    if (parsedCards.length === 0) {
      throw new GenerationServiceFailureError("processing-failed", "AI did not return any valid MCQ cards.");
    }

    return parsedCards;
  } catch (error) {
    const config = getAiConfig();

    if (config.provider !== "nvidia") {
      throw error;
    }

    const repairedOutputText = await callNvidiaChatCompletionsApi(buildNvidiaJsonRepairPrompt(prompt, outputText));
    const repairedCards = parseAiFlashcardJson(repairedOutputText);

    if (repairedCards.length === 0) {
      throw new GenerationServiceFailureError("processing-failed", "NVIDIA did not return any valid MCQ cards after JSON repair.");
    }

    return repairedCards;
  }
};

const extractOpenAiOutputText = (body: unknown) => {
  if (typeof body === "object" && body !== null && "output_text" in body) {
    const outputText = (body as { output_text?: unknown }).output_text;

    if (typeof outputText === "string" && outputText.trim()) {
      return outputText;
    }
  }

  const output = typeof body === "object" && body !== null && "output" in body
    ? (body as { output?: unknown }).output
    : undefined;

  if (!Array.isArray(output)) {
    throw new GenerationServiceFailureError("processing-failed", "AI provider response did not include text output.");
  }

  const parts: string[] = [];

  for (const item of output as OpenAiResponseOutputItem[]) {
    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content as OpenAiResponseContent[]) {
      if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  const text = parts.join("\n").trim();

  if (!text) {
    throw new GenerationServiceFailureError("processing-failed", "AI provider returned empty flashcard output.");
  }

  return text;
};

const extractGeminiOutputText = (body: unknown) => {
  const candidates =
    typeof body === "object" && body !== null && "candidates" in body
      ? (body as { candidates?: unknown }).candidates
      : undefined;

  if (!Array.isArray(candidates)) {
    throw new GenerationServiceFailureError("processing-failed", "Gemini provider response did not include candidates.");
  }

  const parts: string[] = [];

  for (const candidate of candidates as GeminiResponseCandidate[]) {
    const candidateParts = candidate.content?.parts;

    if (!Array.isArray(candidateParts)) {
      continue;
    }

    for (const part of candidateParts as GeminiResponsePart[]) {
      if (typeof part.text === "string") {
        parts.push(part.text);
      }
    }
  }

  const text = parts.join("\n").trim();

  if (!text) {
    throw new GenerationServiceFailureError("processing-failed", "Gemini provider returned empty flashcard output.");
  }

  return text;
};

const callOpenAiResponsesApi = async (input: PrepareGenerationInput, sourceText: string, promptOverride?: string) => {
  const config = getAiConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      body: JSON.stringify({
        model: config.model,
        instructions:
          "You are a flashcard generation service for Flashly, an AI-powered study app. Produce study flashcards only from the supplied material.",
        input: promptOverride ?? buildPrompt(input, sourceText),
        text: {
          format: {
            type: "json_schema",
            name: "flashly_flashcards",
            strict: true,
            schema: flashcardOutputSchema,
          },
        },
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new GenerationServiceFailureError(
        "processing-failed",
        `AI provider request failed with HTTP ${response.status}.`,
        response.status >= 500 || response.status === 429,
      );
    }

    return extractOpenAiOutputText(await response.json());
  } catch (error) {
    if (error instanceof GenerationServiceFailureError || error instanceof GenerationServiceNotConfiguredError) {
      throw error;
    }

    throw new GenerationServiceFailureError(
      "processing-failed",
      "AI provider request failed before flashcards could be generated.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
};

const callGeminiGenerateContentApi = async (input: PrepareGenerationInput, sourceText: string, promptOverride?: string) => {
  const config = getAiConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  const model = encodeURIComponent(config.model.replace(/^models\//, ""));

  try {
    const response = await fetch(`${GEMINI_GENERATE_CONTENT_BASE_URL}/${model}:generateContent`, {
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: [
                  "You are a flashcard generation service for Flashly, an AI-powered study app. Produce study flashcards only from the supplied material.",
                  promptOverride ?? buildPrompt(input, sourceText),
                ].join("\n\n"),
              },
            ],
            role: "user",
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: flashcardOutputSchema,
        },
      }),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new GenerationServiceFailureError(
        "processing-failed",
        `Gemini provider request failed with HTTP ${response.status}.`,
        response.status >= 500 || response.status === 429,
      );
    }

    return extractGeminiOutputText(await response.json());
  } catch (error) {
    if (error instanceof GenerationServiceFailureError || error instanceof GenerationServiceNotConfiguredError) {
      throw error;
    }

    throw new GenerationServiceFailureError(
      "processing-failed",
      "Gemini provider request failed before flashcards could be generated.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
};

const callConfiguredAiProvider = (input: PrepareGenerationInput, sourceText: string, promptOverride?: string) => {
  const config = getAiConfig();

  if (config.provider === "gemini") {
    return callGeminiGenerateContentApi(input, sourceText, promptOverride);
  }

  if (config.provider === "nvidia") {
    return callNvidiaChatCompletionsApi(promptOverride ?? buildPrompt(input, sourceText));
  }

  return callOpenAiResponsesApi(input, sourceText, promptOverride);
};

const generateExternalFlashcardDTOs = async (input: GenerateFlashcardDTOsInput) => {
  const sourceText = getSourceText(input);
  const split = input.metadata.generationMode === "comprehensive"
    ? splitExtractedTextForGeneration(sourceText, {
        batchSize: input.metadata.batchSize,
        maxCards: input.metadata.maxCards,
        startQuestionIndex: input.metadata.batchMode === "batch" ? input.metadata.startQuestionIndex : undefined,
      })
    : { chunks: [], mcqBlocks: [] };
  const detectedMcqBlocks = split.mcqBlocks;
  let rawCards: RawFlashcard[] = [];
  let selectedBlockCount = 0;
  let hasMore = false;

  if (detectedMcqBlocks.length > 0) {
    const startQuestionIndex = input.metadata.startQuestionIndex ?? 0;
    const selectedChunks = input.metadata.batchMode === "batch"
      ? split.chunks.slice(0, 1)
      : split.chunks;
    selectedBlockCount = selectedChunks.reduce((sum, chunk) => sum + (chunk.estimatedQuestionCount ?? 0), 0);
    hasMore =
      input.metadata.batchMode === "batch" &&
      startQuestionIndex + selectedBlockCount < detectedMcqBlocks.length;

    logComprehensiveGeneration({
      batchCount: selectedChunks.length,
      detectedMcqBlockCount: detectedMcqBlocks.length,
      extractedTextLength: sourceText.length,
      generationMode: input.metadata.generationMode,
      requestedMaxCards: input.metadata.maxCards,
      selectedBlockCount,
      startQuestionIndex,
    });

    for (const [batchIndex, chunk] of selectedChunks.entries()) {
      const batchInput: GenerateFlashcardDTOsInput = {
        ...input,
        metadata: {
          ...input.metadata,
          maxCards: chunk.estimatedQuestionCount ?? input.metadata.maxCards,
          requestedCardCount: input.metadata.requestedCardCount,
        },
      };
      const batch = chunk.text
        .split("\n")
        .map((text, index): DetectedMcqBlock | null => {
          try {
            const parsed = JSON.parse(text) as Partial<DetectedMcqBlock>;

            if (!parsed.question || !Array.isArray(parsed.choices)) {
              return null;
            }

            return {
              choices: parsed.choices,
              confidence: parsed.confidence ?? "medium",
              correctChoiceId: parsed.correctChoiceId,
              index,
              question: parsed.question,
              rawText: parsed.rawText ?? text,
              sourceEnd: 0,
              sourcePage: parsed.sourcePage,
              sourceStart: 0,
              text,
            };
          } catch {
            return null;
          }
        })
        .filter((block): block is DetectedMcqBlock => block !== null);
      const batchPrompt = buildMcqBatchPrompt(batchInput, batch, batchIndex);
      const outputText = await callConfiguredAiProviderWithRetry(
        batchInput,
        "",
        batchPrompt,
      );
      const batchCards = await parseProviderOutputWithOptionalRepair({
        input: batchInput,
        outputText,
        prompt: batchPrompt,
      });
      rawCards.push(...batchCards);
      logComprehensiveGeneration({
        batchIndex: batchIndex + 1,
        cardsReturned: batchCards.length,
      });
    }
  } else {
    const chunks = split.chunks.length > 0 ? split.chunks : [{ chunkIndex: 0, text: sourceText }];

    for (const chunk of chunks) {
      const prompt = buildPrompt(input, chunk.text);
      const outputText = await callConfiguredAiProvider(input, chunk.text, prompt);
      rawCards.push(
        ...(await parseProviderOutputWithOptionalRepair({
          input,
          outputText,
          prompt,
        })),
      );
    }
  }

  const cards = buildValidatedFlashcards({
      deckId: input.deckId,
      defaultDifficulty: input.metadata.difficulty,
      idPrefix: `ai-generated-card-${input.materialId}`,
      positionOffset: input.metadata.batchMode === "batch" ? input.metadata.startQuestionIndex ?? 0 : 0,
      rawCards,
      requestedCardCount: input.metadata.requestedCardCount,
    });

  logComprehensiveGeneration({
    duplicateOrInvalidCountRemoved: rawCards.length - cards.length,
    finalValidCardCount: cards.length,
  });

  return {
    batchIndex: input.metadata.batchIndex,
    cards,
    expectedTotalCards: detectedMcqBlocks.length || undefined,
    generationDebug: "diagnostics" in split
      ? {
          mcqDetection: split.diagnostics,
        }
      : undefined,
    hasMore,
  };
};

export const externalGenerationService: FlashlyGenerationService = {
  generateFlashcardDTOs: generateExternalFlashcardDTOs,
  mode: "external",
  prepareGeneration: async (input) => {
    const job = externalGenerationService.prepareGenerationJob(input);
    const deckId = createExternalDeckId(input.materialId, input.metadata.idempotencyKey);
    const generated = await externalGenerationService.generateFlashcardDTOs({
      ...input,
      deckId,
    });
    const deck = createExternalDeck(input, generated.cards);

    return {
      ...job,
      deckId: deck.id,
      deckStatus: deck.status,
      batchIndex: generated.batchIndex,
      batchCardCount: generated.cards.length,
      expectedTotalCards: generated.expectedTotalCards,
      generationDebug: generated.generationDebug,
      generatedCardCount: generated.cards.length,
      hasMore: generated.hasMore,
      deck,
      cards: generated.cards,
    };
  },
  prepareGenerationJob: (input) => {
    getAiConfig();

    return {
      generationJobId: `ai-generation-job-${input.metadata.idempotencyKey}`,
      generationStatus: input.metadata.generationStatus,
      generationStage: input.metadata.generationStage,
      idempotencyKey: input.metadata.idempotencyKey,
      materialId: input.materialId,
      requestedCardCount: input.metadata.requestedCardCount,
      retryable: true,
    };
  },
  validateReadiness: () => {
    try {
      getAiConfig();

      return { ok: true };
    } catch {
      return {
        message:
          "External generation mode is selected, but FLASHLY_AI_PROVIDER=openai, gemini, or nvidia, FLASHLY_AI_API_KEY, and FLASHLY_AI_MODEL must be configured as server-only environment variables.",
        ok: false,
      };
    }
  },
};

export const validateNvidiaGenerationProviderReadiness = () => {
  getNvidiaGenerationConfig();

  return { ok: true as const };
};
