import type { PoolClient, QueryResultRow } from "pg";

import { queryPostgres, withPostgresClient } from "../../database";
import { ServerRepositoryNotConfiguredError } from "../../repositoryErrors";

type DatabaseUserRow = QueryResultRow & {
  id: string;
  clerk_user_id: string;
  email?: string | null;
  display_name?: string | null;
  image_url?: string | null;
  last_signed_in_at?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : value;
};

export const toDateString = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
};

export const mapDatabaseUserRow = (row: DatabaseUserRow) => ({
  clerkUserId: row.clerk_user_id,
  createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  displayName: row.display_name ?? undefined,
  email: row.email ?? undefined,
  id: row.id,
  imageUrl: row.image_url ?? undefined,
  lastSignedInAt: toIsoString(row.last_signed_in_at),
  updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
});

const getUserByClerkIdSql = `
  SELECT id, clerk_user_id, email, display_name, image_url, last_signed_in_at, created_at, updated_at
  FROM users
  WHERE clerk_user_id = $1
`;

export const getDatabaseUserByClerkUserId = async (clerkUserId: string) => {
  const result = await queryPostgres<DatabaseUserRow>(getUserByClerkIdSql, [clerkUserId]);
  const row = result.rows[0];

  return row ? mapDatabaseUserRow(row) : null;
};

export const ensureDatabaseUser = async (clerkUserId: string, client?: PoolClient) => {
  const query = client
    ? <TRow extends QueryResultRow>(text: string, values?: unknown[]) => client.query<TRow>(text, values)
    : queryPostgres;
  const result = await query<DatabaseUserRow>(
    `
      INSERT INTO users (clerk_user_id)
      VALUES ($1)
      ON CONFLICT (clerk_user_id)
      DO UPDATE SET updated_at = now()
      RETURNING id, clerk_user_id, email, display_name, image_url, last_signed_in_at, created_at, updated_at
    `,
    [clerkUserId],
  );

  return mapDatabaseUserRow(result.rows[0]);
};

export const withDatabaseRepositoryError = async <TValue>(
  operation: string,
  handler: () => Promise<TValue>,
) => {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ServerRepositoryNotConfiguredError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unknown database error";
    throw new ServerRepositoryNotConfiguredError(
      operation,
      `Database repository operation "${operation}" failed: ${message}`,
    );
  }
};

export const withDatabaseTransaction = <TValue>(
  operation: string,
  handler: (client: PoolClient) => Promise<TValue>,
) =>
  withDatabaseRepositoryError(operation, () =>
    withPostgresClient(async (client) => {
      await client.query("BEGIN");

      try {
        const result = await handler(client);
        await client.query("COMMIT");

        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }),
  );
