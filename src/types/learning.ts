export const SUPPORTED_SAMPLE_FILE_TYPES = ["pdf", "image", "text"] as const;

export type SampleFileType = (typeof SUPPORTED_SAMPLE_FILE_TYPES)[number];

export const FLASHCARD_DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

export type FlashcardDifficulty = (typeof FLASHCARD_DIFFICULTY_LEVELS)[number];

export type FlashcardType = "qa" | "mcq";

export type FlashcardChoice = {
  id: string;
  label: string;
  text: string;
};

export const REVIEW_MODES = ["quick-review", "exam-prep", "weak-card-retry"] as const;

export type ReviewMode = (typeof REVIEW_MODES)[number];

export const DECK_GOALS = ["understand-concepts", "memorize-facts", "prepare-for-quiz"] as const;

export type DeckGoal = (typeof DECK_GOALS)[number];

export const DECK_PROGRESS_STATUSES = ["not-started", "in-progress", "completed", "needs-review"] as const;

export type DeckProgressStatus = (typeof DECK_PROGRESS_STATUSES)[number];

export const STUDY_TOPICS = [
  "cell-biology",
  "project-planning",
  "risk-management",
  "workplace-safety",
] as const;

export type StudyTopic = (typeof STUDY_TOPICS)[number];

export type SampleFile = {
  id: string;
  fileName: string;
  fileType: SampleFileType;
  title: string;
  extractedTextPreview: string;
  requiresOCR: boolean;
  uploadedAt: string;
};

export type Flashcard = {
  id: string;
  deckId: string;
  type?: FlashcardType;
  question: string;
  answer: string;
  explanation?: string;
  topic: StudyTopic | string;
  difficulty: FlashcardDifficulty;
  choices?: FlashcardChoice[];
  correctChoiceId?: string;
  sourcePage?: number;
  sourceSection?: string;
};

export type FlashcardDeck = {
  id: string;
  title: string;
  description: string;
  sourceFileName: string;
  sourceType: SampleFileType;
  totalCards: number;
  estimatedMinutes: number;
  difficulty: FlashcardDifficulty;
  goals: DeckGoal[];
  tags: string[];
  cards: Flashcard[];
  aiPromptId: AIGenerationPrompt["id"];
  progressStatus: DeckProgressStatus;
  createdAt: string;
};

export type AIGenerationPrompt = {
  id: "summary-to-flashcards" | "exam-prep-flashcards" | "key-terms-flashcards";
  name: string;
  description: string;
  reviewMode: ReviewMode;
  systemPrompt: string;
  outputFormat: "json";
};

export type XPRewardRule = {
  id: string;
  event: "correct-answer" | "reviewed-card" | "completed-deck" | "weak-card-retry" | "daily-streak";
  xp: number;
  description: string;
};
