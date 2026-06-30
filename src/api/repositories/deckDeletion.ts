import type { DeckDTO } from "../contracts";

export type DeckDeletionStatus =
  | DeckDTO["status"]
  | "queued"
  | "processing"
  | "partial"
  | "completed"
  | "failed"
  | "complete"
  | "unknown"
  | "weak-cards";

export type DeckDeletionSnapshot = {
  deckId: string;
  deckStatus?: DeckDeletionStatus;
  generationJobId?: string;
  generationStatus?:
    | "queued"
    | "processing"
    | "partial"
    | "completed"
    | "failed"
    | "cancelled"
    | "generating"
    | "complete"
    | "partial-error";
  hasLocalGeneratedDeck: boolean;
  hasLocalStaticDeck: boolean;
  useBackendApi: boolean;
};

export type DeckDeletionSource = "backend" | "local-generated" | "local-static" | "legacy-mock" | "unknown";

export type DeckDeletionClassification = {
  backendRequestRequired: boolean;
  deckId: string;
  generationStatus: DeckDeletionStatus;
  isGenerating: boolean;
  isLocal: boolean;
  isMock: boolean;
  isPersisted: boolean;
  reason: string;
  source: DeckDeletionSource;
};

export type DeckDeletionLogPayload = {
  backendRequestAttempted: boolean;
  backendResponseStatus?: number;
  deckId: string;
  deckSource: DeckDeletionSource;
  generationStatus: DeckDeletionStatus;
  isGenerating: boolean;
  isLocal: boolean;
  isMock: boolean;
  isPersisted: boolean;
  localCleanupResult?: "success" | "rolled-back" | "skipped";
};

const LEGACY_LOCAL_DECK_ID_PATTERNS = [
  /^ai-generated-deck-/,
  /^mock-generated-deck-/,
  /^generated-/,
  /mock-material/,
  /mock-upload/,
];

export const isLegacyLocalOrMockDeckId = (deckId: string) =>
  LEGACY_LOCAL_DECK_ID_PATTERNS.some((pattern) => pattern.test(deckId));

const getGenerationStatus = (snapshot: DeckDeletionSnapshot): DeckDeletionStatus =>
  snapshot.generationStatus ?? snapshot.deckStatus ?? "unknown";

export const classifyDeckForDeletion = (snapshot: DeckDeletionSnapshot): DeckDeletionClassification => {
  const generationStatus = getGenerationStatus(snapshot);
  const isGenerating =
    generationStatus === "generating" ||
    generationStatus === "queued" ||
    generationStatus === "partial-error" ||
    generationStatus === "partial" ||
    generationStatus === "failed" ||
    generationStatus === "processing";
  const isLegacyMock = isLegacyLocalOrMockDeckId(snapshot.deckId);

  if (snapshot.hasLocalGeneratedDeck) {
    const isBackendPersisted = snapshot.useBackendApi && Boolean(snapshot.generationJobId) && !isLegacyMock;

    return {
      backendRequestRequired: isBackendPersisted,
      deckId: snapshot.deckId,
      generationStatus,
      isGenerating,
      isLocal: true,
      isMock: isLegacyMock,
      isPersisted: isBackendPersisted,
      reason: isBackendPersisted
        ? "local generated deck has backend generation metadata"
        : "local generated deck is not backend persisted",
      source: "local-generated",
    };
  }

  if (snapshot.hasLocalStaticDeck) {
    return {
      backendRequestRequired: false,
      deckId: snapshot.deckId,
      generationStatus,
      isGenerating,
      isLocal: true,
      isMock: true,
      isPersisted: false,
      reason: "deck is bundled local/mock study material",
      source: "local-static",
    };
  }

  if (!snapshot.useBackendApi) {
    return {
      backendRequestRequired: false,
      deckId: snapshot.deckId,
      generationStatus,
      isGenerating,
      isLocal: true,
      isMock: isLegacyMock,
      isPersisted: false,
      reason: "backend API is disabled",
      source: isLegacyMock ? "legacy-mock" : "unknown",
    };
  }

  if (isLegacyMock) {
    return {
      backendRequestRequired: false,
      deckId: snapshot.deckId,
      generationStatus,
      isGenerating,
      isLocal: true,
      isMock: true,
      isPersisted: false,
      reason: "legacy generated/mock deck id",
      source: "legacy-mock",
    };
  }

  return {
    backendRequestRequired: true,
    deckId: snapshot.deckId,
    generationStatus,
    isGenerating,
    isLocal: false,
    isMock: false,
    isPersisted: true,
    reason: "deck is expected to be backend persisted",
    source: "backend",
  };
};

export const createDeckDeletionLogPayload = (
  classification: DeckDeletionClassification,
  meta: {
    backendRequestAttempted?: boolean;
    backendResponseStatus?: number;
    localCleanupResult?: DeckDeletionLogPayload["localCleanupResult"];
  } = {},
): DeckDeletionLogPayload => ({
  backendRequestAttempted: meta.backendRequestAttempted ?? false,
  backendResponseStatus: meta.backendResponseStatus,
  deckId: classification.deckId,
  deckSource: classification.source,
  generationStatus: classification.generationStatus,
  isGenerating: classification.isGenerating,
  isLocal: classification.isLocal,
  isMock: classification.isMock,
  isPersisted: classification.isPersisted,
  localCleanupResult: meta.localCleanupResult,
});

export const shouldTreatBackendDeleteErrorAsSuccessfulCleanup = (status: number | undefined) => status === 404;

export const shouldApplyGeneratedDeckMutation = ({
  deckId,
  deletedDeckIds,
}: {
  deckId: string;
  deletedDeckIds: string[];
}) => !deletedDeckIds.includes(deckId);

export const createDeckDeletionOperationRegistry = () => {
  const operations = new Map<string, Promise<void>>();

  return {
    run(deckId: string, operationFactory: () => Promise<void>) {
      const existingOperation = operations.get(deckId);

      if (existingOperation) {
        return existingOperation;
      }

      let operation: Promise<void>;

      try {
        operation = Promise.resolve(operationFactory());
      } catch (error) {
        operation = Promise.reject(error);
      }

      operation = operation.finally(() => {
        operations.delete(deckId);
      });

      operations.set(deckId, operation);

      return operation;
    },
  };
};
