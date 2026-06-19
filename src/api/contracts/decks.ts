import type { DeckStatusDTO, FlashcardDifficultyDTO } from "./common";

export type FlashcardTypeDTO = "qa" | "mcq";

export type FlashcardChoiceDTO = {
  id: string;
  label: string;
  text: string;
};

export type FlashcardDTO = {
  id: string;
  deckId: string;
  type: FlashcardTypeDTO;
  question: string;
  answer: string;
  explanation?: string;
  difficulty: FlashcardDifficultyDTO;
  topic?: string;
  choices?: FlashcardChoiceDTO[];
  correctChoiceId?: string;
  sourcePage?: number;
  sourceSection?: string;
  sourceChunkId?: string;
  position: number;
};

export type DeckDTO = {
  id: string;
  materialId?: string;
  title: string;
  description?: string;
  sourceFileName: string;
  sourceType: "pdf" | "image" | "text" | "document" | "unknown";
  status: DeckStatusDTO;
  cardCount: number;
  reviewedCount: number;
  weakCardCount: number;
  xpEarned: number;
  completionPercentage: number;
  lastReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type GetDecksResponse = {
  decks: DeckDTO[];
};

export type GetDeckResponse = {
  deck: DeckDTO;
  cards: FlashcardDTO[];
};
