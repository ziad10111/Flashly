import { createApiError, notFoundError } from "@/api/server/apiErrors";
import { requireBackendAuth } from "@/api/server/auth";
import { deckRepository } from "@/api/server/repositories";
import { jsonApiError, jsonRouteError, jsonSuccess } from "@/api/server/responses";

export async function GET(request: Request, { id }: { id: string }) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const response = await deckRepository.getDeckById(id, { userId: auth.context.userId });

    if (!response) {
      return jsonApiError(notFoundError("Deck was not found."));
    }

    return jsonSuccess(response);
  } catch (error) {
    return jsonRouteError(error);
  }
}

export async function DELETE(request: Request, { id }: { id: string }) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const existingDeck = await deckRepository.getDeckById(id, { userId: auth.context.userId });

    if (!existingDeck) {
      return jsonApiError(notFoundError("Deck was not found."));
    }

    await deckRepository.deleteDeck(id, { userId: auth.context.userId });
    const deletedDeck = await deckRepository.getDeckById(id, { userId: auth.context.userId });

    if (deletedDeck) {
      return jsonApiError(createApiError("internal", "Deck deletion did not complete. Please try again."));
    }

    return jsonSuccess({ ok: true });
  } catch (error) {
    return jsonRouteError(error);
  }
}
