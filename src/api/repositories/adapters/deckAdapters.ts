import { getDeckStats } from "@/lib/deck-utils";
import type { DeckProgress } from "@/store/useFlashlyProgressStore";
import type { DeckMaterial, DeckMaterialSourceType } from "@/types/deck-material";
import type { Flashcard } from "@/types/learning";
import type { DeckDTO, FlashcardDTO } from "../../contracts";

// Converts local/mock data into backend-facing DTOs.
// Keep UI-only fields such as colors, thumbnails, and tints out of this layer.

const sourceTypeToDto = (sourceType: DeckMaterialSourceType): DeckDTO["sourceType"] => {
  if (sourceType === "pdf" || sourceType === "image") {
    return sourceType;
  }

  if (sourceType === "text-document" || sourceType === "lecture-notes") {
    return "text";
  }

  if (sourceType === "uploaded-material" || sourceType === "scanned-pages" || sourceType === "handwritten-notes") {
    return "document";
  }

  return "unknown";
};

const deckStatusToDto = (status: DeckMaterial["status"]): DeckDTO["status"] => {
  if (status === "weak-cards") {
    return "needs-review";
  }

  return status;
};

export const toFlashcardDTO = (card: Flashcard, position: number): FlashcardDTO => ({
  id: card.id,
  deckId: card.deckId,
  type: card.type ?? "qa",
  question: card.question,
  answer: card.answer,
  explanation: card.explanation,
  difficulty: card.difficulty,
  topic: card.topic,
  choices: card.choices,
  correctChoiceId: card.correctChoiceId,
  sourcePage: card.sourcePage,
  sourceSection: card.sourceSection,
  position,
});

export const toDeckDTO = (deck: DeckMaterial, cards: Flashcard[], progress?: DeckProgress): DeckDTO => {
  const stats = getDeckStats(deck, cards, progress);
  const now = new Date().toISOString();
  const createdAt = "createdAt" in deck && typeof deck.createdAt === "string" ? deck.createdAt : now;

  return {
    id: deck.id,
    materialId: "materialId" in deck && typeof deck.materialId === "string" ? deck.materialId : undefined,
    title: deck.title,
    sourceFileName: deck.fileName,
    sourceType: sourceTypeToDto(deck.sourceType),
    status: deckStatusToDto(deck.status),
    cardCount: stats.cardCount,
    reviewedCount: stats.reviewedCount,
    weakCardCount: stats.weakCardCount,
    xpEarned: stats.xpEarned,
    completionPercentage: Math.round(stats.completion * 100),
    lastReviewedAt: stats.lastReviewedDate === "Not reviewed yet" ? undefined : stats.lastReviewedDate,
    createdAt,
    updatedAt: progress?.lastReviewedDate ?? createdAt,
  };
};
