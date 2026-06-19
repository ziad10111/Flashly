import { requireDatabaseUrl } from "../../database";
import { ServerRepositoryNotConfiguredError } from "../../repositoryErrors";

export const throwDatabaseRepositoryNotConfigured = (operation: string): never => {
  requireDatabaseUrl();
  throw new ServerRepositoryNotConfiguredError(operation);
};
