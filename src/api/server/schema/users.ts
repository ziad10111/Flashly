import type { SchemaId, TimestampedRow } from "./common";

export type UserRow = TimestampedRow & {
  id: SchemaId;
  clerkUserId: string;
  email?: string;
  displayName?: string;
  imageUrl?: string;
  lastSignedInAt?: string;
};
