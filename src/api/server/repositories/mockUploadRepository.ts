import { createMockUploadResponse, createMockUploadStatusResponse } from "../mockData";
import type { ServerUploadRepository } from "./types";

// Server-side mock data access. Replace this file with storage/database-backed logic later.
export const mockUploadRepository: ServerUploadRepository = {
  createUploadJob: (request, metadata) => createMockUploadResponse(request, metadata),
  getUploadStatus: (uploadJobId) => createMockUploadStatusResponse(uploadJobId),
};
