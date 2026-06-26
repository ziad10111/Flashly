import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  deckId?: string;
  materialId?: string;
};

export type AssistantConversation = {
  id: string;
  deckId: string;
  materialId?: string;
  messages: AssistantMessage[];
  createdAt: string;
  updatedAt: string;
};

type FlashlyAssistantState = {
  activeDeckId: string | null;
  conversationsByDeckId: Record<string, AssistantConversation>;
  addMessagePair: (deckId: string, userContent: string, assistantContent: string, materialId?: string) => void;
  clearConversation: (deckId: string) => void;
  resetAssistant: () => void;
  setActiveDeckId: (deckId: string | null) => void;
};

const nowIso = () => new Date().toISOString();

const createMessage = (
  deckId: string,
  role: AssistantMessage["role"],
  content: string,
  createdAt: string,
  materialId?: string,
): AssistantMessage => ({
  id: `assistant-message-${deckId}-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  createdAt,
  deckId,
  materialId,
});

export const useFlashlyAssistantStore = create<FlashlyAssistantState>()(
  persist(
    (set) => ({
      activeDeckId: null,
      conversationsByDeckId: {},
      addMessagePair: (deckId, userContent, assistantContent, materialId) =>
        set((state) => {
          const timestamp = nowIso();
          const existing = state.conversationsByDeckId[deckId];
          const conversation: AssistantConversation =
            existing ??
            {
              id: `assistant-conversation-${deckId}`,
              deckId,
              materialId,
              messages: [],
              createdAt: timestamp,
              updatedAt: timestamp,
            };

          return {
            activeDeckId: deckId,
            conversationsByDeckId: {
              ...state.conversationsByDeckId,
              [deckId]: {
                ...conversation,
                materialId: materialId ?? conversation.materialId,
                messages: [
                  ...conversation.messages,
                  createMessage(deckId, "user", userContent, timestamp, materialId),
                  createMessage(deckId, "assistant", assistantContent, timestamp, materialId),
                ],
                updatedAt: timestamp,
              },
            },
          };
        }),
      clearConversation: (deckId) =>
        set((state) => {
          const nextConversations = { ...state.conversationsByDeckId };
          delete nextConversations[deckId];

          return {
            conversationsByDeckId: nextConversations,
          };
        }),
      resetAssistant: () =>
        set({
          activeDeckId: null,
          conversationsByDeckId: {},
        }),
      setActiveDeckId: (deckId) => set({ activeDeckId: deckId }),
    }),
    {
      name: "flashly-assistant-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
