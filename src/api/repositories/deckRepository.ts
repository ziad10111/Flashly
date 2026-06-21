import { apiRequest } from "@/api/client";
import { USE_BACKEND_API } from "@/api/config";
import { getAllDecks, getDeckById as findLocalDeckById, getDeckCards } from "@/lib/deck-utils";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";
import { useFlashlyUploadStore } from "@/store/useFlashlyUploadStore";
import type { FlashcardDTO, GetDeckResponse, GetDecksResponse } from "../contracts";
import { toDeckDTO, toFlashcardDTO } from "./adapters/deckAdapters";
import { withBackendFallback } from "./backendSwitch";

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
  const generatedIds = new Set(generatedResponse.decks.map((deck) => deck.id));

  return {
    decks: [...generatedResponse.decks, ...backendResponse.decks.filter((deck) => !generatedIds.has(deck.id))],
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

  if (localGenerated?.deck.materialId) {
    return localGenerated;
  }

  return apiRequest<GetDeckResponse>(`/api/decks/${encodeURIComponent(deckId)}`);
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

export const deleteDeck = async (deckId: string): Promise<void> => {
  const uploadStore = useFlashlyUploadStore.getState();
  const progressStore = useFlashlyProgressStore.getState();
  const uploadSnapshot = {
    generatedCardsByDeckId: uploadStore.generatedCardsByDeckId,
    generatedDeckId: uploadStore.generatedDeckId,
    generatedDecks: uploadStore.generatedDecks,
  };
  const progressSnapshot = {
    completedDeckIds: progressStore.completedDeckIds,
    deletedDeckIds: progressStore.deletedDeckIds,
    deckProgressById: progressStore.deckProgressById,
    reviewSessionHistory: progressStore.reviewSessionHistory,
    totalXp: progressStore.totalXp,
  };

  uploadStore.removeGeneratedDeck(deckId);
  useFlashlyProgressStore.getState().deleteDeckProgress(deckId, { hideDeck: true });

  if (!USE_BACKEND_API) {
    return;
  }

  try {
    await apiRequest<{ ok: true }>(`/api/decks/${encodeURIComponent(deckId)}`, { method: "DELETE" });
  } catch (error) {
    useFlashlyUploadStore.setState(uploadSnapshot);
    useFlashlyProgressStore.setState(progressSnapshot);
    throw error;
  }
};
