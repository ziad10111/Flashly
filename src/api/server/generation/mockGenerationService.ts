import type { DeckDTO } from "@/api/contracts";
import { mockDeck, mockFlashcards } from "../mockData";
import type {
  FlashlyGenerationService,
  GenerateFlashcardDTOsInput,
  PrepareGenerationInput,
} from "./types";

const nowIso = () => new Date().toISOString();

const createMockDeckId = (materialId: string) => `mock-generated-deck-${materialId}`;

const createMockGeneratedDeck = (input: PrepareGenerationInput): DeckDTO => ({
  ...mockDeck,
  id: createMockDeckId(input.materialId),
  materialId: input.materialId,
  title: "Generated Mock Flashcards",
  sourceFileName: "mock-study-material.pdf",
  cardCount: input.metadata.requestedCardCount,
  status: "ready",
  updatedAt: nowIso(),
});

const generateMockFlashcardDTOs = async (input: GenerateFlashcardDTOsInput) => ({
  cards: Array.from({ length: input.metadata.requestedCardCount }, (_, index) => {
    const template = mockFlashcards[index % mockFlashcards.length];
    const position = (input.metadata.batchMode === "batch" ? input.metadata.startQuestionIndex ?? 0 : 0) + index;

    return {
      ...template,
      id: `mock-generated-card-${input.materialId}-${position + 1}`,
      deckId: input.deckId,
      difficulty: input.metadata.difficulty ?? template.difficulty,
      position,
      sourceChunkId: `mock-source-chunk-${position + 1}`,
      topic: input.metadata.topicFocus[index % input.metadata.topicFocus.length] ?? template.topic,
    };
  }),
});

export const mockGenerationService: FlashlyGenerationService = {
  generateFlashcardDTOs: generateMockFlashcardDTOs,
  mode: "mock",
  prepareGeneration: async (input) => {
    const job = mockGenerationService.prepareGenerationJob(input);
    const deck = createMockGeneratedDeck(input);
    const generated = await mockGenerationService.generateFlashcardDTOs({
      ...input,
      deckId: deck.id,
    });

    return {
      ...job,
      deckId: deck.id,
      deckStatus: deck.status,
      generatedCardCount: generated.cards.length,
      deck,
      cards: generated.cards,
    };
  },
  prepareGenerationJob: (input) => ({
    generationJobId: `mock-generation-job-${input.metadata.idempotencyKey}`,
    generationStatus: input.metadata.generationStatus,
    generationStage: input.metadata.generationStage,
    idempotencyKey: input.metadata.idempotencyKey,
    materialId: input.materialId,
    requestedCardCount: input.metadata.requestedCardCount,
    retryable: false,
  }),
  validateReadiness: () => ({ ok: true }),
};
