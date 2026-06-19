import { requireBackendAuth } from "@/api/server/auth";
import { assertConversationAccessByDeck } from "@/api/server/ownership";
import { assistantRepository } from "@/api/server/repositories";
import { jsonRouteError, jsonSuccess } from "@/api/server/responses";

export async function GET(request: Request, { deckId }: { deckId: string }) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await assertConversationAccessByDeck(auth.context, deckId);

  if (!access.ok) {
    return access.response;
  }

  try {
    return jsonSuccess(await assistantRepository.getConversationByDeck(deckId, { userId: auth.context.userId }));
  } catch (error) {
    return jsonRouteError(error);
  }
}
