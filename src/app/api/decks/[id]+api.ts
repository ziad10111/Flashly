import { notFoundError } from "@/api/server/apiErrors";
import { requireBackendAuth } from "@/api/server/auth";
import { assertDeckAccess } from "@/api/server/ownership";
import { deckRepository } from "@/api/server/repositories";
import { jsonApiError, jsonRouteError, jsonSuccess } from "@/api/server/responses";

export async function GET(request: Request, { id }: { id: string }) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await assertDeckAccess(auth.context, id);

  if (!access.ok) {
    return access.response;
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
