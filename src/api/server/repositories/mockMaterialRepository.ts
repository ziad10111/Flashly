import type { ServerMaterialRepository } from "./types";

// Server-side mock material data access. Extraction/OCR lifecycle work lives in the extraction service boundary.
// Flashcard generation lifecycle work lives in the generation service boundary.
export const mockMaterialRepository: ServerMaterialRepository = {
  createGenerationJob: async () => null,
  getMaterialById: async () => null,
  markGenerationFailed: async () => undefined,
  persistExtractionResult: async ({ extraction }) => extraction,
  persistGenerationResult: async ({ generation }) => generation,
};
