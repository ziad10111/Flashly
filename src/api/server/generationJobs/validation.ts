import type { ApiErrorDTO, StartGenerationJobRequest } from "@/api/contracts";

import { validationError } from "../apiErrors";
import { DEFAULT_COMPREHENSIVE_GENERATED_CARDS, MAX_GENERATED_CARDS, MIN_GENERATED_CARDS } from "../generationLimits";

export type StartGenerationJobValidationResult =
  | {
      ok: true;
      request: StartGenerationJobRequest;
    }
  | {
      error: ApiErrorDTO;
      ok: false;
    };

const normalizeIdempotencyKey = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 100);

const normalizeTopicFocus = (topics: string[] | undefined) =>
  (topics ?? [])
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(0, 6);

const normalizePositiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;

export const validateStartGenerationJobRequest = (
  body: StartGenerationJobRequest | null,
): StartGenerationJobValidationResult => {
  const materialId = body?.materialId ?? body?.sourceId;

  if (!materialId?.trim()) {
    return { ok: false, error: validationError("materialId or sourceId is required.") };
  }

  const idempotencyKey = normalizeIdempotencyKey(body?.idempotencyKey ?? "");

  if (!idempotencyKey) {
    return { ok: false, error: validationError("idempotencyKey is required.") };
  }

  const requestedCardCount =
    normalizePositiveInteger(body?.requestedCardCount) ?? DEFAULT_COMPREHENSIVE_GENERATED_CARDS;

  if (requestedCardCount < MIN_GENERATED_CARDS || requestedCardCount > MAX_GENERATED_CARDS) {
    return {
      ok: false,
      error: validationError(`requestedCardCount must be between ${MIN_GENERATED_CARDS} and ${MAX_GENERATED_CARDS}.`),
    };
  }

  const batchSize = normalizePositiveInteger(body?.batchSize);

  if (batchSize && batchSize > requestedCardCount) {
    return { ok: false, error: validationError("batchSize cannot be larger than requestedCardCount.") };
  }

  if (body?.difficulty && !["easy", "medium", "hard"].includes(body.difficulty)) {
    return { ok: false, error: validationError("difficulty must be easy, medium, or hard.") };
  }

  return {
    ok: true,
    request: {
      batchSize,
      deckTitle: body?.deckTitle?.trim() || undefined,
      difficulty: body?.difficulty,
      extractedTextPreview: body?.extractedTextPreview,
      generationMode: body?.generationMode === "sample" ? "sample" : "comprehensive",
      idempotencyKey,
      materialId,
      requestedCardCount,
      sourceId: materialId,
      topicFocus: normalizeTopicFocus(body?.topicFocus),
    },
  };
};
