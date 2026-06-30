import { apiRequest, FlashlyApiError } from "@/api/client";
import { USE_BACKEND_API } from "@/api/config";
import { getAllDecks, getDeckById as findLocalDeckById, getDeckCards } from "@/lib/deck-utils";
import { useActiveDeckStore } from "@/store/useActiveDeckStore";
import { useFlashlyAssistantStore } from "@/store/useFlashlyAssistantStore";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";
import { useFlashlyUploadStore } from "@/store/useFlashlyUploadStore";
import type { FlashcardDTO, GetDeckResponse, GetDecksResponse } from "../contracts";
import { toDeckDTO, toFlashcardDTO } from "./adapters/deckAdapters";
import { withBackendFallback } from "./backendSwitch";
import {
  classifyDeckForDeletion,
  createDeckDeletionOperationRegistry,
  createDeckDeletionLogPayload,
  shouldTreatBackendDeleteErrorAsSuccessfulCleanup,
  type DeckDeletionClassification,
} from "./deckDeletion";

// Local/mock repository. Replace internals with backend fetch calls later.
// Do not add secrets, AI calls, OCR logic, or file parsing here.

const getLocalGeneratedDecks = (): GetDecksResponse => {
  const uploadState = useFlashlyUploadStore.getState();
  const progressState = useFlashlyProgressStore.getState();
  const deletedDeckIds = new Set(progressState.deletedDeckIds);
  const progressByDeckId = progressState.deckProgressById;
  const decks = uploadState.generatedDecks.map((deck) =>
    toDeckDTO(deck, getDeckCards(deck.id, uploadState.generatedCardsByDeckId), progressByDeckId[deck.id]),
  ).filter((deck) => !deletedDeckIds.has(deck.id));

  return { decks };
};

const mergeDeckResponses = (backendResponse: GetDecksResponse, generatedResponse: GetDecksResponse): GetDecksResponse => {
  const backendPersistedGeneratedIds = new Set(
    useFlashlyUploadStore
      .getState()
      .generatedDecks
      .filter((deck) => Boolean(deck.generationJobId))
      .map((deck) => deck.id),
  );
  const localOnlyGeneratedDecks = generatedResponse.decks.filter((deck) => !backendPersistedGeneratedIds.has(deck.id));
  const generatedIds = new Set(localOnlyGeneratedDecks.map((deck) => deck.id));

  return {
    decks: [...localOnlyGeneratedDecks, ...backendResponse.decks.filter((deck) => !generatedIds.has(deck.id))],
  };
};

const getLocalDecks = async (): Promise<GetDecksResponse> => {
  const uploadState = useFlashlyUploadStore.getState();
  const progressState = useFlashlyProgressStore.getState();
  const deletedDeckIds = new Set(progressState.deletedDeckIds);
  const progressByDeckId = progressState.deckProgressById;
  const decks = getAllDecks(uploadState.generatedDecks).map((deck) =>
    toDeckDTO(deck, getDeckCards(deck.id, uploadState.generatedCardsByDeckId), progressByDeckId[deck.id]),
  ).filter((deck) => !deletedDeckIds.has(deck.id));

  return { decks };
};

const getBackendDecks = async (): Promise<GetDecksResponse> => {
  const backendResponse = await apiRequest<GetDecksResponse>("/api/decks");
  const deletedDeckIds = new Set(useFlashlyProgressStore.getState().deletedDeckIds);
  const visibleBackendDecks = backendResponse.decks.filter((deck) => !deletedDeckIds.has(deck.id));
  return mergeDeckResponses({ decks: visibleBackendDecks }, getLocalGeneratedDecks());
};

const getLocalDeckById = async (deckId: string): Promise<GetDeckResponse | null> => {
  const uploadState = useFlashlyUploadStore.getState();
  const progressState = useFlashlyProgressStore.getState();

  if (progressState.deletedDeckIds.includes(deckId)) {
    return null;
  }

  const deck = findLocalDeckById(deckId, uploadState.generatedDecks);

  if (!deck) {
    return null;
  }

  const cards = getDeckCards(deck.id, uploadState.generatedCardsByDeckId);
  const progress = progressState.deckProgressById[deck.id];

  return {
    deck: toDeckDTO(deck, cards, progress),
    cards: cards.map(toFlashcardDTO),
  };
};

const getBackendDeckById = async (deckId: string): Promise<GetDeckResponse | null> => {
  if (useFlashlyProgressStore.getState().deletedDeckIds.includes(deckId)) {
    return null;
  }

  const localGenerated = await getLocalDeckById(deckId);

  const localGeneratedDeck = useFlashlyUploadStore.getState().generatedDecks.find((deck) => deck.id === deckId);

  if (localGenerated?.deck.materialId && !localGeneratedDeck?.generationJobId) {
    return localGenerated;
  }

  const backendResponse = await apiRequest<GetDeckResponse>(`/api/decks/${encodeURIComponent(deckId)}`);

  return backendResponse ?? localGenerated;
};

const getLocalCardsForDeck = async (deckId: string): Promise<FlashcardDTO[]> => {
  if (useFlashlyProgressStore.getState().deletedDeckIds.includes(deckId)) {
    return [];
  }

  const uploadState = useFlashlyUploadStore.getState();
  return getDeckCards(deckId, uploadState.generatedCardsByDeckId).map(toFlashcardDTO);
};

const getBackendCardsForDeck = async (deckId: string): Promise<FlashcardDTO[]> => {
  const response = await getBackendDeckById(deckId);
  return response?.cards ?? [];
};

const isDeleteDeckResponse = (value: unknown): value is { ok: true } =>
  Boolean(value && typeof value === "object" && (value as { ok?: unknown }).ok === true);

const deckDeleteOperations = createDeckDeletionOperationRegistry();

const logDeckDeletion = (
  event: "start" | "local-cleanup" | "backend-404" | "failed" | "complete",
  classification: DeckDeletionClassification,
  meta: Parameters<typeof createDeckDeletionLogPayload>[1] = {},
  extra: Record<string, unknown> = {},
) => {
  if (typeof __DEV__ === "undefined" || !__DEV__) {
    return;
  }

  const payload = {
    event,
    ...createDeckDeletionLogPayload(classification, meta),
    reason: classification.reason,
    ...extra,
  };

  if (event === "backend-404" || event === "failed") {
    console.warn("[Flashly Decks] deleteDeck", payload);
    return;
  }

  console.info("[Flashly Decks] deleteDeck", payload);
};

export const getDecks = async (): Promise<GetDecksResponse> =>
  withBackendFallback({
    backend: getBackendDecks,
    fallback: getLocalDecks,
    label: "getDecks",
  });

export const getDeckById = async (deckId: string): Promise<GetDeckResponse | null> =>
  withBackendFallback({
    backend: () => getBackendDeckById(deckId),
    fallback: () => getLocalDeckById(deckId),
    label: `getDeckById(${deckId})`,
  });

export const getCardsForDeck = async (deckId: string): Promise<FlashcardDTO[]> =>
  withBackendFallback({
    backend: () => getBackendCardsForDeck(deckId),
    fallback: () => getLocalCardsForDeck(deckId),
    label: `getCardsForDeck(${deckId})`,
  });

type DeckDeletionStateSnapshot = {
  activeDeckId: string;
  assistant: {
    activeDeckId: ReturnType<typeof useFlashlyAssistantStore.getState>["activeDeckId"];
    conversationsByDeckId: ReturnType<typeof useFlashlyAssistantStore.getState>["conversationsByDeckId"];
  };
  progress: Pick<
    ReturnType<typeof useFlashlyProgressStore.getState>,
    "completedDeckIds" | "dailyReviewProgress" | "deletedDeckIds" | "deckProgressById" | "reviewSessionHistory" | "totalXp"
  >;
  upload: Pick<
    ReturnType<typeof useFlashlyUploadStore.getState>,
    | "currentStage"
    | "errorMessage"
    | "generatedCardsByDeckId"
    | "generatedDeckId"
    | "generatedDecks"
    | "idempotencyKey"
    | "materialId"
    | "progressPercentage"
    | "status"
    | "uploadJobId"
  >;
};

const createDeletionStateSnapshot = (): DeckDeletionStateSnapshot => {
  const uploadStore = useFlashlyUploadStore.getState();
  const progressStore = useFlashlyProgressStore.getState();
  const assistantStore = useFlashlyAssistantStore.getState();

  return {
    activeDeckId: useActiveDeckStore.getState().activeDeckId,
    assistant: {
      activeDeckId: assistantStore.activeDeckId,
      conversationsByDeckId: assistantStore.conversationsByDeckId,
    },
    progress: {
      completedDeckIds: progressStore.completedDeckIds,
      dailyReviewProgress: progressStore.dailyReviewProgress,
      deletedDeckIds: progressStore.deletedDeckIds,
      deckProgressById: progressStore.deckProgressById,
      reviewSessionHistory: progressStore.reviewSessionHistory,
      totalXp: progressStore.totalXp,
    },
    upload: {
      currentStage: uploadStore.currentStage,
      errorMessage: uploadStore.errorMessage,
      generatedCardsByDeckId: uploadStore.generatedCardsByDeckId,
      generatedDeckId: uploadStore.generatedDeckId,
      generatedDecks: uploadStore.generatedDecks,
      idempotencyKey: uploadStore.idempotencyKey,
      materialId: uploadStore.materialId,
      progressPercentage: uploadStore.progressPercentage,
      status: uploadStore.status,
      uploadJobId: uploadStore.uploadJobId,
    },
  };
};

const restoreDeletionStateSnapshot = (snapshot: DeckDeletionStateSnapshot) => {
  useFlashlyUploadStore.setState(snapshot.upload);
  useFlashlyProgressStore.setState(snapshot.progress);
  useActiveDeckStore.setState({ activeDeckId: snapshot.activeDeckId });
  useFlashlyAssistantStore.setState(snapshot.assistant);
};

const cleanupDeckLocally = (deckId: string) => {
  const progressBeforeCleanup = useFlashlyProgressStore.getState();
  const uploadBeforeCleanup = useFlashlyUploadStore.getState();
  const assistantBeforeCleanup = useFlashlyAssistantStore.getState();
  const activeDeckIdBeforeCleanup = useActiveDeckStore.getState().activeDeckId;

  useFlashlyProgressStore.getState().deleteDeckProgress(deckId, { hideDeck: true });
  useFlashlyUploadStore.getState().removeGeneratedDeck(deckId);
  useFlashlyAssistantStore.getState().clearConversation(deckId);

  if (activeDeckIdBeforeCleanup === deckId) {
    useActiveDeckStore.getState().setActiveDeckId("");
  }

  if (assistantBeforeCleanup.activeDeckId === deckId) {
    useFlashlyAssistantStore.getState().setActiveDeckId(null);
  }

  const progressAfterCleanup = useFlashlyProgressStore.getState();
  const uploadAfterCleanup = useFlashlyUploadStore.getState();
  const assistantAfterCleanup = useFlashlyAssistantStore.getState();

  return {
    activeDeckCleared: activeDeckIdBeforeCleanup === deckId && useActiveDeckStore.getState().activeDeckId !== deckId,
    assistantCleared:
      Boolean(assistantBeforeCleanup.conversationsByDeckId[deckId]) &&
      !assistantAfterCleanup.conversationsByDeckId[deckId],
    generatedCardsRemoved: Boolean(uploadBeforeCleanup.generatedCardsByDeckId[deckId]) && !uploadAfterCleanup.generatedCardsByDeckId[deckId],
    generatedDeckRemoved:
      uploadBeforeCleanup.generatedDecks.some((deck) => deck.id === deckId) &&
      !uploadAfterCleanup.generatedDecks.some((deck) => deck.id === deckId),
    progressRemoved:
      Boolean(progressBeforeCleanup.deckProgressById[deckId]) && !progressAfterCleanup.deckProgressById[deckId],
    tombstoned: progressAfterCleanup.deletedDeckIds.includes(deckId),
  };
};

const deleteDeckThroughBackend = async (deckId: string) => {
  const response = await apiRequest<{ ok: true }>(`/api/decks/${encodeURIComponent(deckId)}`, {
    debugLabel: "deleteDeck",
    debugMeta: { deckId },
    method: "DELETE",
  });

  if (!isDeleteDeckResponse(response)) {
    throw new Error("Flashly API did not confirm deck deletion.");
  }

  return 200;
};

const deleteDeckOnce = async (deckId: string): Promise<void> => {
  const uploadStore = useFlashlyUploadStore.getState();
  const localGeneratedDeck = uploadStore.generatedDecks.find((deck) => deck.id === deckId);
  const localStaticDeck = localGeneratedDeck ? null : findLocalDeckById(deckId, []);
  const classification = classifyDeckForDeletion({
    deckId,
    deckStatus: localGeneratedDeck?.status ?? localStaticDeck?.status,
    generationJobId: localGeneratedDeck?.generationJobId,
    generationStatus: localGeneratedDeck?.generationStatus,
    hasLocalGeneratedDeck: Boolean(localGeneratedDeck),
    hasLocalStaticDeck: Boolean(localStaticDeck),
    useBackendApi: USE_BACKEND_API,
  });
  const snapshot = createDeletionStateSnapshot();

  logDeckDeletion("start", classification, {
    backendRequestAttempted: false,
    localCleanupResult: "skipped",
  });

  if (!classification.backendRequestRequired) {
    const cleanupResult = cleanupDeckLocally(deckId);
    logDeckDeletion("complete", classification, {
      backendRequestAttempted: false,
      localCleanupResult: "success",
    }, cleanupResult);
    return;
  }

  try {
    const backendStatus = await deleteDeckThroughBackend(deckId);
    const cleanupResult = cleanupDeckLocally(deckId);

    logDeckDeletion("complete", classification, {
      backendRequestAttempted: true,
      backendResponseStatus: backendStatus,
      localCleanupResult: "success",
    }, cleanupResult);
  } catch (error) {
    const backendStatus = error instanceof FlashlyApiError ? error.status : undefined;

    if (shouldTreatBackendDeleteErrorAsSuccessfulCleanup(backendStatus)) {
      const cleanupResult = cleanupDeckLocally(deckId);

      logDeckDeletion("backend-404", classification, {
        backendRequestAttempted: true,
        backendResponseStatus: backendStatus,
        localCleanupResult: "success",
      }, {
        ...cleanupResult,
        message: "Deck already absent remotely; stale local copy removed.",
      });

      return;
    }

    restoreDeletionStateSnapshot(snapshot);
    logDeckDeletion("failed", classification, {
      backendRequestAttempted: true,
      backendResponseStatus: backendStatus,
      localCleanupResult: "rolled-back",
    }, {
      code: error instanceof FlashlyApiError ? error.error.code : undefined,
      message: error instanceof Error ? error.message : "Unknown delete failure",
    });
    throw error;
  }
};

export const deleteDeck = async (deckId: string): Promise<void> => {
  return deckDeleteOperations.run(deckId, () => deleteDeckOnce(deckId));
};
