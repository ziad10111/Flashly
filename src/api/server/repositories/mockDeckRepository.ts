import { mockDeck, mockFlashcards } from "../mockData";
import type { ServerDeckRepository } from "./types";

// Server-side mock data access. Routes should depend on this interface, not raw mock data.
const deletedMockDeckIds = new Set<string>();

export const mockDeckRepository: ServerDeckRepository = {
  deleteDeck: (deckId) => {
    deletedMockDeckIds.add(deckId);
  },
  getDeckById: (deckId) => {
    if (deckId !== mockDeck.id || deletedMockDeckIds.has(deckId)) {
      return null;
    }

    return {
      deck: mockDeck,
      cards: mockFlashcards,
    };
  },
  getDecks: () => ({
    decks: deletedMockDeckIds.has(mockDeck.id) ? [] : [mockDeck],
  }),
};
