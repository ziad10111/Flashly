import { apiRequest } from "@/api/client";
import { getDeckById } from "./deckRepository";
import { useFlashlyAssistantStore } from "@/store/useFlashlyAssistantStore";
import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantConversationDTO,
  AssistantMessageDTO,
  GetAssistantConversationResponse,
} from "../contracts";
import { withBackendFallback } from "./backendSwitch";

// Local/mock repository. Replace internals with POST /api/assistant/chat later.
// Do not add secrets, AI calls, OCR logic, or file parsing here.

const toAssistantMessageDTO = (
  conversationId: string,
  message: ReturnType<typeof useFlashlyAssistantStore.getState>["conversationsByDeckId"][string]["messages"][number],
): AssistantMessageDTO => ({
  id: message.id,
  conversationId,
  deckId: message.deckId ?? "",
  materialId: message.materialId,
  role: message.role,
  content: message.content,
  createdAt: message.createdAt,
});

const toConversationDTO = (
  conversation: ReturnType<typeof useFlashlyAssistantStore.getState>["conversationsByDeckId"][string],
): AssistantConversationDTO => ({
  id: conversation.id,
  deckId: conversation.deckId,
  materialId: conversation.materialId,
  messages: conversation.messages.map((message) => toAssistantMessageDTO(conversation.id, message)),
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
});

export const sendAssistantMessage = async (
  request: AssistantChatRequest,
): Promise<AssistantChatResponse> => {
  // Keep this local for now so mock conversations continue to persist in Zustand.
  // Later, POST /api/assistant/chat can become the source of truth behind USE_BACKEND_API.
  const deckResponse = await getDeckById(request.deckId);
  const reply = deckResponse
    ? `I can help with ${deckResponse.deck.title}. This local mock response is scoped to ${deckResponse.deck.cardCount} cards from ${deckResponse.deck.sourceFileName}.`
    : "Choose a deck first so the Study Assistant can stay focused on the right material.";
  const materialId = deckResponse?.deck.materialId;

  useFlashlyAssistantStore.getState().addMessagePair(request.deckId, request.message, reply, materialId);

  const conversation = useFlashlyAssistantStore.getState().conversationsByDeckId[request.deckId];
  const conversationDTO = toConversationDTO(conversation);
  const message = conversationDTO.messages[conversationDTO.messages.length - 1];

  return {
    conversation: conversationDTO,
    message,
    error: deckResponse ? undefined : { code: "not-found", message: "Deck context was not found for this local assistant reply." },
  };
};

const getLocalAssistantConversation = async (deckId: string): Promise<AssistantConversationDTO | null> => {
  const conversation = useFlashlyAssistantStore.getState().conversationsByDeckId[deckId];
  return conversation ? toConversationDTO(conversation) : null;
};

const getBackendAssistantConversation = async (deckId: string): Promise<AssistantConversationDTO | null> => {
  const response = await apiRequest<GetAssistantConversationResponse>(
    `/api/assistant/conversations/by-deck/${encodeURIComponent(deckId)}`,
  );

  return response.conversation;
};

export const getAssistantConversation = async (deckId: string): Promise<AssistantConversationDTO | null> =>
  withBackendFallback({
    backend: () => getBackendAssistantConversation(deckId),
    fallback: () => getLocalAssistantConversation(deckId),
    label: `getAssistantConversation(${deckId})`,
  });
