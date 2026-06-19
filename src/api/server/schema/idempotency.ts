import type { IdempotencyKey, JsonRecord, SchemaId, TimestampedRow, UserOwnedRow } from "./common";

export type IdempotencyScope = "upload-create" | "flashcard-generation" | "review-session-create";

export type IdempotencyRecordRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    scope: IdempotencyScope;
    idempotencyKey: IdempotencyKey;
    resourceId?: SchemaId;
    requestHash?: string;
    responseSnapshot?: JsonRecord;
    expiresAt?: string;
  };
