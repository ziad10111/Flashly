import type { PoolConfig } from "pg";

export function createPostgresPoolConfig(options?: {
  databaseUrl?: string;
  env?: NodeJS.ProcessEnv;
}): PoolConfig;

export function resolveDatabaseCaCertificate(env?: NodeJS.ProcessEnv): string | undefined;

export function sanitizeDatabaseUrl(databaseUrl: string): string;

export function shouldRequireDatabaseCa(databaseUrl: string, env?: NodeJS.ProcessEnv): boolean;
