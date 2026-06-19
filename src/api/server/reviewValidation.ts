import type { ApiErrorDTO, CardReviewAnswerDTO, CreateReviewSessionRequest, ReviewModeDTO } from "@/api/contracts";
import { validationError } from "./apiErrors";
import { SUPPORTED_REVIEW_MODES } from "./reviewRules";

export type ReviewValidationSuccess = {
  ok: true;
  metadata: {
    completedAt: string;
    deckId: string;
    idempotencyKey: string;
    mode: ReviewModeDTO;
    reviews: {
      answeredAt: string;
      answer: CardReviewAnswerDTO;
      cardId: string;
    }[];
    startedAt: string;
  };
};

export type ReviewValidationFailure = {
  error: ApiErrorDTO;
  ok: false;
};

export type ReviewValidationResult = ReviewValidationSuccess | ReviewValidationFailure;

const isValidDate = (value: string) => !Number.isNaN(Date.parse(value));

const isSupportedAnswer = (answer: string): answer is CardReviewAnswerDTO => answer === "known" || answer === "again";

export const validateCreateReviewSessionRequest = (
  request: CreateReviewSessionRequest | null,
): ReviewValidationResult => {
  if (!request) {
    return { ok: false, error: validationError("Review session payload is required.") };
  }

  if (!request.deckId.trim()) {
    return { ok: false, error: validationError("deckId is required.") };
  }

  if (!request.idempotencyKey.trim()) {
    return { ok: false, error: validationError("idempotencyKey is required.") };
  }

  if (!SUPPORTED_REVIEW_MODES.includes(request.mode)) {
    return { ok: false, error: validationError("Unsupported review mode.") };
  }

  if (!isValidDate(request.startedAt) || !isValidDate(request.completedAt)) {
    return { ok: false, error: validationError("startedAt and completedAt must be valid ISO timestamps.") };
  }

  if (new Date(request.completedAt).getTime() < new Date(request.startedAt).getTime()) {
    return { ok: false, error: validationError("completedAt must be after startedAt.") };
  }

  if (!Array.isArray(request.reviews) || request.reviews.length === 0) {
    return { ok: false, error: validationError("At least one card review is required.") };
  }

  const seenCardIds = new Set<string>();

  for (const review of request.reviews) {
    if (!review.cardId.trim()) {
      return { ok: false, error: validationError("Each review must include a cardId.") };
    }

    if (seenCardIds.has(review.cardId)) {
      return { ok: false, error: validationError("Duplicate card reviews are not allowed in one session.") };
    }

    if (!isSupportedAnswer(review.answer)) {
      return { ok: false, error: validationError("Review answer must be known or again.") };
    }

    if (!isValidDate(review.answeredAt)) {
      return { ok: false, error: validationError("Each review must include a valid answeredAt timestamp.") };
    }

    seenCardIds.add(review.cardId);
  }

  return {
    ok: true,
    metadata: {
      completedAt: request.completedAt,
      deckId: request.deckId,
      idempotencyKey: request.idempotencyKey,
      mode: request.mode,
      reviews: request.reviews,
      startedAt: request.startedAt,
    },
  };
};
