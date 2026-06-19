import type {
  AssistantChatRequest,
  AssistantChatResponse,
  CreateReviewSessionResponse,
  CreateUploadRequest,
  CreateUploadResponse,
  ExtractMaterialResponse,
  GetAssistantConversationResponse,
  GetDeckResponse,
  GetDecksResponse,
  GenerateFlashcardsResponse,
  ProgressResponse,
  StudyMaterialDTO,
  UploadStatusResponse,
} from "@/api/contracts";
import type {
  FlashcardRow,
  SubscriptionRow,
  SubscriptionStatus,
  UserRow,
} from "../schema";
import type { ReviewValidationSuccess } from "../reviewValidation";
import type { UploadValidationSuccess } from "../uploadValidation";
import type { ExtractionValidationSuccess } from "../extractionValidation";
import type { GenerationValidationSuccess } from "../generationValidation";

export type MaybePromise<TValue> = TValue | Promise<TValue>;

export type ServerRepositoryContext = {
  userId: string;
};

export type UpsertSubscriptionInput = {
  canceledAt?: string;
  currentPeriodEnd?: string;
  currentPeriodStart?: string;
  metadata?: Record<string, unknown>;
  planId: string;
  provider: "clerk" | "stripe" | "manual" | "revenuecat";
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  status: SubscriptionStatus;
  userId: string;
};

export type PreparedUploadMetadata = UploadValidationSuccess["metadata"] & {
  storageKey: string;
};

export type ServerUploadRepository = {
  createUploadJob: (
    request: CreateUploadRequest,
    metadata: PreparedUploadMetadata,
    context?: ServerRepositoryContext,
  ) => MaybePromise<CreateUploadResponse>;
  getUploadStatus: (uploadJobId: string, context?: ServerRepositoryContext) => MaybePromise<UploadStatusResponse>;
};

export type PersistExtractionResultInput = {
  extraction: ExtractMaterialResponse;
  metadata: ExtractionValidationSuccess["metadata"];
};

export type CreateGenerationJobInput = {
  metadata: GenerationValidationSuccess["metadata"];
  materialId: string;
};

export type PersistGenerationResultInput = {
  generation: GenerateFlashcardsResponse;
  metadata: GenerationValidationSuccess["metadata"];
  materialId: string;
};

export type MarkGenerationFailedInput = {
  error: unknown;
  metadata: GenerationValidationSuccess["metadata"];
  materialId: string;
};

export type ServerMaterialRepository = {
  createGenerationJob: (
    input: CreateGenerationJobInput,
    context?: ServerRepositoryContext,
  ) => MaybePromise<{ generationJobId: string } | null>;
  getMaterialById: (
    materialId: string,
    context?: ServerRepositoryContext,
  ) => MaybePromise<StudyMaterialDTO | null>;
  markGenerationFailed: (
    input: MarkGenerationFailedInput,
    context?: ServerRepositoryContext,
  ) => MaybePromise<void>;
  persistExtractionResult: (
    input: PersistExtractionResultInput,
    context?: ServerRepositoryContext,
  ) => MaybePromise<ExtractMaterialResponse>;
  persistGenerationResult: (
    input: PersistGenerationResultInput,
    context?: ServerRepositoryContext,
  ) => MaybePromise<GenerateFlashcardsResponse>;
};

export type ServerDeckRepository = {
  getDeckById: (deckId: string, context?: ServerRepositoryContext) => MaybePromise<GetDeckResponse | null>;
  getDecks: (context?: ServerRepositoryContext) => MaybePromise<GetDecksResponse>;
};

export type ServerReviewRepository = {
  createReviewSession: (
    metadata: ReviewValidationSuccess["metadata"],
    context?: ServerRepositoryContext,
  ) => MaybePromise<CreateReviewSessionResponse>;
};

export type ServerProgressRepository = {
  getProgress: (context?: ServerRepositoryContext) => MaybePromise<ProgressResponse>;
};

export type ServerAssistantRepository = {
  getConversationByDeck: (deckId: string, context?: ServerRepositoryContext) => MaybePromise<GetAssistantConversationResponse>;
  sendMessage: (request: AssistantChatRequest, context?: ServerRepositoryContext) => MaybePromise<AssistantChatResponse>;
};

export type ServerUserRepository = {
  getUserByClerkUserId: (clerkUserId: string) => MaybePromise<UserRow | null>;
};

export type ServerFlashcardRepository = {
  getFlashcardsByDeckId: (deckId: string, context?: ServerRepositoryContext) => MaybePromise<FlashcardRow[]>;
};

export type ServerSubscriptionRepository = {
  getSubscriptionByUserId: (userId: string) => MaybePromise<SubscriptionRow | null>;
  upsertSubscription: (input: UpsertSubscriptionInput) => MaybePromise<SubscriptionRow>;
};
