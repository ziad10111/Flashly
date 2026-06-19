import type { ExtractMaterialRequest } from "@/api/contracts";
import { requireBackendAuth } from "@/api/server/auth";
import { checkExtractionEntitlement } from "@/api/server/entitlements";
import { extractionService } from "@/api/server/extraction";
import { assertMaterialAccess } from "@/api/server/ownership";
import { materialRepository } from "@/api/server/repositories";
import { jsonApiError, jsonRouteError, jsonSuccess, readJsonBody } from "@/api/server/responses";
import { validateExtractMaterialRequest } from "@/api/server/extractionValidation";

export async function POST(request: Request, { id }: { id: string }) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readJsonBody<ExtractMaterialRequest>(request);
  const validation = validateExtractMaterialRequest(id, body);

  if (!validation.ok) {
    return jsonApiError(validation.error);
  }

  const access = await assertMaterialAccess(auth.context, validation.metadata.materialId);

  if (!access.ok) {
    return access.response;
  }

  try {
    const persistedMaterial = await materialRepository.getMaterialById(
      validation.metadata.materialId,
      auth.context,
    );
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

    if (!entitlement.ok) {
      return jsonApiError(entitlement.error);
    }

    const extraction = await extractionService.prepareExtractionJob({
        forceOcr: body?.forceOcr,
        materialId: validation.metadata.materialId,
        metadata: extractionMetadata,
        sourceRef: extractionMetadata.storageKey ? { storageKey: extractionMetadata.storageKey } : undefined,
      });

    return jsonSuccess(
      await materialRepository.persistExtractionResult(
        {
          extraction,
          metadata: extractionMetadata,
        },
        auth.context,
      ),
    );
  } catch (error) {
    return jsonRouteError(error);
  }
}
