import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { images } from "@/constants/images";
import type { GenerateFlashcardsResponse, DeckDTO, FlashcardDTO } from "@/api/contracts";
import { shouldApplyGeneratedDeckMutation } from "@/api/repositories/deckDeletion";
import { isTemplateGeneratedCard } from "@/lib/generated-card-guards";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";
import type { DeckMaterial, DeckMaterialSourceType, DeckMaterialStatus } from "@/types/deck-material";
import type { Flashcard } from "@/types/learning";
import type { SelectedUploadFile } from "@/types/study";

export type UploadProcessingStage =
  | "idle"
  | "uploading"
  | "assembling"
  | "extracting"
  | "ocr"
  | "ocr-skipped"
  | "generating"
  | "creating"
  | "ready";

export type UploadStatus = "idle" | "selected" | "processing" | "ready" | "failed";

export type GeneratedFlashlyDeck = DeckMaterial & {
  backgroundBatchSize?: number;
  cardSetTitles: string[];
  createdAt: string;
  expectedCardCount?: number;
  failedBatchCount?: number;
  generationSourceText?: string;
  generationJobId?: string;
  generationLastError?: string;
  maxGeneratedCards?: number;
  nextBatchStartIndex?: number;
  generationStatus?: "generating" | "complete" | "partial-error";
  idempotencyKey?: string;
  materialId: string;
};

type FlashlyUploadState = {
  currentStage: UploadProcessingStage;
  errorMessage: string | null;
  generatedCardsByDeckId: Record<string, Flashcard[]>;
  generatedDeckId: string | null;
  generatedDecks: GeneratedFlashlyDeck[];
  idempotencyKey: string | null;
  materialId: string | null;
  ocrRequired: boolean;
  progressPercentage: number;
  selectedFile: SelectedUploadFile | null;
  status: UploadStatus;
  uploadJobId: string | null;
  appendGeneratedCardsToDeck: (
    response: GenerateFlashcardsResponse,
    options?: { nextBatchStartIndex?: number },
  ) => { appendedCount: number; deckId: string };
  completeMockGeneration: () => string | null;
  createPartialGeneratedDeck: (
    response: GenerateFlashcardsResponse,
    options?: {
      backgroundBatchSize?: number;
      generationSourceText?: string;
      maxGeneratedCards?: number;
      nextBatchStartIndex?: number;
    },
  ) => string;
  failMockGeneration: (message: string) => void;
  markGeneratedDeckComplete: (deckId: string) => void;
  markGeneratedDeckPartialError: (deckId: string, message: string) => void;
  markGeneratedDeckGenerating: (deckId: string) => void;
  persistGeneratedDeckResponse: (response: GenerateFlashcardsResponse) => string;
  removeGeneratedDeck: (deckId: string) => void;
  resetAllUploadState: () => void;
  resetUpload: () => void;
  selectFile: (file: SelectedUploadFile, ocrRequired: boolean) => void;
  setOcrRequired: (ocrRequired: boolean) => void;
  setProcessingStage: (stage: UploadProcessingStage, progressPercentage: number) => void;
  startMockProcessing: () => void;
};

export class GeneratedDeckPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratedDeckPersistenceError";
  }
}

const getFileBaseName = (fileName: string) => fileName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim();

const titleCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 42);

const hashString = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
};

const getMockUploadIdempotencyKey = (file: SelectedUploadFile) =>
  `mock-upload-${slugify(file.name) || "file"}-${hashString(`${file.name}:${file.size ?? 0}:${file.mimeType ?? ""}`)}`;

const getFileExtension = (fileName: string) => fileName.split(".").pop()?.toLowerCase() ?? "";

const getSourceType = (file: SelectedUploadFile): DeckMaterialSourceType => {
  const extension = getFileExtension(file.name);
  const mimeType = file.mimeType ?? "";

  if (mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "heic"].includes(extension)) {
    return "image";
  }

  if (extension === "pdf" || mimeType === "application/pdf") {
    return "pdf";
  }

  if (["txt", "md"].includes(extension) || mimeType.startsWith("text/")) {
    return "text-document";
  }

  return "uploaded-material";
};

const getSourceLabel = (file: SelectedUploadFile, ocrRequired: boolean) => {
  const sourceType = getSourceType(file);

  if (ocrRequired) {
    return "Scanned upload";
  }

  if (sourceType === "pdf") {
    return "Uploaded PDF";
  }

  if (sourceType === "image") {
    return "Uploaded image";
  }

  if (sourceType === "text-document") {
    return "Text upload";
  }

  return "Uploaded material";
};

const createGeneratedCards = (deckId: string, title: string): Flashcard[] => [
  {
    id: `${deckId}-card-1`,
    deckId,
    question: "What is the main idea of this section?",
    answer: `The main idea is the central concept from ${title}.`,
    explanation: "This mock card stands in for an AI-generated summary question from the uploaded material.",
    difficulty: "easy",
    topic: "Key ideas",
    sourceSection: "Overview",
  },
  {
    id: `${deckId}-card-2`,
    deckId,
    question: "Define the key term mentioned in the uploaded material.",
    answer: "A key term is the important concept the material expects you to remember.",
    explanation: "Real AI generation will replace this template with a term grounded in extracted text.",
    difficulty: "medium",
    topic: "Definitions",
    sourceSection: "Important Terms",
  },
  {
    id: `${deckId}-card-3`,
    deckId,
    question: "What are the most important points from this topic?",
    answer: "The most important points are the facts, definitions, and relationships needed for review.",
    explanation: "Flashly will later use extracted text to rank the highest-value review points.",
    difficulty: "medium",
    topic: "Review points",
    sourceSection: "Study Notes",
  },
  {
    id: `${deckId}-card-4`,
    deckId,
    question: "How would you summarize this concept in one sentence?",
    answer: "Summarize it by naming the concept, what it does, and why it matters.",
    explanation: "This encourages active recall instead of rereading the uploaded file passively.",
    difficulty: "medium",
    topic: "Concept summary",
    sourceSection: "Summary",
  },
  {
    id: `${deckId}-card-5`,
    deckId,
    question: "What example helps explain this idea?",
    answer: "Use a concrete example from the material to connect the idea to a real situation.",
    explanation: "Examples make abstract study material easier to remember during review.",
    difficulty: "hard",
    topic: "Examples",
    sourceSection: "Applications",
  },
];

const dtoSourceTypeToDeckSourceType = (sourceType: DeckDTO["sourceType"]): DeckMaterialSourceType => {
  if (sourceType === "pdf" || sourceType === "image") {
    return sourceType;
  }

  if (sourceType === "text") {
    return "text-document";
  }

  return "uploaded-material";
};

const dtoStatusToDeckStatus = (status: DeckDTO["status"]): DeckMaterialStatus => {
  if (status === "needs-review") {
    return "weak-cards";
  }

  return status;
};

const getGeneratedSourceLabel = (deck: DeckDTO) => {
  if (deck.sourceType === "pdf") {
    return "Uploaded PDF";
  }

  if (deck.sourceType === "image") {
    return "Uploaded image";
  }

  if (deck.sourceType === "text") {
    return "Text upload";
  }

  return "Uploaded material";
};

const dtoCardToFlashcard = (card: FlashcardDTO): Flashcard => ({
  id: card.id,
  deckId: card.deckId,
  type: card.type ?? "qa",
  question: card.question,
  answer: card.answer,
  explanation: card.explanation,
  difficulty: card.difficulty,
  topic: card.topic ?? card.sourceSection ?? "Generated flashcards",
  choices: card.choices,
  correctChoiceId: card.correctChoiceId,
  sourcePage: card.sourcePage,
  sourceSection: card.sourceSection,
});

const hasValidChoices = (card: Flashcard) => {
  if (card.type !== "mcq") {
    return true;
  }

  const choices = card.choices ?? [];
  const choiceIds = new Set<string>();
  const choiceTexts = new Set<string>();

  if (choices.length < 2 || !card.correctChoiceId) {
    return false;
  }

  for (const choice of choices) {
    const id = choice.id.trim();
    const text = choice.text.trim().toLowerCase();

    if (!id || !text || choiceIds.has(id) || choiceTexts.has(text)) {
      return false;
    }

    choiceIds.add(id);
    choiceTexts.add(text);
  }

  return choiceIds.has(card.correctChoiceId);
};

const isUsableGeneratedCard = (card: Flashcard) =>
  Boolean(card.id && card.deckId && card.question.trim() && card.answer.trim() && hasValidChoices(card));

const isDeletedGeneratedDeck = (deckId: string) =>
  !shouldApplyGeneratedDeckMutation({
    deckId,
    deletedDeckIds: useFlashlyProgressStore.getState().deletedDeckIds,
  });

const getCardSetTitles = (cards: Flashcard[]) => {
  const titles = Array.from(new Set(cards.map((card) => card.sourceSection ?? card.topic).filter(Boolean)));
  return titles.length > 0 ? titles.slice(0, 6) : ["Generated flashcards"];
};

const normalizeQuestion = (question: string) => question.toLowerCase().replace(/\s+/g, " ").trim();

const getValidCardsFromResponse = (response: GenerateFlashcardsResponse) => {
  const deckId = response.deckId || response.deck.id;
  const mappedCards = response.cards.map(dtoCardToFlashcard);

  if (mappedCards.some(isTemplateGeneratedCard)) {
    throw new GeneratedDeckPersistenceError("Flashly generated template cards instead of AI cards. Please try again with readable study text.");
  }

  return mappedCards.filter((card) => card.deckId === deckId && isUsableGeneratedCard(card));
};

const mergeGeneratedCards = (currentCards: Flashcard[], incomingCards: Flashcard[]) => {
  const seenQuestions = new Set(currentCards.map((card) => normalizeQuestion(card.question)));
  const appendedCards: Flashcard[] = [];

  for (const card of incomingCards) {
    const normalizedQuestion = normalizeQuestion(card.question);

    if (!normalizedQuestion || seenQuestions.has(normalizedQuestion)) {
      continue;
    }

    seenQuestions.add(normalizedQuestion);
    appendedCards.push(card);
  }

  return {
    appendedCards,
    cards: [...currentCards, ...appendedCards],
  };
};

const deckFromGenerationResponse = (
  response: GenerateFlashcardsResponse,
  cards: Flashcard[],
  status: GeneratedFlashlyDeck["generationStatus"],
): GeneratedFlashlyDeck => {
  const deckDto = response.deck;

  return {
    id: deckDto.id,
    title: deckDto.title,
    sourceType: dtoSourceTypeToDeckSourceType(deckDto.sourceType),
    sourceLabel: getGeneratedSourceLabel(deckDto),
    fileName: deckDto.sourceFileName,
    cardCount: cards.length,
    reviewedCount: 0,
    progress: 0,
    status: status === "complete" ? dtoStatusToDeckStatus(deckDto.status) : status ?? "generating",
    weakCardCount: 0,
    xpEarned: 0,
    lastReviewedDate: null,
    extractionStatus: "generated",
    thumbnail: images.studyMaterialIllustration,
    accentColor: "#6C4EF5",
    tintColor: "#F3EFFF",
    cardSetTitles: getCardSetTitles(cards),
    createdAt: deckDto.createdAt,
    expectedCardCount: response.expectedTotalCards,
    generationJobId: response.generationJobId,
    generationStatus: status,
    idempotencyKey: response.idempotencyKey,
    materialId: response.materialId,
  };
};

export const useFlashlyUploadStore = create<FlashlyUploadState>()(
  persist(
    (set, get) => ({
      currentStage: "idle",
      errorMessage: null,
      generatedCardsByDeckId: {},
      generatedDeckId: null,
      generatedDecks: [],
      idempotencyKey: null,
      materialId: null,
      ocrRequired: false,
      progressPercentage: 0,
      selectedFile: null,
      status: "idle",
      uploadJobId: null,
      completeMockGeneration: () => {
        const state = get();
        const file = state.selectedFile;

        if (!file || !state.generatedDeckId || !state.materialId) {
          return null;
        }

        const title = titleCase(getFileBaseName(file.name)) || "Uploaded Study Material";
        const cards = createGeneratedCards(state.generatedDeckId, title);
        const now = new Date().toISOString();
        const deck: GeneratedFlashlyDeck = {
          id: state.generatedDeckId,
          title,
          sourceType: getSourceType(file),
          sourceLabel: getSourceLabel(file, state.ocrRequired),
          fileName: file.name,
          cardCount: cards.length,
          reviewedCount: 0,
          progress: 0,
          status: "ready",
          weakCardCount: 0,
          xpEarned: 0,
          lastReviewedDate: null,
          extractionStatus: "generated",
          thumbnail: images.studyMaterialIllustration,
          accentColor: "#6C4EF5",
          tintColor: "#F3EFFF",
          cardSetTitles: ["Key ideas", "Definitions", "Review points", "Examples"],
          createdAt: now,
          materialId: state.materialId,
        };

        set((current) => ({
          currentStage: "ready",
          errorMessage: null,
          generatedCardsByDeckId: {
            ...current.generatedCardsByDeckId,
            [deck.id]: cards,
          },
          generatedDecks: [deck, ...current.generatedDecks.filter((item) => item.id !== deck.id)],
          progressPercentage: 100,
          status: "ready",
        }));

        return deck.id;
      },
      failMockGeneration: (message) =>
        set({
          currentStage: "idle",
          errorMessage: message,
          progressPercentage: 0,
          status: "failed",
        }),
      createPartialGeneratedDeck: (response, options) => {
        const deckDto = response.deck;
        const deckId = response.deckId || deckDto.id;

        if (!deckId || deckDto.id !== deckId) {
          throw new GeneratedDeckPersistenceError("Flashly could not save this generated deck because its deck id was invalid.");
        }

        if (isDeletedGeneratedDeck(deckId)) {
          throw new GeneratedDeckPersistenceError("Flashly ignored a generated deck because it was already deleted.");
        }

        const cards = getValidCardsFromResponse(response);

        if (cards.length === 0) {
          throw new GeneratedDeckPersistenceError("Flashly generated a first batch, but it did not include any usable flashcards.");
        }

        const deck = deckFromGenerationResponse(response, cards, "generating");
        deck.backgroundBatchSize = options?.backgroundBatchSize;
        deck.generationSourceText = options?.generationSourceText;
        deck.maxGeneratedCards = options?.maxGeneratedCards;
        deck.nextBatchStartIndex = options?.nextBatchStartIndex;

        set((current) => ({
          currentStage: "ready",
          errorMessage: null,
          generatedCardsByDeckId: {
            ...current.generatedCardsByDeckId,
            [deck.id]: cards,
          },
          generatedDeckId: deck.id,
          generatedDecks: [deck, ...current.generatedDecks.filter((item) => item.id !== deck.id)],
          idempotencyKey: response.idempotencyKey,
          materialId: response.materialId,
          progressPercentage: 100,
          status: "ready",
        }));

        return deck.id;
      },
      appendGeneratedCardsToDeck: (response, options) => {
        const deckId = response.deckId || response.deck.id;

        if (!deckId) {
          throw new GeneratedDeckPersistenceError("Flashly could not append generated cards because the deck id was missing.");
        }

        if (isDeletedGeneratedDeck(deckId)) {
          return { appendedCount: 0, deckId };
        }

        const incomingCards = getValidCardsFromResponse(response);
        let appendedCount = 0;

        set((current) => {
          const existingDeck = current.generatedDecks.find((deck) => deck.id === deckId);

          if (!existingDeck) {
            if (isDeletedGeneratedDeck(deckId)) {
              return current;
            }

            throw new GeneratedDeckPersistenceError("Flashly could not append generated cards because the partial deck was not found.");
          }

          const existingCards = current.generatedCardsByDeckId[deckId] ?? [];
          const merged = mergeGeneratedCards(existingCards, incomingCards);
          appendedCount = merged.appendedCards.length;

          const updatedDeck: GeneratedFlashlyDeck = {
            ...existingDeck,
            cardCount: merged.cards.length,
            cardSetTitles: getCardSetTitles(merged.cards),
            expectedCardCount: response.expectedTotalCards ?? existingDeck.expectedCardCount,
            generationJobId: response.generationJobId ?? existingDeck.generationJobId,
            generationStatus:
              existingDeck.generationStatus === "partial-error" ? "partial-error" : existingDeck.generationStatus ?? "generating",
            idempotencyKey: response.idempotencyKey ?? existingDeck.idempotencyKey,
            materialId: response.materialId,
            nextBatchStartIndex: options?.nextBatchStartIndex ?? existingDeck.nextBatchStartIndex,
            status: existingDeck.status === "partial-error" ? "partial-error" : "generating",
          };

          return {
            generatedCardsByDeckId: {
              ...current.generatedCardsByDeckId,
              [deckId]: merged.cards,
            },
            generatedDecks: [updatedDeck, ...current.generatedDecks.filter((deck) => deck.id !== deckId)],
          };
        });

        return { appendedCount, deckId };
      },
      markGeneratedDeckComplete: (deckId) => {
        if (isDeletedGeneratedDeck(deckId)) {
          return;
        }

        set((current) => ({
          generatedDecks: current.generatedDecks.map((deck) =>
            deck.id === deckId
              ? {
                  ...deck,
                  cardCount: current.generatedCardsByDeckId[deckId]?.length ?? deck.cardCount,
                  generationLastError: undefined,
                  generationStatus: "complete",
                  status: "ready",
                }
              : deck,
          ),
        }));
      },
      markGeneratedDeckPartialError: (deckId, message) => {
        if (isDeletedGeneratedDeck(deckId)) {
          return;
        }

        set((current) => ({
          generatedDecks: current.generatedDecks.map((deck) =>
            deck.id === deckId
              ? {
                  ...deck,
                  cardCount: current.generatedCardsByDeckId[deckId]?.length ?? deck.cardCount,
                  failedBatchCount: (deck.failedBatchCount ?? 0) + 1,
                  generationLastError: message,
                  generationStatus: "partial-error",
                  status: "partial-error",
                }
              : deck,
          ),
        }));
      },
      markGeneratedDeckGenerating: (deckId) => {
        if (isDeletedGeneratedDeck(deckId)) {
          return;
        }

        set((current) => ({
          generatedDecks: current.generatedDecks.map((deck) =>
            deck.id === deckId
              ? {
                  ...deck,
                  generationLastError: undefined,
                  generationStatus: "generating",
                  status: "generating",
                }
              : deck,
          ),
        }));
      },
      persistGeneratedDeckResponse: (response) => {
        const deckDto = response.deck;
        const deckId = response.deckId || deckDto.id;

        if (!deckId || deckDto.id !== deckId) {
          throw new GeneratedDeckPersistenceError("Flashly could not save this generated deck because its deck id was invalid.");
        }

        if (isDeletedGeneratedDeck(deckId)) {
          throw new GeneratedDeckPersistenceError("Flashly ignored a generated deck because it was already deleted.");
        }

        const cards = getValidCardsFromResponse(response);

        if (cards.length === 0) {
          throw new GeneratedDeckPersistenceError("Flashly generated a deck, but it did not include any usable flashcards.");
        }

        const deck = deckFromGenerationResponse(response, cards, "complete");

        set((current) => ({
          currentStage: "ready",
          errorMessage: null,
          generatedCardsByDeckId: {
            ...current.generatedCardsByDeckId,
            [deck.id]: cards,
          },
          generatedDeckId: deck.id,
          generatedDecks: [deck, ...current.generatedDecks.filter((item) => item.id !== deck.id)],
          idempotencyKey: response.idempotencyKey,
          materialId: response.materialId,
          progressPercentage: 100,
          status: "ready",
        }));

        return deck.id;
      },
      removeGeneratedDeck: (deckId) =>
        set((current) => {
          const removedDeck = current.generatedDecks.find((deck) => deck.id === deckId);
          const clearsCurrentGeneration =
            current.generatedDeckId === deckId || Boolean(removedDeck?.materialId && current.materialId === removedDeck.materialId);
          const nextGeneratedCardsByDeckId = { ...current.generatedCardsByDeckId };
          delete nextGeneratedCardsByDeckId[deckId];

          return {
            currentStage: clearsCurrentGeneration ? "idle" : current.currentStage,
            errorMessage: clearsCurrentGeneration ? null : current.errorMessage,
            generatedCardsByDeckId: nextGeneratedCardsByDeckId,
            generatedDeckId: clearsCurrentGeneration ? null : current.generatedDeckId,
            generatedDecks: current.generatedDecks.filter((deck) => deck.id !== deckId),
            idempotencyKey:
              clearsCurrentGeneration && current.idempotencyKey === removedDeck?.idempotencyKey
                ? null
                : current.idempotencyKey,
            materialId: clearsCurrentGeneration ? null : current.materialId,
            progressPercentage: clearsCurrentGeneration ? 0 : current.progressPercentage,
            status: clearsCurrentGeneration && current.status === "ready" ? "idle" : current.status,
            uploadJobId: clearsCurrentGeneration ? null : current.uploadJobId,
          };
        }),
      resetAllUploadState: () =>
        set({
          currentStage: "idle",
          errorMessage: null,
          generatedCardsByDeckId: {},
          generatedDeckId: null,
          generatedDecks: [],
          idempotencyKey: null,
          materialId: null,
          ocrRequired: false,
          progressPercentage: 0,
          selectedFile: null,
          status: "idle",
          uploadJobId: null,
        }),
      resetUpload: () =>
        set({
          currentStage: "idle",
          errorMessage: null,
          generatedDeckId: null,
          idempotencyKey: null,
          materialId: null,
          ocrRequired: false,
          progressPercentage: 0,
          selectedFile: null,
          status: "idle",
          uploadJobId: null,
        }),
      selectFile: (file, ocrRequired) =>
        set({
          currentStage: "idle",
          errorMessage: null,
          generatedDeckId: null,
          idempotencyKey: getMockUploadIdempotencyKey(file),
          materialId: null,
          ocrRequired,
          progressPercentage: 0,
          selectedFile: file,
          status: "selected",
          uploadJobId: null,
        }),
      setOcrRequired: (ocrRequired) =>
        set({
          ocrRequired,
        }),
      setProcessingStage: (stage, progressPercentage) =>
        set({
          currentStage: stage,
          progressPercentage,
          status: stage === "ready" ? "ready" : "processing",
        }),
      startMockProcessing: () => {
        const file = get().selectedFile;
        const slug = file ? slugify(file.name) || "upload" : "upload";
        const idempotencyKey = get().idempotencyKey ?? `mock-upload-${slug}-${Date.now().toString(36)}`;
        const stableSuffix = hashString(idempotencyKey);

        set({
          currentStage: "uploading",
          errorMessage: null,
          generatedDeckId: `generated-${slug}-${stableSuffix}`,
          idempotencyKey,
          materialId: `material-${slug}-${stableSuffix}`,
          progressPercentage: 8,
          status: "processing",
          uploadJobId: `upload-job-${slug}-${stableSuffix}`,
        });
      },
    }),
    {
      name: "flashly-upload-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
