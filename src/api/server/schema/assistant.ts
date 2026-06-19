import type { AssistantMessageRoleDTO, JsonRecord, SchemaId, TimestampedRow, UserOwnedRow } from "./common";

export type AssistantConversationRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    deckId: SchemaId;
    materialId?: SchemaId;
    title?: string;
  };

export type AssistantMessageCitation = {
  sourceSection?: string;
  sourcePage?: number;
  sourceChunkId?: SchemaId;
};

export type AssistantMessageRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    conversationId: SchemaId;
    deckId: SchemaId;
    materialId?: SchemaId;
    role: AssistantMessageRoleDTO;
    content: string;
    citations?: AssistantMessageCitation[];
    metadata?: JsonRecord;
  };
