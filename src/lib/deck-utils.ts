import { deckMaterialById, deckMaterials } from "@/data/deckMaterials";
import { getReviewCardsForDeck } from "@/data/reviewFlashcards";
import { filterTemplateGeneratedCards } from "@/lib/generated-card-guards";
import type { DeckMaterial } from "@/types/deck-material";
import type { Flashcard } from "@/types/learning";
import type { DeckProgress } from "@/store/useFlashlyProgressStore";

export type GeneratedDeckLookup = {
  generatedCardsByDeckId: Record<string, Flashcard[]>;
  generatedDecks: DeckMaterial[];
};

export type DeckStats = {
  cardCount: number;
  completion: number;
  isCompleted: boolean;
  lastReviewedDate: string;
  reviewedCount: number;
  weakCardCount: number;
  xpEarned: number;
};

export const getAllDecks = (generatedDecks: DeckMaterial[]) => [...generatedDecks, ...deckMaterials];

export const getDeckById = (deckId: string | null | undefined, generatedDecks: DeckMaterial[]) => {
  if (!deckId) {
    return null;
  }

  const generatedDeck = generatedDecks.find((deck) => deck.id === deckId);

  if (generatedDeck) {
    return generatedDeck;
  }

  if (Object.prototype.hasOwnProperty.call(deckMaterialById, deckId)) {
    return deckMaterialById[deckId];
  }

  return null;
};

export const getDeckCards = (
  deckId: string,
  generatedCardsByDeckId: Record<string, Flashcard[]>,
) => {
  const hasGeneratedCardEntry = Object.prototype.hasOwnProperty.call(generatedCardsByDeckId, deckId);
  const generatedCards = filterTemplateGeneratedCards(generatedCardsByDeckId[deckId] ?? []);

  if (hasGeneratedCardEntry) {
    return generatedCards;
  }

  return getReviewCardsForDeck(deckId);
};

export const getDeckStats = (
  deck: DeckMaterial,
  cards: Flashcard[],
  progress: DeckProgress | undefined,
): DeckStats => {
  const cardCount = cards.length || deck.cardCount;
  const reviewedCount = Math.min(progress?.reviewedCardIds.length ?? deck.reviewedCount, cardCount);
  const weakCardCount = progress?.weakCardIds.length ?? deck.weakCardCount;
  const rawCompletion = cardCount > 0 ? reviewedCount / cardCount : 0;
  const completion = Math.min(Math.max(progress ? rawCompletion : deck.progress, 0), 1);

  return {
    cardCount,
    completion,
    isCompleted: completion >= 1,
    lastReviewedDate: progress?.lastReviewedDate ?? deck.lastReviewedDate ?? "Not reviewed yet",
    reviewedCount,
    weakCardCount,
    xpEarned: progress?.xpEarned ?? deck.xpEarned,
  };
};

export const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
