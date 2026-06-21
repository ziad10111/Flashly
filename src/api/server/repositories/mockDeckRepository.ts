import { getMockDeckResponse, getMockDecksResponse } from "../mockData";
import type { ServerDeckRepository } from "./types";

// Server-side mock data access. Routes should depend on this interface, not raw mock data.
export const mockDeckRepository: ServerDeckRepository = {
  deleteDeck: () => undefined,
  getDeckById: (deckId) => getMockDeckResponse(deckId),
  getDecks: () => getMockDecksResponse(),
};
