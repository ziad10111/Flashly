import { FLASHLY_EXTRACTION_MODE } from "../config";
import { externalExtractionService } from "./externalExtractionService";
import { mockExtractionService } from "./mockExtractionService";

export type {
  DetermineOcrInput,
  ExtractTextPreviewInput,
  ExtractionOcrRequirement,
  ExtractionReadinessResult,
  ExtractionSourceChunkHandoff,
  ExtractionSourceReference,
  ExtractionTextReference,
  FlashlyExtractionService,
  PreparedExtractionLifecycle,
  PrepareExtractionInput,
} from "./types";
export { externalExtractionService } from "./externalExtractionService";
export { mockExtractionService } from "./mockExtractionService";
export {
  ExtractionServiceFailureError,
  ExtractionServiceNotConfiguredError,
  isExtractionServiceFailureError,
  isExtractionServiceNotConfiguredError,
} from "./types";

export const extractionService =
  FLASHLY_EXTRACTION_MODE === "external" ? externalExtractionService : mockExtractionService;
