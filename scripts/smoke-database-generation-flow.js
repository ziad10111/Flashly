const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env");

const loadDotEnv = () => {
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/g)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

const assertRowCount = async (client, label, sql, values, expected) => {
  const result = await client.query(sql, values);
  const count = Number(result.rows[0]?.count ?? 0);

  if (count !== expected) {
    throw new Error(`${label} expected ${expected} row(s), found ${count}.`);
  }
};

const main = async () => {
  loadDotEnv();

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for smoke:database-generation.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  const unique = `smoke-db-generation-${Date.now()}`;

  try {
    await client.query("BEGIN");

    const user = await client.query(
      "INSERT INTO users (clerk_user_id, email) VALUES ($1, $2) RETURNING id",
      [unique, `${unique}@example.invalid`],
    );
    const userId = user.rows[0].id;

    const material = await client.query(
      `
        INSERT INTO materials (
          user_id,
          file_name,
          file_type,
          mime_type,
          file_size,
          extraction_status,
          extraction_stage,
          ocr_status,
          ocr_required,
          extracted_text_preview,
          text_length,
          metadata
        )
        VALUES ($1, 'smoke-material.txt', 'text', 'text/plain', 128, 'complete', 'complete', 'not-needed', false, $2, $3, $4::jsonb)
        RETURNING id
      `,
      [
        userId,
        "Pumps convert mechanical energy into hydraulic energy. Cavitation can damage pump impellers.",
        88,
        JSON.stringify({ smoke: true }),
      ],
    );
    const materialId = material.rows[0].id;

    await client.query(
      `
        INSERT INTO source_chunks (user_id, material_id, chunk_index, text, text_length)
        VALUES ($1, $2, 0, 'Pumps convert mechanical energy into hydraulic energy.', 54)
      `,
      [userId, materialId],
    );

    const job = await client.query(
      `
        INSERT INTO generation_jobs (
          user_id,
          material_id,
          idempotency_key,
          status,
          stage,
          requested_card_count,
          generated_card_count,
          expected_card_count,
          debug_metadata
        )
        VALUES ($1, $2, $3, 'complete', 'complete', 1, 1, 1, $4::jsonb)
        RETURNING id
      `,
      [userId, materialId, unique, JSON.stringify({ smoke: true })],
    );
    const generationJobId = job.rows[0].id;

    const deck = await client.query(
      `
        INSERT INTO decks (
          user_id,
          material_id,
          generation_job_id,
          title,
          source_file_name,
          source_type,
          status,
          card_count
        )
        VALUES ($1, $2, $3, 'Smoke Deck', 'smoke-material.txt', 'text', 'ready', 1)
        RETURNING id
      `,
      [userId, materialId, generationJobId],
    );
    const deckId = deck.rows[0].id;

    await client.query("UPDATE generation_jobs SET deck_id = $1 WHERE id = $2", [deckId, generationJobId]);

    await client.query(
      `
        INSERT INTO flashcards (
          user_id,
          deck_id,
          material_id,
          type,
          question,
          answer,
          explanation,
          difficulty,
          topic,
          choices,
          correct_choice_id,
          position
        )
        VALUES ($1, $2, $3, 'mcq', $4, $5, $6, 'medium', 'Pumps', $7::jsonb, 'A', 0)
      `,
      [
        userId,
        deckId,
        materialId,
        "What do pumps convert mechanical energy into?",
        "Hydraulic energy",
        "The source text states that pumps convert mechanical energy into hydraulic energy.",
        JSON.stringify([
          { id: "A", label: "A", text: "Hydraulic energy" },
          { id: "B", label: "B", text: "Thermal insulation" },
          { id: "C", label: "C", text: "Electrical resistance" },
          { id: "D", label: "D", text: "Chemical corrosion" },
        ]),
      ],
    );

    await assertRowCount(
      client,
      "material extraction persistence",
      "SELECT COUNT(*)::int AS count FROM materials WHERE id = $1 AND extraction_status = 'complete' AND text_length > 0",
      [materialId],
      1,
    );
    await assertRowCount(
      client,
      "source chunk persistence",
      "SELECT COUNT(*)::int AS count FROM source_chunks WHERE material_id = $1",
      [materialId],
      1,
    );
    await assertRowCount(
      client,
      "generation job persistence",
      "SELECT COUNT(*)::int AS count FROM generation_jobs WHERE id = $1 AND deck_id = $2 AND generated_card_count = 1",
      [generationJobId, deckId],
      1,
    );
    await assertRowCount(
      client,
      "deck persistence",
      "SELECT COUNT(*)::int AS count FROM decks WHERE id = $1 AND material_id = $2 AND card_count = 1",
      [deckId, materialId],
      1,
    );
    await assertRowCount(
      client,
      "flashcard persistence",
      "SELECT COUNT(*)::int AS count FROM flashcards WHERE deck_id = $1 AND type = 'mcq' AND correct_choice_id = 'A'",
      [deckId],
      1,
    );

    await client.query("ROLLBACK");
    console.log("PASS database generation flow smoke");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error("FAIL database generation flow smoke");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
