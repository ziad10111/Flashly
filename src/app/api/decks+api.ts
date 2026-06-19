import { requireBackendAuth } from "@/api/server/auth";
import { deckRepository } from "@/api/server/repositories";
import { jsonRouteError, jsonSuccess } from "@/api/server/responses";

export async function GET(request: Request) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(await deckRepository.getDecks({ userId: auth.context.userId }));
  } catch (error) {
    return jsonRouteError(error);
  }
}
