import type { ApiErrorDTO, AssistantMessageRoleDTO } from "./common";

export type AssistantMessageDTO = {
  id: string;
  conversationId: string;
  deckId: string;
  materialId?: string;
  role: AssistantMessageRoleDTO;
  content: string;
  createdAt: string;
  citations?: {
    sourceSection?: string;
    sourcePage?: number;
    sourceChunkId?: string;
  }[];
};

export type AssistantConversationDTO = {
  id: string;
  deckId: string;
  materialId?: string;
  messages: AssistantMessageDTO[];
  createdAt: string;
  updatedAt: string;
};

export type AssistantChatRequest = {
  deckId: string;
  message: string;
  conversationId?: string;
  idempotencyKey: string;
};

export type AssistantChatResponse = {
  conversation: AssistantConversationDTO;
  message: AssistantMessageDTO;
  error?: ApiErrorDTO;
};

export type GetAssistantConversationResponse = {
  conversation: AssistantConversationDTO | null;
  error?: ApiErrorDTO;
};
