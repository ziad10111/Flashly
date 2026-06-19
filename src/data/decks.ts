import { allFlashcards, biologyFlashcards, projectManagementFlashcards, safetyFlashcards } from "@/data/flashcards";
import { sampleFiles } from "@/data/sampleFiles";
import type {
  AIGenerationPrompt,
  DeckGoal,
  FlashcardDeck,
  FlashcardDifficulty,
  ReviewMode,
  XPRewardRule,
} from "@/types/learning";
import {
  DECK_GOALS,
  DECK_PROGRESS_STATUSES,
  FLASHCARD_DIFFICULTY_LEVELS,
  REVIEW_MODES,
} from "@/types/learning";

export const difficultyLevels: FlashcardDifficulty[] = [...FLASHCARD_DIFFICULTY_LEVELS];
export const reviewModes: ReviewMode[] = [...REVIEW_MODES];
export const deckGoals: DeckGoal[] = [...DECK_GOALS];
export const deckProgressStatuses = [...DECK_PROGRESS_STATUSES];

export const aiGenerationPrompts: AIGenerationPrompt[] = [
  {
    id: "summary-to-flashcards",
    name: "Summary To Flashcards",
    description: "Turn clean extracted notes into concise study cards for first-pass review.",
    reviewMode: "quick-review",
    systemPrompt:
      'Convert the extracted file text into beginner-friendly flashcards. Return valid JSON with a "flashcards" array. Each flashcard must include id, question, answer, explanation, topic, and difficulty. Keep answers short and grounded in the source text.',
    outputFormat: "json",
  },
  {
    id: "exam-prep-flashcards",
    name: "Exam Prep Flashcards",
    description: "Focus on the most testable facts, definitions, and compare/contrast concepts.",
    reviewMode: "exam-prep",
    systemPrompt:
      'Convert the extracted file text into exam-prep flashcards. Return valid JSON with a "flashcards" array. Each item must include id, question, answer, explanation, topic, and difficulty. Prioritize likely quiz questions, definitions, and high-value review points.',
    outputFormat: "json",
  },
  {
    id: "key-terms-flashcards",
    name: "Key Terms Flashcards",
    description: "Extract major terms and create direct recall cards from them.",
    reviewMode: "quick-review",
    systemPrompt:
      'Read the extracted file text and create key-term flashcards. Return valid JSON with a "flashcards" array. Each flashcard must include id, question, answer, explanation, topic, and difficulty. Focus on important terms, short definitions, and source-backed wording.',
    outputFormat: "json",
  },
];

export const xpRewardRules: XPRewardRule[] = [
  {
    id: "xp-reviewed-card",
    event: "reviewed-card",
    xp: 2,
    description: "Awarded whenever a user reviews any card.",
  },
  {
    id: "xp-correct-answer",
    event: "correct-answer",
    xp: 5,
    description: "Awarded for answering a card correctly.",
  },
  {
    id: "xp-completed-deck",
    event: "completed-deck",
    xp: 20,
    description: "Awarded after finishing every card in a deck review session.",
  },
  {
    id: "xp-weak-card-retry",
    event: "weak-card-retry",
    xp: 3,
    description: "Awarded for revisiting a card previously marked difficult.",
  },
  {
    id: "xp-daily-streak",
    event: "daily-streak",
    xp: 10,
    description: "Awarded once per day when the user keeps their streak active.",
  },
];

export const flashcardDecks: FlashcardDeck[] = [
  {
    id: "deck-biology-notes",
    title: "Biology Notes Deck",
    description: "A short starter deck generated from cell biology notes.",
    sourceFileName: sampleFiles[0].fileName,
    sourceType: sampleFiles[0].fileType,
    totalCards: biologyFlashcards.length,
    estimatedMinutes: 4,
    difficulty: "easy",
    goals: ["understand-concepts", "memorize-facts"],
    tags: ["biology", "cells", "starter-deck"],
    cards: biologyFlashcards,
    aiPromptId: "summary-to-flashcards",
    progressStatus: "not-started",
    createdAt: "2026-05-24T09:20:00.000Z",
  },
  {
    id: "deck-project-management-summary",
    title: "Project Management Review",
    description: "A practical deck covering charters, stakeholders, and risk review.",
    sourceFileName: sampleFiles[1].fileName,
    sourceType: sampleFiles[1].fileType,
    totalCards: projectManagementFlashcards.length,
    estimatedMinutes: 5,
    difficulty: "medium",
    goals: ["understand-concepts", "prepare-for-quiz"],
    tags: ["project-management", "planning", "risk"],
    cards: projectManagementFlashcards,
    aiPromptId: "exam-prep-flashcards",
    progressStatus: "in-progress",
    createdAt: "2026-05-24T09:50:00.000Z",
  },
  {
    id: "deck-safety-instructions-image",
    title: "Safety Instructions Drill",
    description: "A quick OCR-based deck for reviewing workplace safety basics.",
    sourceFileName: sampleFiles[2].fileName,
    sourceType: sampleFiles[2].fileType,
    totalCards: safetyFlashcards.length,
    estimatedMinutes: 3,
    difficulty: "easy",
    goals: ["memorize-facts", "prepare-for-quiz"],
    tags: ["safety", "ocr", "compliance"],
    cards: safetyFlashcards,
    aiPromptId: "key-terms-flashcards",
    progressStatus: "needs-review",
    createdAt: "2026-05-24T10:10:00.000Z",
  },
];

export const sampleDeckById: Record<string, FlashcardDeck> = Object.fromEntries(
  flashcardDecks.map((deck) => [deck.id, deck]),
);

export const sampleDeckIds = flashcardDecks.map((deck) => deck.id);
export const totalSampleFlashcards = allFlashcards.length;
