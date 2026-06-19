import type { GenerateFlashcardsRequest } from "@/api/contracts";
import { requireBackendAuth } from "@/api/server/auth";
import { checkGenerationEntitlement } from "@/api/server/entitlements";
import { generationService } from "@/api/server/generation";
import { assertMaterialAccess } from "@/api/server/ownership";
import { materialRepository } from "@/api/server/repositories";
import { jsonApiError, jsonRouteError, jsonSuccess, readJsonBody } from "@/api/server/responses";
import { validateGenerateFlashcardsRequest } from "@/api/server/generationValidation";

export async function POST(request: Request, { id }: { id: string }) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readJsonBody<GenerateFlashcardsRequest>(request);
  const validation = validateGenerateFlashcardsRequest(id, body);

  if (!validation.ok) {
    return jsonApiError(validation.error);
  }

  const access = await assertMaterialAccess(auth.context, validation.metadata.materialId);

  if (!access.ok) {
    return access.response;
  }

  try {
    const entitlement = await checkGenerationEntitlement({
      createsDeck: validation.metadata.startQuestionIndex === undefined || validation.metadata.startQuestionIndex === 0,
      requestedCardCount: validation.metadata.requestedCardCount,
      userId: auth.context.userId,
    });

    if (!entitlement.ok) {
      return jsonApiError(entitlement.error);
    }

    await materialRepository.createGenerationJob(
      {
        materialId: validation.metadata.materialId,
        metadata: validation.metadata,
      },
      auth.context,
    );

    const generation = await generationService.prepareGeneration({
        extractedTextPreview: body?.extractedTextPreview,
        materialId: validation.metadata.materialId,
        metadata: validation.metadata,
      });

    return jsonSuccess(
      await materialRepository.persistGenerationResult(
        {
          generation,
          materialId: validation.metadata.materialId,
          metadata: validation.metadata,
        },
        auth.context,
      ),
      {
        status: 201,
      },
    );
  } catch (error) {
    await Promise.resolve(
      materialRepository.markGenerationFailed(
        {
          error,
          materialId: validation.metadata.materialId,
          metadata: validation.metadata,
        },
        auth.context,
      ),
    ).catch(() => undefined);

    return jsonRouteError(error);
  }
}
