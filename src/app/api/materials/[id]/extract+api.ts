import type { ExtractMaterialRequest } from "@/api/contracts";
import { requireBackendAuth } from "@/api/server/auth";
import { checkExtractionEntitlement } from "@/api/server/entitlements";
import { extractionService } from "@/api/server/extraction";
import { assertMaterialAccess } from "@/api/server/ownership";
import { materialRepository } from "@/api/server/repositories";
import { jsonApiError, jsonRouteError, jsonSuccess, readJsonBody } from "@/api/server/responses";
import { createServerTimingLogger } from "@/api/server/timing";
import { validateExtractMaterialRequest } from "@/api/server/extractionValidation";

export async function POST(request: Request, { id }: { id: string }) {
  const logStage = createServerTimingLogger("extract-material");
  const auth = await requireBackendAuth(request);
  logStage("auth");

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readJsonBody<ExtractMaterialRequest>(request);
  logStage("read-body");
  const validation = validateExtractMaterialRequest(id, body);
  logStage("validate", {
    hasSourceBase64: Boolean(validation.ok && validation.metadata.sourceBase64),
    hasSourceText: Boolean(validation.ok && validation.metadata.sourceText),
    hasSourceUploadId: Boolean(validation.ok && validation.metadata.sourceUploadId),
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
    logStage("load-material");
    const extractionMetadata = {
      ...validation.metadata,
      fileName: validation.metadata.fileName ?? persistedMaterial?.fileName,
      fileSize: validation.metadata.fileSize ?? persistedMaterial?.fileSize,
      mimeType: validation.metadata.mimeType ?? persistedMaterial?.mimeType,
      storageKey: validation.metadata.storageKey ?? persistedMaterial?.storageKey,
      userId: auth.context.userId,
    };
    const entitlement = await checkExtractionEntitlement({
      fileSize: extractionMetadata.fileSize,
      userId: auth.context.userId,
    });
    logStage("entitlement");

    if (!entitlement.ok) {
      return jsonApiError(entitlement.error);
    }

    const extraction = await extractionService.prepareExtractionJob({
        forceOcr: body?.forceOcr,
        materialId: validation.metadata.materialId,
        metadata: extractionMetadata,
        sourceRef: extractionMetadata.storageKey ? { storageKey: extractionMetadata.storageKey } : undefined,
      });
    logStage("extract", {
      ocrRequired: extraction.ocrRequired,
      textLength: extraction.textLength,
    });

    const persistedExtraction = await materialRepository.persistExtractionResult(
      {
        extraction,
        metadata: extractionMetadata,
      },
      auth.context,
    );
    logStage("persist");

    return jsonSuccess(persistedExtraction);
  } catch (error) {
    logStage("error");
    return jsonRouteError(error);
  }
}
