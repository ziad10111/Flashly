import { getMockProgressResponse } from "../mockData";
import type { ServerProgressRepository } from "./types";

// Server-side mock data access. Future server-authoritative progress can replace this implementation.
export const mockProgressRepository: ServerProgressRepository = {
  getProgress: () => getMockProgressResponse(),
};
