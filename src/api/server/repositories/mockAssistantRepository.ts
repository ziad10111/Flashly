import { createMockAssistantResponse, getMockAssistantConversationByDeck } from "../mockData";
import type { ServerAssistantRepository } from "./types";

// Server-side mock data access. Real Study Assistant persistence/retrieval belongs here later.
export const mockAssistantRepository: ServerAssistantRepository = {
  getConversationByDeck: (deckId) => getMockAssistantConversationByDeck(deckId),
  sendMessage: (request) => createMockAssistantResponse(request.deckId, request.message),
};
