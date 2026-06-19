import type { BackendAuthContext } from "./auth";
import { forbiddenError } from "./apiErrors";
import { FLASHLY_DATA_MODE } from "./config";
import { queryPostgres } from "./database";
import { ensureDatabaseUser } from "./repositories/database/utils";
import { jsonApiError } from "./responses";

export type OwnershipResult =
  | { ok: true }
  | { ok: false; response: Response };

type OwnedResourceTable = "decks" | "flashcards" | "materials" | "review_sessions" | "uploads";

const hasUsableResourceId = (resourceId: string) => resourceId.trim().length > 0;

const deny = (resourceName: string): OwnershipResult => ({
  ok: false,
  response: jsonApiError(forbiddenError(`You do not have access to this ${resourceName}.`)),
});

const allowMockAccess = (auth: BackendAuthContext, resourceId: string, resourceName: string): OwnershipResult => {
  if (!auth.authenticated || !auth.userId || !hasUsableResourceId(resourceId)) {
    return deny(resourceName);
  }

  return { ok: true };
};

const assertOwnedResource = async (
  auth: BackendAuthContext,
  table: OwnedResourceTable,
  resourceId: string,
  resourceName: string,
): Promise<OwnershipResult> => {
  if (FLASHLY_DATA_MODE !== "database") {
    return allowMockAccess(auth, resourceId, resourceName);
  }

  if (!auth.authenticated || !auth.userId || !hasUsableResourceId(resourceId)) {
    return deny(resourceName);
  }

  const user = await ensureDatabaseUser(auth.userId);
  const result = await queryPostgres(
    `
      SELECT 1
      FROM ${table}
      WHERE id::text = $1 AND user_id = $2
      LIMIT 1
    `,
    [resourceId, user.id],
  );

  return result.rowCount === 1 ? { ok: true } : deny(resourceName);
};

export const assertUploadOwner = (userId: string, uploadId: string): Promise<OwnershipResult> =>
  assertUploadAccess({ authenticated: true, mode: "clerk", userId }, uploadId);

export const assertMaterialOwner = (userId: string, materialId: string): Promise<OwnershipResult> =>
  assertMaterialAccess({ authenticated: true, mode: "clerk", userId }, materialId);

export const assertDeckOwner = (userId: string, deckId: string): Promise<OwnershipResult> =>
  assertDeckAccess({ authenticated: true, mode: "clerk", userId }, deckId);

export const assertFlashcardOwner = (userId: string, flashcardId: string): Promise<OwnershipResult> =>
  assertFlashcardAccess({ authenticated: true, mode: "clerk", userId }, flashcardId);

export const assertReviewSessionOwner = (userId: string, reviewSessionId: string): Promise<OwnershipResult> =>
  assertReviewSessionAccess({ authenticated: true, mode: "clerk", userId }, reviewSessionId);

export const assertDeckAccess = (auth: BackendAuthContext, deckId: string): Promise<OwnershipResult> =>
  assertOwnedResource(auth, "decks", deckId, "deck");

export const assertMaterialAccess = (auth: BackendAuthContext, materialId: string): Promise<OwnershipResult> =>
  assertOwnedResource(auth, "materials", materialId, "material");

export const assertUploadAccess = (auth: BackendAuthContext, uploadJobId: string): Promise<OwnershipResult> =>
  assertOwnedResource(auth, "uploads", uploadJobId, "upload");

export const assertFlashcardAccess = (auth: BackendAuthContext, flashcardId: string): Promise<OwnershipResult> =>
  assertOwnedResource(auth, "flashcards", flashcardId, "flashcard");

export const assertReviewSessionAccess = (
  auth: BackendAuthContext,
  reviewSessionId: string,
): Promise<OwnershipResult> => assertOwnedResource(auth, "review_sessions", reviewSessionId, "review session");

export const assertConversationAccessByDeck = (auth: BackendAuthContext, deckId: string): Promise<OwnershipResult> =>
  assertDeckAccess(auth, deckId);

export const assertDeckFlashcardsAccess = async (
  auth: BackendAuthContext,
  deckId: string,
  flashcardIds: string[],
): Promise<OwnershipResult> => {
  if (FLASHLY_DATA_MODE !== "database") {
    return allowMockAccess(auth, deckId, "flashcards");
  }

  if (!auth.authenticated || !auth.userId || !hasUsableResourceId(deckId) || flashcardIds.length === 0) {
    return deny("flashcards");
  }

  const uniqueFlashcardIds = [...new Set(flashcardIds.map((id) => id.trim()).filter(Boolean))];

  if (uniqueFlashcardIds.length !== flashcardIds.length) {
    return deny("flashcards");
  }

  const user = await ensureDatabaseUser(auth.userId);
  const result = await queryPostgres<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM flashcards
      WHERE user_id = $1 AND deck_id::text = $2 AND id::text = ANY($3::text[])
    `,
    [user.id, deckId, uniqueFlashcardIds],
  );

  return Number(result.rows[0]?.count ?? 0) === uniqueFlashcardIds.length ? { ok: true } : deny("flashcards");
};
