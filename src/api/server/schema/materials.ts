import type {
  ExtractionStageDTO,
  OCRStatusDTO,
  SchemaId,
  SourceFileType,
  TimestampedRow,
  UserOwnedRow,
} from "./common";

export type StudyMaterialExtractionStatus = "not-started" | "extracting" | "ocr-needed" | "complete" | "failed";

export type StudyMaterialRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    uploadJobId?: SchemaId;
    fileName: string;
    fileType: SourceFileType;
    mimeType?: string;
    fileSize?: number;
    storageKey?: string;
    extractionStatus: StudyMaterialExtractionStatus;
    extractionStage: ExtractionStageDTO;
    ocrStatus: OCRStatusDTO;
    ocrRequired: boolean;
    extractedTextPreview?: string;
    extractedTextStorageKey?: string;
    textLength?: number;
    pageCount?: number;
    errorCode?: string;
    errorMessage?: string;
  };

// Source chunks are planned for future Study Assistant retrieval and source citations.
// Embeddings/vector data are intentionally represented only as an optional external reference.
export type SourceChunkRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    materialId: SchemaId;
    chunkIndex: number;
    text: string;
    textLength: number;
    tokenCount?: number;
    sourcePage?: number;
    sourceSection?: string;
    embeddingRef?: string;
  };
