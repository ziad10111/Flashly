import type { ServerUserRepository } from "./types";

export const mockUserRepository: ServerUserRepository = {
  getUserByClerkUserId: () => null,
};
