export class ServerRepositoryNotConfiguredError extends Error {
  constructor(operation: string, message?: string) {
    super(
      message ??
        `Database repository operation "${operation}" is not implemented yet. Set FLASHLY_DATA_MODE=mock to use the current mock server repositories.`,
    );
    this.name = "ServerRepositoryNotConfiguredError";
  }
}

export const isServerRepositoryNotConfiguredError = (
  error: unknown,
): error is ServerRepositoryNotConfiguredError => error instanceof ServerRepositoryNotConfiguredError;
