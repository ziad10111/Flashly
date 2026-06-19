const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env");

const loadDotEnv = () => {
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async () => {
  loadDotEnv();

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run database repository smoke checks.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  const suffix = Date.now().toString(36);
  const clerkUserId = `flashly-db-smoke-${suffix}`;
  let userId = null;

  try {
    await client.query("BEGIN");

    const user = await client.query(
      `
        INSERT INTO users (clerk_user_id, email, display_name)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [clerkUserId, `${clerkUserId}@example.com`, "Flashly DB Smoke"],
    );
    userId = user.rows[0].id;

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
          text_length
        )
        VALUES ($1, 'database-smoke.pdf', 'pdf', 'application/pdf', 1280, 'complete', 'complete', 'not-needed', false, 'Database smoke material', 23)
        RETURNING id
      `,
      [userId],
    );
    const materialId = material.rows[0].id;

    const deck = await client.query(
      `
        INSERT INTO decks (
          user_id,
          material_id,
          title,
          description,
          source_file_name,
          source_type,
          status,
          card_count
        )
        VALUES ($1, $2, 'Database Smoke Deck', 'Repository smoke test deck.', 'database-smoke.pdf', 'pdf', 'ready', 2)
        RETURNING id
      `,
      [userId, materialId],
    );
    const deckId = deck.rows[0].id;

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
          choices,
          correct_choice_id,
          position
        )
        VALUES
          ($1, $2, $3, 'mcq', 'What does this smoke test verify?', 'PostgreSQL persistence', 'The test writes and reads Flashly rows.', 'easy', $4::jsonb, 'A', 0),
          ($1, $2, $3, 'mcq', 'Which mode uses these tables?', 'database mode', 'FLASHLY_DATA_MODE=database selects database repositories.', 'easy', $5::jsonb, 'A', 1)
      `,
      [
        userId,
        deckId,
        materialId,
        JSON.stringify([
          { id: "A", label: "A", text: "PostgreSQL persistence" },
          { id: "B", label: "B", text: "Only frontend state" },
          { id: "C", label: "C", text: "Image rendering" },
          { id: "D", label: "D", text: "Tab icons" },
        ]),
        JSON.stringify([
          { id: "A", label: "A", text: "database mode" },
          { id: "B", label: "B", text: "mock mode only" },
          { id: "C", label: "C", text: "OCR mode" },
          { id: "D", label: "D", text: "storage mode" },
        ]),
      ],
    );

    await client.query(
      `
        INSERT INTO progress (
          user_id,
          deck_id,
          scope,
          reviewed_card_count,
          weak_card_count,
          total_xp,
          completion_percentage
        )
        VALUES ($1, $2, 'deck', 1, 0, 7, 50)
      `,
      [userId, deckId],
    );

    await client.query(
      `
        INSERT INTO progress (
          user_id,
          scope,
          total_xp,
          daily_streak,
          last_activity_date,
          reviewed_card_count,
          weak_card_count,
          generated_deck_count
        )
        VALUES ($1, 'user', 7, 1, CURRENT_DATE, 1, 0, 1)
      `,
      [userId],
    );

    const readDeck = await client.query(
      `
        SELECT d.*, p.reviewed_card_count, p.completion_percentage
        FROM decks d
        LEFT JOIN progress p ON p.deck_id = d.id AND p.scope = 'deck'
        WHERE d.id = $1 AND d.user_id = $2
      `,
      [deckId, userId],
    );
    const readCards = await client.query("SELECT * FROM flashcards WHERE deck_id = $1 ORDER BY position", [deckId]);
    const readProgress = await client.query("SELECT * FROM progress WHERE user_id = $1", [userId]);

    assert(readDeck.rows.length === 1, "Expected test deck to be readable.");
    assert(readCards.rows.length === 2, "Expected test flashcards to be readable.");
    assert(readProgress.rows.length >= 2, "Expected test progress rows to be readable.");

    await client.query("ROLLBACK");
    console.log(
      JSON.stringify(
        {
          deckId,
          flashcardCount: readCards.rows.length,
          materialId,
          ok: true,
          progressRows: readProgress.rows.length,
          userId,
        },
        null,
        2,
      ),
    );
    console.log("PASS database repository smoke check");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error("FAIL database repository smoke check");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
