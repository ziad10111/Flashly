import type { CreateReviewSessionRequest } from "@/api/contracts";
import { requireBackendAuth } from "@/api/server/auth";
import { assertDeckAccess, assertDeckFlashcardsAccess } from "@/api/server/ownership";
import { reviewRepository } from "@/api/server/repositories";
import { jsonApiError, jsonRouteError, jsonSuccess, readJsonBody } from "@/api/server/responses";
import { validateCreateReviewSessionRequest } from "@/api/server/reviewValidation";

export async function POST(request: Request) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readJsonBody<CreateReviewSessionRequest>(request);
  const validation = validateCreateReviewSessionRequest(body);

  if (!validation.ok) {
    return jsonApiError(validation.error);
  }

  const access = await assertDeckAccess(auth.context, validation.metadata.deckId);

  if (!access.ok) {
    return access.response;
  }

  const cardAccess = await assertDeckFlashcardsAccess(
    auth.context,
    validation.metadata.deckId,
    validation.metadata.reviews.map((review) => review.cardId),
  );

  if (!cardAccess.ok) {
    return cardAccess.response;
  }

  try {
    return jsonSuccess(
      await reviewRepository.createReviewSession(validation.metadata, { userId: auth.context.userId }),
      { status: 201 },
    );
  } catch (error) {
    return jsonRouteError(error);
  }
}
