import type { DeckDTO, FlashcardChoiceDTO, FlashcardDTO } from "@/api/contracts";
import { queryPostgres } from "../../database";
import type { ServerDeckRepository } from "../types";
import { ensureDatabaseUser, toIsoString, withDatabaseRepositoryError, withDatabaseTransaction } from "./utils";

export const databaseDeckRepository: ServerDeckRepository = {
  deleteDeck: (deckId, context) =>
    withDatabaseTransaction("decks.deleteDeck", async (client) => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly", client);
      const deckResult = await client.query(
        `
          SELECT id, generation_job_id
          FROM decks
          WHERE id = $1 AND user_id = $2
          LIMIT 1
        `,
        [deckId, user.id],
      );

      if (deckResult.rowCount !== 1) {
        return;
      }

      const generationJobId =
        typeof deckResult.rows[0]?.generation_job_id === "string" ? deckResult.rows[0].generation_job_id : null;

      await client.query(
        `
          INSERT INTO deck_deletion_tombstones (deck_id, user_id, generation_job_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (deck_id, user_id)
          DO UPDATE SET generation_job_id = COALESCE(EXCLUDED.generation_job_id, deck_deletion_tombstones.generation_job_id)
        `,
        [deckId, user.id, generationJobId],
      );
      await client.query(
        `
          UPDATE generation_batches
          SET status = CASE WHEN status = 'completed' THEN status ELSE 'cancelled' END,
              last_error_message = CASE WHEN status = 'completed' THEN last_error_message ELSE 'Deck was deleted.' END,
              lease_expires_at = NULL,
              completed_at = CASE WHEN status = 'completed' THEN completed_at ELSE now() END,
              updated_at = now()
          WHERE user_id = $2
            AND generation_job_id IN (
              SELECT id
              FROM generation_jobs
              WHERE user_id = $2 AND (deck_id = $1 OR id = $3)
            )
        `,
        [deckId, user.id, generationJobId],
      );
      await client.query(
        `
          UPDATE generation_jobs
          SET status = 'cancelled',
              stage = 'cancelled',
              cancelled_at = COALESCE(cancelled_at, now()),
              completed_at = COALESCE(completed_at, now()),
              last_error_message = 'Deck was deleted.',
              updated_at = now()
          WHERE user_id = $2
            AND (deck_id = $1 OR id = $3)
            AND status NOT IN ('complete', 'completed', 'failed', 'cancelled')
        `,
        [deckId, user.id, generationJobId],
      );
      await client.query("DELETE FROM review_answers WHERE deck_id = $1 AND user_id = $2", [deckId, user.id]);
      await client.query("DELETE FROM review_sessions WHERE deck_id = $1 AND user_id = $2", [deckId, user.id]);
      await client.query("DELETE FROM progress WHERE deck_id = $1 AND user_id = $2", [deckId, user.id]);
      await client.query("DELETE FROM flashcards WHERE deck_id = $1 AND user_id = $2", [deckId, user.id]);
      await client.query(
        `
          UPDATE uploads
          SET deck_id = NULL,
              updated_at = now()
          WHERE deck_id = $1 AND user_id = $2
        `,
        [deckId, user.id],
      );
      await client.query(
        `
          UPDATE generation_jobs
          SET deck_id = NULL,
              updated_at = now()
          WHERE deck_id = $1 AND user_id = $2
        `,
        [deckId, user.id],
      );
      await client.query("DELETE FROM decks WHERE id = $1 AND user_id = $2", [deckId, user.id]);
    }),
  getDeckById: (deckId, context) =>
    withDatabaseRepositoryError("decks.getDeckById", async () => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly");
      const deckResult = await queryPostgres<DeckRow>(deckSelectSql("d.id = $2"), [user.id, deckId]);
      const deckRow = deckResult.rows[0];

      if (!deckRow) {
        return null;
      }

      const cardsResult = await queryPostgres<FlashcardRow>(
        `
          SELECT *
          FROM flashcards
          WHERE deck_id = $1 AND user_id = $2
          ORDER BY position ASC
        `,
        [deckId, user.id],
      );

      return {
        cards: cardsResult.rows.map(mapFlashcardRowToDTO),
        deck: mapDeckRowToDTO(deckRow),
      };
    }),
  getDecks: (context) =>
    withDatabaseRepositoryError("decks.getDecks", async () => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly");
      const result = await queryPostgres<DeckRow>(
        `${deckSelectSql("TRUE")} ORDER BY d.updated_at DESC, d.created_at DESC`,
        [user.id],
      );

      return {
        decks: result.rows.map(mapDeckRowToDTO),
      };
    }),
};

type DeckRow = {
  id: string;
  material_id: string | null;
  title: string;
  description: string | null;
  source_file_name: string;
  source_type: DeckDTO["sourceType"];
  status: DeckDTO["status"];
  card_count: number;
  reviewed_card_count: number | null;
  weak_card_count: number | null;
  xp_earned: number | null;
  completion_percentage: number | string | null;
  last_reviewed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type FlashcardRow = {
  id: string;
  deck_id: string;
  material_id: string | null;
  source_chunk_id: string | null;
  type: FlashcardDTO["type"];
  question: string;
  answer: string;
  explanation: string | null;
  difficulty: FlashcardDTO["difficulty"];
  topic: string | null;
  choices: FlashcardChoiceDTO[] | null;
  correct_choice_id: string | null;
  source_page: number | null;
  source_section: string | null;
  position: number;
};

const deckSelectSql = (whereClause: string) => `
  SELECT
    d.*,
    COALESCE(dp.reviewed_card_count, 0) AS reviewed_card_count,
    COALESCE(dp.weak_card_count, 0) AS weak_card_count,
    COALESCE(dp.total_xp, 0) AS xp_earned,
    COALESCE(dp.completion_percentage, 0) AS completion_percentage,
    dp.last_reviewed_at AS progress_last_reviewed_at
  FROM decks d
  LEFT JOIN progress dp
    ON dp.deck_id = d.id AND dp.user_id = d.user_id AND dp.scope = 'deck'
  WHERE d.user_id = $1 AND ${whereClause}
`;

const mapDeckRowToDTO = (row: DeckRow): DeckDTO => ({
  cardCount: row.card_count,
  completionPercentage: Number(row.completion_percentage ?? 0),
  createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  description: row.description ?? undefined,
  id: row.id,
  lastReviewedAt: toIsoString(row.last_reviewed_at),
  materialId: row.material_id ?? undefined,
  reviewedCount: row.reviewed_card_count ?? 0,
  sourceFileName: row.source_file_name,
  sourceType: row.source_type,
  status: row.status,
  title: row.title,
  updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  weakCardCount: row.weak_card_count ?? 0,
  xpEarned: row.xp_earned ?? 0,
});

export const mapFlashcardRowToDTO = (row: FlashcardRow): FlashcardDTO => ({
  answer: row.answer,
  choices: row.choices ?? undefined,
  correctChoiceId: row.correct_choice_id ?? undefined,
  deckId: row.deck_id,
  difficulty: row.difficulty,
  explanation: row.explanation ?? undefined,
  id: row.id,
  position: row.position,
  question: row.question,
  sourceChunkId: row.source_chunk_id ?? undefined,
  sourcePage: row.source_page ?? undefined,
  sourceSection: row.source_section ?? undefined,
  topic: row.topic ?? undefined,
  type: row.type,
});
