import type { CreateUploadResponse, UploadStatusResponse } from "@/api/contracts";
import { queryPostgres } from "../../database";
import type { ServerUploadRepository } from "../types";
import { ensureDatabaseUser, withDatabaseRepositoryError, withDatabaseTransaction } from "./utils";

export const databaseUploadRepository: ServerUploadRepository = {
  createUploadJob: (request, metadata, context) =>
    withDatabaseTransaction("uploads.createUploadJob", async (client): Promise<CreateUploadResponse> => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly", client);
      const existing = await client.query<UploadRow>(
        `
          SELECT *
          FROM uploads
          WHERE user_id = $1 AND idempotency_key = $2
          LIMIT 1
        `,
        [user.id, request.idempotencyKey],
      );

      const row = existing.rows[0] ?? (await client.query<UploadRow>(
        `
          WITH material_insert AS (
            INSERT INTO materials (
              user_id,
              file_name,
              file_type,
              mime_type,
              file_size,
              storage_key,
              extraction_status,
              extraction_stage,
              ocr_status,
              ocr_required
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'not-started', 'not-started', $7, $8)
            RETURNING id
          )
          INSERT INTO uploads (
            user_id,
            material_id,
            idempotency_key,
            file_name,
            file_size,
            mime_type,
            source_type,
            storage_key,
            status,
            stage,
            progress_percentage,
            ocr_status,
            ocr_required
          )
          SELECT $1, material_insert.id, $9, $2, $5, $4, $3, $6, 'queued', 'uploading', 0, $7, $8
          FROM material_insert
          RETURNING *
        `,
        [
          user.id,
          metadata.fileName,
          metadata.sourceType,
          metadata.mimeType ?? null,
          metadata.fileSize ?? null,
          metadata.storageKey,
          metadata.ocrRequired ? "queued" : "not-needed",
          metadata.ocrRequired,
          request.idempotencyKey,
        ],
      )).rows[0];

      await client.query(
        "UPDATE materials SET upload_id = $1, updated_at = now() WHERE id = $2 AND user_id = $3",
        [row.id, row.material_id, user.id],
      );

      return mapUploadToCreateResponse(row);
    }),
  getUploadStatus: (uploadJobId, context) =>
    withDatabaseRepositoryError("uploads.getUploadStatus", async (): Promise<UploadStatusResponse> => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly");
      const result = await queryPostgres<UploadRow>(
        `
          SELECT *
          FROM uploads
          WHERE id = $1 AND user_id = $2
          LIMIT 1
        `,
        [uploadJobId, user.id],
      );
      const row = result.rows[0];

      if (!row) {
        return {
          deckId: null,
          materialId: null,
          ocrRequired: false,
          ocrStatus: "not-needed",
          progressPercentage: 0,
          stage: null,
          status: "failed",
          uploadJobId,
        };
      }

      return mapUploadToStatusResponse(row);
    }),
};

type UploadRow = {
  id: string;
  material_id: string | null;
  deck_id: string | null;
  idempotency_key: string;
  file_name: string;
  file_size: number | string | null;
  mime_type: string | null;
  source_type: CreateUploadResponse["sourceType"];
  storage_key: string | null;
  status: CreateUploadResponse["status"];
  stage: CreateUploadResponse["stage"] | null;
  progress_percentage: number;
  ocr_status: CreateUploadResponse["ocrStatus"];
  ocr_required: boolean;
  error_code?: string | null;
  error_message?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const toOptionalNumber = (value: number | string | null) =>
  value === null ? undefined : Number(value);

const mapUploadToCreateResponse = (row: UploadRow): CreateUploadResponse => ({
  fileName: row.file_name,
  fileSize: toOptionalNumber(row.file_size),
  idempotencyKey: row.idempotency_key,
  materialId: row.material_id ?? "",
  mimeType: row.mime_type ?? undefined,
  ocrRequired: row.ocr_required,
  ocrStatus: row.ocr_status,
  progressPercentage: row.progress_percentage,
  sourceType: row.source_type,
  stage: row.stage ?? "uploading",
  status: row.status,
  storageKey: row.storage_key ?? undefined,
  uploadJobId: row.id,
});

const mapUploadToStatusResponse = (row: UploadRow): UploadStatusResponse => ({
  deckId: row.deck_id,
  fileName: row.file_name,
  materialId: row.material_id,
  ocrRequired: row.ocr_required,
  ocrStatus: row.ocr_status,
  progressPercentage: row.progress_percentage,
  stage: row.stage,
  status: row.status,
  storageKey: row.storage_key ?? undefined,
  uploadJobId: row.id,
});
