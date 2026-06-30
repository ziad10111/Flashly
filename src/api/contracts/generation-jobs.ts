import type {
  ApiErrorDTO,
  FlashcardDifficultyDTO,
  FlashcardGenerationStatusDTO,
  ISODateTimeString,
} from "./common";
import type { DeckDTO } from "./decks";

export type DurableGenerationStatusDTO =
  | "queued"
  | "processing"
  | "partial"
  | "completed"
  | "failed"
  | "cancelled";

export type StartGenerationJobRequest = {
  sourceId?: string;
  materialId?: string;
  deckTitle?: string;
  extractedTextPreview?: string;
  requestedCardCount: number;
  batchSize?: number;
  generationMode?: "sample" | "comprehensive";
  difficulty?: FlashcardDifficultyDTO;
  topicFocus?: string[];
  idempotencyKey: string;
};

export type GenerationJobDTO = {
  jobId: string;
  deckId: string;
  materialId: string;
  status: DurableGenerationStatusDTO;
  legacyStatus?: FlashcardGenerationStatusDTO;
  requestedCardCount: number;
  completedCardCount: number;
  totalBatchCount: number;
  completedBatchCount: number;
  failedBatchCount: number;
  retryCount: number;
  canRetry: boolean;
  lastError: ApiErrorDTO | null;
  deck?: DeckDTO;
  createdAt: ISODateTimeString;
  startedAt?: ISODateTimeString;
  completedAt?: ISODateTimeString;
  cancelledAt?: ISODateTimeString;
  updatedAt: ISODateTimeString;
};

export type StartGenerationJobResponse = GenerationJobDTO;

export type GetGenerationJobResponse = GenerationJobDTO;

export type GetGenerationJobsResponse = {
  jobs: GenerationJobDTO[];
};

export type RetryGenerationJobResponse = GenerationJobDTO;

export type CancelGenerationJobResponse = GenerationJobDTO;
