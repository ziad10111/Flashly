const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { createPostgresPoolConfig } = require("../src/api/server/database/postgresConnectionConfig");

const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env");
const migrationsDir = path.join(repoRoot, "src", "api", "server", "database", "migrations");

const loadDotEnv = () => {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
};

const getDatabaseUrl = () => {
  loadDotEnv();

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run Flashly database migrations.");
  }

  return databaseUrl;
};

const getMigrationFiles = () =>
  fs
    .readdirSync(migrationsDir)
    .filter((fileName) => /^\d+_.+\.sql$/i.test(fileName))
    .sort();

const main = async () => {
  const databaseUrl = getDatabaseUrl();
  const pool = new Pool(createPostgresPoolConfig({ databaseUrl }));

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await pool.query("SELECT id FROM schema_migrations");
    const applied = new Set(appliedResult.rows.map((row) => row.id));
    const migrationFiles = getMigrationFiles();

    if (migrationFiles.length === 0) {
      console.log("No Flashly database migrations found.");
      return;
    }

    for (const fileName of migrationFiles) {
      if (applied.has(fileName)) {
        console.log(`Skipping already applied migration ${fileName}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, fileName), "utf8");
      const client = await pool.connect();

      try {
        console.log(`Applying migration ${fileName}`);
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [fileName]);
        await client.query("COMMIT");
        console.log(`Applied migration ${fileName}`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
