import { FLASHLY_DATA_MODE } from "../config";
import { generationService } from "../generation";
import type { GenerationBatchWorkItem } from "./repository";
import { databaseGenerationJobRepository } from "./repository";

const WORKER_INTERVAL_MS = 15_000;
const MAX_BATCHES_PER_DRAIN = 100;

let workerDrainPromise: Promise<void> | null = null;
let workerLoopStarted = false;

const logWorker = (event: string, payload: Record<string, unknown>) => {
  console.info("[Flashly Generation Worker]", {
    event,
    ...payload,
  });
};

export const buildGenerationInput = (item: GenerationBatchWorkItem) => ({
  deckId: item.deckId,
  extractedTextPreview: item.extractedTextPreview,
  materialId: item.materialId,
  metadata: {
    batchIndex: item.batchIndex,
    batchMode: "batch" as const,
    batchSize: item.batchSize,
    difficulty: item.difficulty,
    generationMode: item.generationMode,
    generationStage: "creating-deck" as const,
    generationStatus: "complete" as const,
    idempotencyKey: item.idempotencyKey,
    materialId: item.materialId,
    maxCards: item.totalRequestedCardCount,
    requestedCardCount: item.requestedCardCount,
    startQuestionIndex: item.startQuestionIndex,
    topicFocus: item.topicFocus,
  },
});

export const processGenerationBatchOnce = async () => {
  const item = await databaseGenerationJobRepository.claimNextBatch();

  if (!item) {
    return false;
  }

  const startedAt = Date.now();
  logWorker("batch.claimed", {
    attemptCount: item.attemptCount,
    batchId: item.batchId,
    batchIndex: item.batchIndex,
    deckId: item.deckId,
    jobId: item.jobId,
    requestedCardCount: item.requestedCardCount,
  });

  try {
    const generated = await generationService.generateFlashcardDTOs(buildGenerationInput(item));
    const job = await databaseGenerationJobRepository.completeBatch(item, generated);

    logWorker("batch.completed", {
      batchId: item.batchId,
      batchIndex: item.batchIndex,
      completedCardCount: generated.cards.length,
      deckId: item.deckId,
      durationMs: Date.now() - startedAt,
      jobId: item.jobId,
      jobStatus: job?.status,
      requestedCardCount: item.requestedCardCount,
    });
  } catch (error) {
    const job = await databaseGenerationJobRepository.failBatch(item, error);

    logWorker("batch.failed", {
      attemptCount: item.attemptCount,
      batchId: item.batchId,
      batchIndex: item.batchIndex,
      deckId: item.deckId,
      durationMs: Date.now() - startedAt,
      errorCategory: error instanceof Error ? error.name : "unknown",
      jobId: item.jobId,
      jobStatus: job?.status,
      requestedCardCount: item.requestedCardCount,
    });
  }

  return true;
};

export const drainGenerationWorker = async (maxBatches = MAX_BATCHES_PER_DRAIN) => {
  if (FLASHLY_DATA_MODE !== "database") {
    return;
  }

  for (let index = 0; index < maxBatches; index += 1) {
    const processed = await processGenerationBatchOnce();

    if (!processed) {
      return;
    }
  }
};

export const kickGenerationWorker = () => {
  if (FLASHLY_DATA_MODE !== "database") {
    return;
  }

  if (workerDrainPromise) {
    return;
  }

  workerDrainPromise = drainGenerationWorker()
    .catch((error) => {
      logWorker("drain.failed", {
        errorCategory: error instanceof Error ? error.name : "unknown",
        errorMessage: error instanceof Error ? error.message : "Unknown generation worker error.",
      });
    })
    .finally(() => {
      workerDrainPromise = null;
    });
};

export const startGenerationWorkerLoop = () => {
  if (FLASHLY_DATA_MODE !== "database" || workerLoopStarted) {
    return;
  }

  workerLoopStarted = true;
  kickGenerationWorker();
  const interval = setInterval(kickGenerationWorker, WORKER_INTERVAL_MS);

  if (typeof interval.unref === "function") {
    interval.unref();
  }
};
