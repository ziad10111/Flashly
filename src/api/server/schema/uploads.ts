import type {
  IdempotentRow,
  OCRStatusDTO,
  SchemaId,
  SourceFileType,
  TimestampedRow,
  UploadStageDTO,
  UploadStatusDTO,
  UserOwnedRow,
} from "./common";

export type UploadJobRow = TimestampedRow &
  UserOwnedRow &
  IdempotentRow & {
    id: SchemaId;
    materialId?: SchemaId;
    deckId?: SchemaId;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    sourceType: SourceFileType;
    storageKey?: string;
    status: UploadStatusDTO;
    stage: UploadStageDTO | null;
    progressPercentage: number;
    ocrStatus: OCRStatusDTO;
    ocrRequired: boolean;
    errorCode?: string;
    errorMessage?: string;
  };
