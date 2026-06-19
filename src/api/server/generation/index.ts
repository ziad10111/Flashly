import { FLASHLY_GENERATION_MODE } from "../config";
import { externalGenerationService } from "./externalGenerationService";
import { mockGenerationService } from "./mockGenerationService";

export type {
  FlashlyGenerationService,
  GeneratedFlashcardDTOs,
  GenerateFlashcardDTOsInput,
  GenerationReadinessResult,
  GenerationSourceChunkReference,
  GenerationTextReference,
  PreparedGenerationJob,
  PreparedGenerationLifecycle,
  PrepareGenerationInput,
} from "./types";
export {
  GenerationServiceNotConfiguredError,
  GenerationServiceFailureError,
  isGenerationServiceFailureError,
  isGenerationServiceNotConfiguredError,
} from "./types";
export { externalGenerationService } from "./externalGenerationService";
export { mockGenerationService } from "./mockGenerationService";

export const generationService =
  FLASHLY_GENERATION_MODE === "external" ? externalGenerationService : mockGenerationService;
