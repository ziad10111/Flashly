import type {
  AssistantConversationDTO,
  AssistantMessageDTO,
  CreateReviewSessionRequest,
  CreateReviewSessionResponse,
  CreateUploadRequest,
  CreateUploadResponse,
  DeckDTO,
  FlashcardDTO,
  GetAssistantConversationResponse,
  GetDeckResponse,
  GetDecksResponse,
  ProgressResponse,
  UploadStatusResponse,
} from "@/api/contracts";
import {
  DECK_COMPLETION_THRESHOLD,
  MOCK_DAILY_STREAK,
  MOCK_STARTING_TOTAL_XP,
  XP_PER_KNOWN_CARD,
  XP_PER_REVIEW_AGAIN_CARD,
} from "./reviewRules";
import type { ReviewValidationSuccess } from "./reviewValidation";
import type { PreparedUploadMetadata } from "./repositories/types";

const nowIso = () => new Date().toISOString();

export const mockDeck: DeckDTO = {
  id: "mock-backend-biology-midterm",
  materialId: "mock-backend-material-biology",
  title: "Biology Midterm Notes",
  description: "Mock backend deck for future API integration.",
  sourceFileName: "biology-midterm-notes.pdf",
  sourceType: "pdf",
  status: "ready",
  cardCount: 3,
  reviewedCount: 0,
  weakCardCount: 0,
  xpEarned: 0,
  completionPercentage: 0,
  createdAt: "2026-05-30T10:00:00.000Z",
  updatedAt: "2026-05-30T10:00:00.000Z",
};

export const mockFlashcards: FlashcardDTO[] = [
  {
    id: "mock-backend-card-1",
    deckId: mockDeck.id,
    type: "qa",
    question: "What is the main purpose of a flashcard deck?",
    answer: "To practice active recall from a focused study material.",
    explanation: "This mock card proves the API shape without using AI generation.",
    difficulty: "easy",
    topic: "Active recall",
    sourceSection: "Overview",
    position: 0,
  },
  {
    id: "mock-backend-card-2",
    deckId: mockDeck.id,
    type: "qa",
    question: "Why should weak cards be reviewed again?",
    answer: "They identify concepts that need another pass before the next review session.",
    explanation: "Weak card tracking will later sync to backend progress state.",
    difficulty: "medium",
    topic: "Review progress",
    sourceSection: "Progress",
    position: 1,
  },
  {
    id: "mock-backend-card-3",
    deckId: mockDeck.id,
    type: "qa",
    question: "What should stay server-side in Flashly?",
    answer: "AI calls, OCR calls, file parsing, secure API keys, and storage credentials.",
    explanation: "The frontend should only call protected backend routes later.",
    difficulty: "hard",
    topic: "Architecture",
    sourceSection: "Backend boundary",
    position: 2,
  },
];

export const createMockUploadResponse = (
  request: CreateUploadRequest,
  metadata: PreparedUploadMetadata,
): CreateUploadResponse => {
  const safeKey = request.idempotencyKey || `mock-${Date.now().toString(36)}`;

  return {
    uploadJobId: `mock-upload-job-${safeKey}`,
    materialId: `mock-material-${safeKey}`,
    fileName: metadata.fileName,
    fileSize: metadata.fileSize,
    mimeType: metadata.mimeType,
    sourceType: metadata.sourceType,
    status: "queued",
    stage: "uploading",
    progressPercentage: 0,
    ocrStatus: metadata.ocrRequired ? "queued" : "not-needed",
    ocrRequired: metadata.ocrRequired,
    idempotencyKey: safeKey,
    storageKey: metadata.storageKey,
  };
};

export const createMockUploadStatusResponse = (uploadJobId: string): UploadStatusResponse => ({
  uploadJobId,
  materialId: `mock-material-${uploadJobId}`,
  deckId: mockDeck.id,
  status: "ready",
  stage: "ready",
  progressPercentage: 100,
  ocrStatus: uploadJobId.toLowerCase().includes("image") ? "complete" : "not-needed",
  ocrRequired: uploadJobId.toLowerCase().includes("image"),
  storageKey: `mock/uploads/${uploadJobId}`,
});

export const getMockDecksResponse = (): GetDecksResponse => ({
  decks: [mockDeck],
});

export const getMockDeckResponse = (deckId: string): GetDeckResponse | null => {
  if (deckId !== mockDeck.id) {
    return null;
  }

  return {
    deck: mockDeck,
    cards: mockFlashcards,
  };
};

export const createMockReviewSessionResponse = (
  request: CreateReviewSessionRequest | ReviewValidationSuccess["metadata"],
): CreateReviewSessionResponse => {
  const knownCount = request.reviews.filter((review) => review.answer === "known").length;
  const unknownCount = request.reviews.length - knownCount;
  const reviewedCardIds = request.reviews.map((review) => review.cardId);
  const weakCardIds = request.reviews.filter((review) => review.answer === "again").map((review) => review.cardId);
  const xpEarned = knownCount * XP_PER_KNOWN_CARD + unknownCount * XP_PER_REVIEW_AGAIN_CARD;
  const completionPercentage = Math.min(request.reviews.length / Math.max(mockFlashcards.length, 1), 1) * 100;
  const completedDeck = completionPercentage / 100 >= DECK_COMPLETION_THRESHOLD;

  return {
    sessionId: `mock-review-session-${request.idempotencyKey}`,
    deckId: request.deckId,
    mode: request.mode,
    cardsReviewed: request.reviews.length,
    reviewedCardIds,
    knownCount,
    unknownCount,
    xpEarned,
    totalXp: MOCK_STARTING_TOTAL_XP + xpEarned,
    dailyStreak: MOCK_DAILY_STREAK,
    deckCompletionPercentage: Math.round(completionPercentage),
    completedDeck,
    weakCardCount: unknownCount,
    weakCardIds,
    cardStates: request.reviews.map((review) => ({
      cardId: review.cardId,
      deckId: request.deckId,
      reviewCount: 1,
      knownCount: review.answer === "known" ? 1 : 0,
      unknownCount: review.answer === "again" ? 1 : 0,
      isWeak: review.answer === "again",
      lastReviewedAt: review.answeredAt,
      nextReviewAt: review.answer === "again" ? new Date(Date.parse(review.answeredAt) + 24 * 60 * 60 * 1000).toISOString() : undefined,
    })),
    startedAt: request.startedAt,
    completedAt: request.completedAt,
    retryable: false,
  };
};

export const getMockProgressResponse = (): ProgressResponse => ({
  totalXp: MOCK_STARTING_TOTAL_XP,
  dailyStreak: MOCK_DAILY_STREAK,
  lastActivityDate: "2026-05-30",
  lastReviewedAt: "2026-05-30T10:20:00.000Z",
  completedDeckIds: [],
  reviewedCardCount: 0,
  weakCardCount: 0,
  weakCardIds: [],
  generatedDeckCount: 0,
});

export const createMockAssistantResponse = (
  deckId: string,
  message: string,
): { conversation: AssistantConversationDTO; message: AssistantMessageDTO } => {
  const timestamp = nowIso();
  const conversationId = `mock-assistant-conversation-${deckId}`;
  const userMessage: AssistantMessageDTO = {
    id: `mock-assistant-user-${timestamp}`,
    conversationId,
    deckId,
    role: "user",
    content: message,
    createdAt: timestamp,
  };
  const assistantMessage: AssistantMessageDTO = {
    id: `mock-assistant-reply-${timestamp}`,
    conversationId,
    deckId,
    role: "assistant",
    content: `Mock Study Assistant response for deck ${deckId}. Real retrieval and AI replies will be handled server-side later.`,
    createdAt: timestamp,
  };

  return {
    conversation: {
      id: conversationId,
      deckId,
      messages: [userMessage, assistantMessage],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    message: assistantMessage,
  };
};

export const getMockAssistantConversationByDeck = (deckId: string): GetAssistantConversationResponse => {
  if (deckId !== mockDeck.id) {
    return {
      conversation: null,
    };
  }

  const createdAt = "2026-05-30T10:15:00.000Z";
  const conversationId = `mock-assistant-conversation-${deckId}`;
  const messages: AssistantMessageDTO[] = [
    {
      id: "mock-assistant-message-summary",
      conversationId,
      deckId,
      materialId: mockDeck.materialId,
      role: "assistant",
      content:
        "I can help summarize this uploaded material, quiz you from the flashcards, or focus on weak cards after a review session.",
      createdAt,
    },
    {
      id: "mock-assistant-message-plan",
      conversationId,
      deckId,
      materialId: mockDeck.materialId,
      role: "assistant",
      content:
        "A good next step is to review the deck once, mark any uncertain answers as weak, then ask for a short study plan.",
      createdAt: "2026-05-30T10:16:00.000Z",
    },
  ];

  return {
    conversation: {
      id: conversationId,
      deckId,
      materialId: mockDeck.materialId,
      messages,
      createdAt,
      updatedAt: messages[messages.length - 1].createdAt,
    },
  };
};
