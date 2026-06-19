import type { ApiErrorDTO, FlashcardDifficultyDTO, GenerateFlashcardsRequest } from "@/api/contracts";
import { notReadyError, validationError } from "./apiErrors";
import {
  DEFAULT_COMPREHENSIVE_GENERATED_CARDS,
  DEFAULT_GENERATED_CARDS,
  MAX_GENERATED_CARDS,
  MIN_GENERATED_CARDS,
} from "./generationLimits";

export type GenerationValidationSuccess = {
  ok: true;
  metadata: {
    difficulty?: FlashcardDifficultyDTO;
    batchIndex?: number;
    batchMode: "all" | "batch";
    batchSize?: number;
    generationStage: "creating-deck";
    generationStatus: "complete";
    generationMode: "sample" | "comprehensive";
    idempotencyKey: string;
    materialId: string;
    maxCards: number;
    requestedCardCount: number;
    startQuestionIndex?: number;
    topicFocus: string[];
  };
};

export type GenerationValidationFailure = {
  error: ApiErrorDTO;
  ok: false;
};

export type GenerationValidationResult = GenerationValidationSuccess | GenerationValidationFailure;

const allowedDifficulties = new Set<FlashcardDifficultyDTO>(["easy", "medium", "hard"]);

const normalizeIdempotencyKey = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80);

const normalizeTopicFocus = (topics: string[] | undefined) =>
  (topics ?? [])
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(0, 6);

const normalizePositiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;

export const validateGenerateFlashcardsRequest = (
  routeMaterialId: string,
  request: GenerateFlashcardsRequest | null,
): GenerationValidationResult => {
  const materialId = request?.materialId ?? routeMaterialId;

  if (!materialId.trim()) {
    return { ok: false, error: validationError("materialId is required.") };
  }

  if (materialId !== routeMaterialId) {
    return { ok: false, error: validationError("materialId must match the route id.") };
  }

  const idempotencyKey = normalizeIdempotencyKey(request?.idempotencyKey ?? "");

  if (!idempotencyKey) {
    return { ok: false, error: validationError("idempotencyKey is required.") };
  }

  const generationMode = request?.generationMode === "comprehensive" ? "comprehensive" : "sample";
  const batchMode = request?.batchMode === "batch" ? "batch" : "all";
  const batchIndex = normalizePositiveInteger(request?.batchIndex);
  const startQuestionIndex = normalizePositiveInteger(request?.startQuestionIndex);
  const batchSize = normalizePositiveInteger(request?.batchSize);
  const requestedMaxCards =
    typeof request?.maxCards === "number" && Number.isInteger(request.maxCards)
      ? request.maxCards
      : undefined;
  const requestedCardCount =
    request?.requestedCardCount ??
    (generationMode === "comprehensive" ? DEFAULT_COMPREHENSIVE_GENERATED_CARDS : DEFAULT_GENERATED_CARDS);
  const maxCards =
    requestedMaxCards ??
    (generationMode === "comprehensive" ? DEFAULT_COMPREHENSIVE_GENERATED_CARDS : requestedCardCount);

  if (requestedCardCount < MIN_GENERATED_CARDS || requestedCardCount > MAX_GENERATED_CARDS) {
    return {
      ok: false,
      error: validationError(`requestedCardCount must be between ${MIN_GENERATED_CARDS} and ${MAX_GENERATED_CARDS}.`),
    };
  }

  if (maxCards < MIN_GENERATED_CARDS || maxCards > MAX_GENERATED_CARDS) {
    return {
      ok: false,
      error: validationError(`maxCards must be between ${MIN_GENERATED_CARDS} and ${MAX_GENERATED_CARDS}.`),
    };
  }

  if (request?.difficulty && !allowedDifficulties.has(request.difficulty)) {
    return { ok: false, error: validationError("difficulty must be easy, medium, or hard.") };
  }

  if (batchMode === "batch" && (startQuestionIndex === undefined || !batchSize)) {
    return { ok: false, error: validationError("Batch generation requires startQuestionIndex and batchSize.") };
  }

  // Mock readiness check only. Real readiness should verify extraction status server-side.
  if (materialId.toLowerCase().includes("not-ready")) {
    return { ok: false, error: notReadyError("Material extraction is not ready for flashcard generation.") };
  }

  return {
    ok: true,
    metadata: {
      difficulty: request?.difficulty,
      batchIndex,
      batchMode,
      batchSize,
      generationStage: "creating-deck",
      generationStatus: "complete",
      generationMode,
      idempotencyKey,
      materialId,
      maxCards,
      requestedCardCount,
      startQuestionIndex,
      topicFocus: normalizeTopicFocus(request?.topicFocus),
    },
  };
};
