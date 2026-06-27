import { generateFlashcardsForMaterial } from "@/api/repositories/materialRepository";
import { shouldApplyGeneratedDeckMutation } from "@/api/repositories/deckDeletion";
import { triggerSuccessHaptic, triggerWarningHaptic } from "@/lib/feedback/haptics";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";
import { useFlashlyUploadStore } from "@/store/useFlashlyUploadStore";

export const FIRST_BATCH_CARD_COUNT = 3;
export const BACKGROUND_BATCH_CARD_COUNT = 5;
export const MAX_PROGRESSIVE_PDF_CARDS = 100;

type RunRemainingGenerationOptions = {
  batchSize?: number;
  deckId: string;
  errorToMessage?: (error: unknown) => string | null;
  extractedTextPreview: string;
  idempotencyKey: string;
  materialId: string;
  maxCards?: number;
  startQuestionIndex: number;
};

const logProgressiveGeneration = (payload: Record<string, unknown>) => {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.info("[Flashly Upload] background generation", payload);
  }
};

export const runRemainingGeneratedDeckBatches = async ({
  batchSize = BACKGROUND_BATCH_CARD_COUNT,
  deckId,
  errorToMessage,
  extractedTextPreview,
  idempotencyKey,
  materialId,
  maxCards = MAX_PROGRESSIVE_PDF_CARDS,
  startQuestionIndex,
}: RunRemainingGenerationOptions) => {
  const store = useFlashlyUploadStore.getState();
  let nextStartQuestionIndex = startQuestionIndex;
  let batchIndex = Math.floor(startQuestionIndex / batchSize) + 1;
  let hasMore = true;
  const isDeleted = () =>
    !shouldApplyGeneratedDeckMutation({
      deckId,
      deletedDeckIds: useFlashlyProgressStore.getState().deletedDeckIds,
    });

  if (isDeleted()) {
    logProgressiveGeneration({ deckId, status: "deleted-before-start" });
    return;
  }

  store.markGeneratedDeckGenerating(deckId);

  while (hasMore) {
    if (isDeleted()) {
      logProgressiveGeneration({ batchIndex, deckId, status: "deleted-before-batch" });
      return;
    }

    try {
      logProgressiveGeneration({
        batchIndex,
        batchOffset: nextStartQuestionIndex,
        deckId,
        maxCards,
        requestedCardCount: batchSize,
        status: "started",
      });

      const batchGeneration = await generateFlashcardsForMaterial({
        materialId,
        extractedTextPreview,
        generationMode: "comprehensive",
        batchMode: "batch",
        batchIndex,
        batchSize,
        startQuestionIndex: nextStartQuestionIndex,
        maxCards,
        requestedCardCount: batchSize,
        idempotencyKey,
      });

      if (isDeleted()) {
        logProgressiveGeneration({
          batchIndex,
          batchOffset: nextStartQuestionIndex,
          deckId,
          generatedCount: batchGeneration.cards.length,
          status: "deleted-after-response",
        });
        return;
      }

      const nextCursor = nextStartQuestionIndex + batchSize;
      const appendResult = useFlashlyUploadStore
        .getState()
        .appendGeneratedCardsToDeck(batchGeneration, { nextBatchStartIndex: nextCursor });

      logProgressiveGeneration({
        batchIndex,
        batchOffset: nextStartQuestionIndex,
        deckId,
        generatedCount: batchGeneration.cards.length,
        appendedCount: appendResult.appendedCount,
        status: "appended",
      });

      hasMore = batchGeneration.hasMore ?? false;
      nextStartQuestionIndex = nextCursor;
      batchIndex += 1;
    } catch (error) {
      const message =
        errorToMessage?.(error) ??
        "Some background batches failed. You can study the available cards or retry.";

      useFlashlyUploadStore.getState().markGeneratedDeckPartialError(deckId, message);
      triggerWarningHaptic();

      logProgressiveGeneration({
        batchIndex,
        batchOffset: nextStartQuestionIndex,
        deckId,
        errorMessage: message,
        status: "partial-error",
      });

      return;
    }
  }

  if (isDeleted()) {
    logProgressiveGeneration({ deckId, status: "deleted-before-complete" });
    return;
  }

  useFlashlyUploadStore.getState().markGeneratedDeckComplete(deckId);
  triggerSuccessHaptic();
  logProgressiveGeneration({ deckId, status: "complete" });
};
