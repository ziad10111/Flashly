import { MAX_CHUNKED_UPLOAD_BYTES } from "@/api/contracts";

export const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_CHUNKED_UPLOAD_BYTES;

export const ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf",
  "txt",
  "md",
  "jpg",
  "jpeg",
  "png",
] as const;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "image/jpeg",
  "image/png",
] as const;

export type AllowedUploadExtension = (typeof ALLOWED_UPLOAD_EXTENSIONS)[number];
export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];
