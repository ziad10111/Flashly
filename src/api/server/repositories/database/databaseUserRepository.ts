import type { ServerUserRepository } from "../types";
import { getDatabaseUserByClerkUserId, withDatabaseRepositoryError } from "./utils";

export const databaseUserRepository: ServerUserRepository = {
  getUserByClerkUserId: (clerkUserId) =>
    withDatabaseRepositoryError("users.getUserByClerkUserId", () => getDatabaseUserByClerkUserId(clerkUserId)),
};
