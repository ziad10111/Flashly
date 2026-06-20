const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { createPostgresPoolConfig } = require("../src/api/server/database/postgresConnectionConfig");

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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const owns = async (client, table, userId, resourceId) => {
  const result = await client.query(
    `
      SELECT 1
      FROM ${table}
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [resourceId, userId],
  );

  return result.rowCount === 1;
};

const main = async () => {
  loadDotEnv();

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run ownership smoke checks.");
  }

  const pool = new Pool(createPostgresPoolConfig({ databaseUrl }));
  const client = await pool.connect();
  const suffix = Date.now().toString(36);

  try {
    await client.query("BEGIN");

    const userA = (await client.query(
      "INSERT INTO users (clerk_user_id, email) VALUES ($1, $2) RETURNING id",
      [`ownership-user-a-${suffix}`, `ownership-user-a-${suffix}@example.com`],
    )).rows[0];
    const userB = (await client.query(
      "INSERT INTO users (clerk_user_id, email) VALUES ($1, $2) RETURNING id",
      [`ownership-user-b-${suffix}`, `ownership-user-b-${suffix}@example.com`],
    )).rows[0];

    const material = (await client.query(
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
          ocr_required
        )
        VALUES ($1, 'ownership.pdf', 'pdf', 'application/pdf', 1024, 'complete', 'complete', 'not-needed', false)
        RETURNING id
      `,
      [userA.id],
    )).rows[0];

    const upload = (await client.query(
      `
        INSERT INTO uploads (
          user_id,
          material_id,
          idempotency_key,
          file_name,
          file_size,
          mime_type,
          source_type,
          status,
          stage,
          ocr_status,
          ocr_required
        )
        VALUES ($1, $2, $3, 'ownership.pdf', 1024, 'application/pdf', 'pdf', 'ready', 'ready', 'not-needed', false)
        RETURNING id
      `,
      [userA.id, material.id, `ownership-${suffix}`],
    )).rows[0];

    const deck = (await client.query(
      `
        INSERT INTO decks (
          user_id,
          material_id,
          title,
          source_file_name,
          source_type,
          status,
          card_count
        )
        VALUES ($1, $2, 'Ownership Smoke Deck', 'ownership.pdf', 'pdf', 'ready', 1)
        RETURNING id
      `,
      [userA.id, material.id],
    )).rows[0];

    const card = (await client.query(
      `
        INSERT INTO flashcards (
          user_id,
          deck_id,
          material_id,
          type,
          question,
          answer,
          difficulty,
          choices,
          correct_choice_id,
          position
        )
        VALUES ($1, $2, $3, 'mcq', 'Who owns this card?', 'User A', 'easy', $4::jsonb, 'A', 0)
        RETURNING id
      `,
      [
        userA.id,
        deck.id,
        material.id,
        JSON.stringify([
          { id: "A", label: "A", text: "User A" },
          { id: "B", label: "B", text: "User B" },
          { id: "C", label: "C", text: "Nobody" },
          { id: "D", label: "D", text: "Everyone" },
        ]),
      ],
    )).rows[0];

    const session = (await client.query(
      `
        INSERT INTO review_sessions (
          user_id,
          deck_id,
          idempotency_key,
          mode,
          cards_reviewed,
          known_count,
          unknown_count,
          xp_earned,
          started_at,
          completed_at
        )
        VALUES ($1, $2, $3, 'full-deck', 1, 1, 0, 5, now(), now())
        RETURNING id
      `,
      [userA.id, deck.id, `ownership-session-${suffix}`],
    )).rows[0];

    const resources = [
      ["uploads", upload.id],
      ["materials", material.id],
      ["decks", deck.id],
      ["flashcards", card.id],
      ["review_sessions", session.id],
    ];

    for (const [table, id] of resources) {
      assert(await owns(client, table, userA.id, id), `Expected user A to own ${table}:${id}.`);
      assert(!(await owns(client, table, userB.id, id)), `Expected user B not to own user A ${table}:${id}.`);
    }

    const deckCards = await client.query(
      "SELECT COUNT(*)::integer AS count FROM flashcards WHERE user_id = $1 AND deck_id = $2 AND id = ANY($3::uuid[])",
      [userA.id, deck.id, [card.id]],
    );
    const crossDeckCards = await client.query(
      "SELECT COUNT(*)::integer AS count FROM flashcards WHERE user_id = $1 AND deck_id = $2 AND id = ANY($3::uuid[])",
      [userB.id, deck.id, [card.id]],
    );

    assert(deckCards.rows[0]?.count === 1, "Expected user A deck-card ownership check to pass.");
    assert(crossDeckCards.rows[0]?.count === 0, "Expected user B deck-card ownership check to fail.");

    await client.query("ROLLBACK");
    console.log("PASS ownership smoke check");
    console.log(
      JSON.stringify(
        {
          checkedResources: resources.map(([table]) => table),
          ok: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error("FAIL ownership smoke check");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
