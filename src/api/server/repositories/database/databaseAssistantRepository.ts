import type { ServerAssistantRepository } from "../types";
import { throwDatabaseRepositoryNotConfigured } from "./notConfigured";

export const databaseAssistantRepository: ServerAssistantRepository = {
  getConversationByDeck: () => throwDatabaseRepositoryNotConfigured("assistant.getConversationByDeck"),
  sendMessage: () => throwDatabaseRepositoryNotConfigured("assistant.sendMessage"),
};
