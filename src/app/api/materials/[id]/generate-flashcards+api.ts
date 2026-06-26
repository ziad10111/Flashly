import type { GenerateFlashcardsRequest } from "@/api/contracts";
import { requireBackendAuth } from "@/api/server/auth";
import { checkGenerationEntitlement } from "@/api/server/entitlements";
import { generationService } from "@/api/server/generation";
import { assertMaterialAccess } from "@/api/server/ownership";
import { materialRepository } from "@/api/server/repositories";
import { jsonApiError, jsonRouteError, jsonSuccess, readJsonBody } from "@/api/server/responses";
import { createServerTimingLogger } from "@/api/server/timing";
import { validateGenerateFlashcardsRequest } from "@/api/server/generationValidation";

export async function POST(request: Request, { id }: { id: string }) {
  const logStage = createServerTimingLogger("generate-flashcards");
  const auth = await requireBackendAuth(request);
  logStage("auth");

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readJsonBody<GenerateFlashcardsRequest>(request);
  logStage("read-body");
  const validation = validateGenerateFlashcardsRequest(id, body);
  logStage("validate", {
    batchMode: validation.ok ? validation.metadata.batchMode : undefined,
    generationMode: validation.ok ? validation.metadata.generationMode : undefined,
    requestedCardCount: validation.ok ? validation.metadata.requestedCardCount : undefined,
  });

  if (!validation.ok) {
    return jsonApiError(validation.error);
  }

  const access = await assertMaterialAccess(auth.context, validation.metadata.materialId);
  logStage("ownership");

  if (!access.ok) {
    return access.response;
  }

  try {
    const persistedMaterial = await materialRepository.getMaterialById(
      validation.metadata.materialId,
      auth.context,
    );
    logStage("load-material", {
      hasPersistedExtractedText: Boolean(persistedMaterial?.extractedTextPreview),
      persistedTextLength: persistedMaterial?.extractedTextPreview?.length ?? 0,
    });

    const entitlement = await checkGenerationEntitlement({
      createsDeck: validation.metadata.startQuestionIndex === undefined || validation.metadata.startQuestionIndex === 0,
      requestedCardCount: validation.metadata.requestedCardCount,
      userId: auth.context.userId,
    });
    logStage("entitlement");

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
    logStage("create-job");

    const generation = await generationService.prepareGeneration({
      extractedTextPreview: body?.extractedTextPreview ?? persistedMaterial?.extractedTextPreview,
      materialId: validation.metadata.materialId,
      metadata: validation.metadata,
    });
    logStage("generate", {
      generatedCardCount: generation.cards.length,
      hasMore: generation.hasMore ?? false,
    });

    const persistedGeneration = await materialRepository.persistGenerationResult(
      {
        generation,
        materialId: validation.metadata.materialId,
        metadata: validation.metadata,
      },
      auth.context,
    );
    logStage("persist", {
      persistedCardCount: persistedGeneration.cards.length,
    });

    return jsonSuccess(
      persistedGeneration,
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
    logStage("error");

    return jsonRouteError(error);
  }
}
