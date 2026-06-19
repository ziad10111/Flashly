import { createMockReviewSessionResponse } from "../mockData";
import type { ServerReviewRepository } from "./types";

// Server-side mock data access. This does not persist review progress yet.
export const mockReviewRepository: ServerReviewRepository = {
  createReviewSession: (metadata) => createMockReviewSessionResponse(metadata),
};
