import { API_BASE_URL, FLASHLY_AUTH_MODE, USE_BACKEND_API } from "@/api/config";
import {
  FLASHLY_DATA_MODE,
  FLASHLY_EXTRACTION_MODE,
  FLASHLY_GENERATION_MODE,
  FLASHLY_STORAGE_MODE,
} from "@/api/server/config";
import { extractionService } from "@/api/server/extraction";
import { generationService } from "@/api/server/generation";
import {
  assistantRepository,
  deckRepository,
  progressRepository,
  reviewRepository,
  uploadRepository,
} from "@/api/server/repositories";
import { storageService } from "@/api/server/storage";
import { validateExtractMaterialRequest } from "@/api/server/extractionValidation";
import { validateGenerateFlashcardsRequest } from "@/api/server/generationValidation";
import { validateCreateReviewSessionRequest } from "@/api/server/reviewValidation";
import { validateCreateUploadRequest } from "@/api/server/uploadValidation";
import {
  type GenerateFlashcardsRequest,
  MAX_SOURCE_TEXT_INPUT_LENGTH,
  type CreateReviewSessionRequest,
  type CreateUploadRequest,
} from "@/api/contracts";

export type BackendSmokeCheckName =
  | "getDecks"
  | "getDeckById"
  | "getCardsForDeck"
  | "getProgressSummary"
  | "createUploadJob"
  | "extractMaterial"
  | "generateFlashcards"
  | "getUploadStatus"
  | "createReviewSession"
  | "getAssistantConversation";

export type BackendSmokeCheckResult = {
  detail: string;
  name: BackendSmokeCheckName;
  ok: boolean;
};

export type BackendSmokeCheckSummary = {
  apiBaseUrl: string;
  authMode: typeof FLASHLY_AUTH_MODE;
  checkedAt: string;
  dataMode: typeof FLASHLY_DATA_MODE;
  extractionMode: typeof FLASHLY_EXTRACTION_MODE;
  generationMode: typeof FLASHLY_GENERATION_MODE;
  ok: boolean;
  results: BackendSmokeCheckResult[];
  storageMode: typeof FLASHLY_STORAGE_MODE;
  useBackendApi: boolean;
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unknown smoke check error.");

const GENERATION_SMOKE_ALLOW_AI = process.env.FLASHLY_GENERATION_SMOKE_ALLOW_AI === "true";

const GENERATION_SMOKE_SOURCE_TEXT = process.env.FLASHLY_GENERATION_SMOKE_SOURCE_TEXT?.trim();

const EXTRACTION_SMOKE_SOURCE_TEXT =
  "These smoke check notes describe active recall, spaced review, and focused flashcard practice. They are plain text so the MVP external extraction path can validate text handoff without OCR, PDF parsing, storage reads, or external services.";
const smokeRepositoryContext = { userId: "mock-clerk-user-flashly" };

const runCheck = async (
  name: BackendSmokeCheckName,
  check: () => Promise<string>,
): Promise<BackendSmokeCheckResult> => {
  try {
    return {
      detail: await check(),
      name,
      ok: true,
    };
  } catch (error) {
    return {
      detail: getErrorMessage(error),
      name,
      ok: false,
    };
  }
};

export const runBackendSmokeCheck = async (): Promise<BackendSmokeCheckSummary> => {
  let selectedDeckId: string | null = null;
  let selectedCardId: string | null = null;
  let selectedMaterialId: string | null = null;
  let uploadJobId: string | null = null;

  const results: BackendSmokeCheckResult[] = [];

  results.push(
    await runCheck("getDecks", async () => {
      const response = await deckRepository.getDecks(smokeRepositoryContext);
      selectedDeckId = response.decks[0]?.id ?? null;

      return `Loaded ${response.decks.length} deck${response.decks.length === 1 ? "" : "s"}.`;
    }),
  );

  results.push(
    await runCheck("getDeckById", async () => {
      if (!selectedDeckId) {
        return "Skipped because no deck id was available.";
      }

      const response = await deckRepository.getDeckById(selectedDeckId, smokeRepositoryContext);

      if (!response) {
        throw new Error(`Deck ${selectedDeckId} was not found.`);
      }

      selectedCardId = response.cards[0]?.id ?? null;

      return `Loaded deck ${response.deck.id} with ${response.cards.length} card${response.cards.length === 1 ? "" : "s"}.`;
    }),
  );

  results.push(
    await runCheck("getCardsForDeck", async () => {
      if (!selectedDeckId) {
        return "Skipped because no deck id was available.";
      }

      const response = await deckRepository.getDeckById(selectedDeckId, smokeRepositoryContext);
      const cards = response?.cards ?? [];
      selectedCardId = selectedCardId ?? cards[0]?.id ?? null;

      return `Loaded ${cards.length} card${cards.length === 1 ? "" : "s"} for ${selectedDeckId}.`;
    }),
  );

  results.push(
    await runCheck("getProgressSummary", async () => {
      const progress = await progressRepository.getProgress(smokeRepositoryContext);

      return `${progress.totalXp} XP, ${progress.dailyStreak} day streak, ${progress.weakCardCount} weak cards.`;
    }),
  );

  results.push(
    await runCheck("createUploadJob", async () => {
      const request: CreateUploadRequest = {
        fileName: "backend-smoke-check-notes.pdf",
        fileSize: 1024,
        idempotencyKey: `backend-smoke-check-${Date.now().toString(36)}`,
        mimeType: "application/pdf",
      };
      const validation = validateCreateUploadRequest(request);

      if (!validation.ok) {
        throw new Error(validation.error.message);
      }

      const storage = storageService.prepareUpload({
        ...validation.metadata,
        idempotencyKey: request.idempotencyKey,
      });
      const upload = await uploadRepository.createUploadJob(
        request,
        {
          ...validation.metadata,
          storageKey: storage.storageKey,
        },
        smokeRepositoryContext,
      );
      selectedMaterialId = upload.materialId;
      uploadJobId = upload.uploadJobId;

      return `Created mock upload job ${upload.uploadJobId} using ${storageService.mode} storage mode.`;
    }),
  );

  results.push(
    await runCheck("getUploadStatus", async () => {
      if (!uploadJobId) {
        return "Skipped because no upload job id was available.";
      }

      const status = await uploadRepository.getUploadStatus(uploadJobId, smokeRepositoryContext);

      return `Upload status ${status.status} at ${status.progressPercentage}%.`;
    }),
  );

  results.push(
    await runCheck("extractMaterial", async () => {
      const useExternalTextExtraction = extractionService.mode === "external";
      const materialId = useExternalTextExtraction
        ? "backend-smoke-check-material-text"
        : selectedMaterialId ?? "backend-smoke-check-material-pdf";
      const validation = validateExtractMaterialRequest(materialId, {
        materialId,
        sourceText: useExternalTextExtraction
          ? EXTRACTION_SMOKE_SOURCE_TEXT.slice(0, MAX_SOURCE_TEXT_INPUT_LENGTH)
          : undefined,
        sourceType: useExternalTextExtraction ? "text" : undefined,
      });

      if (!validation.ok) {
        throw new Error(validation.error.message);
      }

      const extraction = await extractionService.prepareExtractionJob({
        materialId: validation.metadata.materialId,
        metadata: validation.metadata,
      });

      return `Prepared extraction for ${extraction.material.id} with ${extraction.textLength} text characters using ${extractionService.mode} extraction mode.`;
    }),
  );

  results.push(
    await runCheck("generateFlashcards", async () => {
      const materialId = selectedMaterialId ?? "backend-smoke-check-material-pdf";
      const request: GenerateFlashcardsRequest = {
        materialId,
        idempotencyKey: `backend-smoke-generation-${Date.now().toString(36)}`,
        requestedCardCount: 3,
      };
      const validation = validateGenerateFlashcardsRequest(materialId, request);

      if (!validation.ok) {
        throw new Error(validation.error.message);
      }

      if (generationService.mode === "external") {
        const readiness = generationService.validateReadiness();

        if (!readiness.ok) {
          throw new Error(readiness.message);
        }

        if (!GENERATION_SMOKE_ALLOW_AI) {
          return "External generation readiness passed; provider call skipped because FLASHLY_GENERATION_SMOKE_ALLOW_AI is not true.";
        }

        if (!GENERATION_SMOKE_SOURCE_TEXT) {
          throw new Error(
            "FLASHLY_GENERATION_SMOKE_SOURCE_TEXT is required when FLASHLY_GENERATION_SMOKE_ALLOW_AI=true.",
          );
        }
      }

      const generated = await generationService.prepareGeneration({
        extractedTextPreview: generationService.mode === "external" ? GENERATION_SMOKE_SOURCE_TEXT : undefined,
        materialId: validation.metadata.materialId,
        metadata: validation.metadata,
      });

      return `Prepared generation job ${generated.generationJobId} with ${generated.generatedCardCount} card${generated.generatedCardCount === 1 ? "" : "s"} using ${generationService.mode} generation mode.`;
    }),
  );

  results.push(
    await runCheck("createReviewSession", async () => {
      if (!selectedDeckId || !selectedCardId) {
        return "Skipped because no deck/card pair was available.";
      }

      const completedAt = new Date().toISOString();
      const request: CreateReviewSessionRequest = {
        completedAt,
        deckId: selectedDeckId,
        idempotencyKey: `backend-smoke-review-${Date.now().toString(36)}`,
        mode: "quick-review",
        reviews: [
          {
            answeredAt: completedAt,
            answer: "known",
            cardId: selectedCardId,
          },
        ],
        startedAt: completedAt,
      };
      const validation = validateCreateReviewSessionRequest(request);

      if (!validation.ok) {
        throw new Error(validation.error.message);
      }

      const session = await reviewRepository.createReviewSession(validation.metadata, smokeRepositoryContext);

      return `Created mock review session ${session.sessionId} for ${session.cardsReviewed} card.`;
    }),
  );

  results.push(
    await runCheck("getAssistantConversation", async () => {
      if (!selectedDeckId) {
        return "Skipped because no deck id was available.";
      }

      const response = await assistantRepository.getConversationByDeck(selectedDeckId, smokeRepositoryContext);
      const conversation = response.conversation;

      return conversation
        ? `Loaded conversation ${conversation.id} with ${conversation.messages.length} message${conversation.messages.length === 1 ? "" : "s"}.`
        : "No conversation found; this is valid for a fresh local mock deck.";
    }),
  );

  return {
    apiBaseUrl: API_BASE_URL || "(relative Expo API routes)",
    authMode: FLASHLY_AUTH_MODE,
    checkedAt: new Date().toISOString(),
    dataMode: FLASHLY_DATA_MODE,
    extractionMode: FLASHLY_EXTRACTION_MODE,
    generationMode: FLASHLY_GENERATION_MODE,
    ok: results.every((result) => result.ok),
    results,
    storageMode: FLASHLY_STORAGE_MODE,
    useBackendApi: USE_BACKEND_API,
  };
};
