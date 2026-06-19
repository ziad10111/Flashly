import type { AssistantChatRequest } from "@/api/contracts";
import { validationError } from "@/api/server/apiErrors";
import { requireBackendAuth } from "@/api/server/auth";
import { assertConversationAccessByDeck } from "@/api/server/ownership";
import { assistantRepository } from "@/api/server/repositories";
import { jsonApiError, jsonRouteError, jsonSuccess, readJsonBody } from "@/api/server/responses";

export async function POST(request: Request) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readJsonBody<AssistantChatRequest>(request);

  if (!body?.deckId || !body.message || !body.idempotencyKey) {
    return jsonApiError(validationError("deckId, message, and idempotencyKey are required."));
  }

  const access = await assertConversationAccessByDeck(auth.context, body.deckId);

  if (!access.ok) {
    return access.response;
  }

  try {
    return jsonSuccess(await assistantRepository.sendMessage(body, { userId: auth.context.userId }));
  } catch (error) {
    return jsonRouteError(error);
  }
}
