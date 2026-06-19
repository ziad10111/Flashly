import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { DATABASE_URL } from "../config";
import { ServerRepositoryNotConfiguredError } from "../repositoryErrors";

let pool: Pool | null = null;

export const requireDatabaseUrl = () => {
  if (!DATABASE_URL) {
    throw new ServerRepositoryNotConfiguredError(
      "database.connection",
      "FLASHLY_DATA_MODE=database requires a server-only DATABASE_URL environment variable. Set DATABASE_URL or switch FLASHLY_DATA_MODE=mock.",
    );
  }

  return DATABASE_URL;
};

export const getPostgresPool = () => {
  if (pool) {
    return pool;
  }

  const connectionString = requireDatabaseUrl();
  const shouldUseSsl = !/localhost|127\.0\.0\.1/.test(connectionString);

  pool = new Pool({
    connectionString,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
  });

  return pool;
};

export const withPostgresClient = async <TResult>(
  handler: (client: PoolClient) => Promise<TResult>,
) => {
  const client = await getPostgresPool().connect();

  try {
    return await handler(client);
  } finally {
    client.release();
  }
};

export const queryPostgres = <TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<TRow>> => getPostgresPool().query<TRow>(text, values);
