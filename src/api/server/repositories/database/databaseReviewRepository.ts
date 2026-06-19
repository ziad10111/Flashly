import type { CardReviewStateDTO, CreateReviewSessionResponse } from "@/api/contracts";
import type { PoolClient } from "pg";
import {
  DECK_COMPLETION_THRESHOLD,
  XP_PER_KNOWN_CARD,
  XP_PER_REVIEW_AGAIN_CARD,
} from "../../reviewRules";
import type { ServerReviewRepository } from "../types";
import { ensureDatabaseUser, withDatabaseTransaction } from "./utils";

export const databaseReviewRepository: ServerReviewRepository = {
  createReviewSession: (metadata, context) =>
    withDatabaseTransaction("reviewSessions.createReviewSession", async (client): Promise<CreateReviewSessionResponse> => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly", client);
      const existing = await client.query<ReviewSessionRow>(
        `
          SELECT *
          FROM review_sessions
          WHERE user_id = $1 AND idempotency_key = $2
          LIMIT 1
        `,
        [user.id, metadata.idempotencyKey],
      );

      if (existing.rows[0]) {
        return buildExistingSessionResponse(client, user.id, existing.rows[0]);
      }

      const knownCount = metadata.reviews.filter((review) => review.answer === "known").length;
      const unknownCount = metadata.reviews.length - knownCount;
      const xpEarned = knownCount * XP_PER_KNOWN_CARD + unknownCount * XP_PER_REVIEW_AGAIN_CARD;
      const session = (await client.query<ReviewSessionRow>(
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        [
          user.id,
          metadata.deckId,
          metadata.idempotencyKey,
          metadata.mode,
          metadata.reviews.length,
          knownCount,
          unknownCount,
          xpEarned,
          metadata.startedAt,
          metadata.completedAt,
        ],
      )).rows[0];

      for (const review of metadata.reviews) {
        await client.query(
          `
            INSERT INTO review_answers (user_id, session_id, deck_id, card_id, answer, answered_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [user.id, session.id, metadata.deckId, review.cardId, review.answer, review.answeredAt],
        );
      }

      const cardStates: CardReviewStateDTO[] = [];

      for (const review of metadata.reviews) {
        const isWeak = review.answer === "again";
        const cardProgress = (await client.query<CardProgressRow>(
          `
            INSERT INTO progress (
              user_id,
              deck_id,
              card_id,
              scope,
              review_count,
              known_count,
              unknown_count,
              is_weak,
              last_reviewed_at,
              next_review_at
            )
            VALUES (
              $1,
              $2,
              $3,
              'card',
              1,
              $4,
              $5,
              $6,
              $7,
              $8
            )
            ON CONFLICT (user_id, card_id) WHERE scope = 'card'
            DO UPDATE SET
              review_count = progress.review_count + 1,
              known_count = progress.known_count + EXCLUDED.known_count,
              unknown_count = progress.unknown_count + EXCLUDED.unknown_count,
              is_weak = EXCLUDED.is_weak,
              last_reviewed_at = EXCLUDED.last_reviewed_at,
              next_review_at = EXCLUDED.next_review_at,
              updated_at = now()
            RETURNING *
          `,
          [
            user.id,
            metadata.deckId,
            review.cardId,
            review.answer === "known" ? 1 : 0,
            review.answer === "again" ? 1 : 0,
            isWeak,
            review.answeredAt,
            isWeak ? new Date(Date.parse(review.answeredAt) + 24 * 60 * 60 * 1000).toISOString() : null,
          ],
        )).rows[0];

        cardStates.push(mapCardProgress(cardProgress));
      }

      const deckCardCount = await getDeckCardCount(client, metadata.deckId, user.id);
      const reviewedUniqueCount = await getReviewedCardCount(client, metadata.deckId, user.id);
      const weakCardIds = cardStates.filter((state) => state.isWeak).map((state) => state.cardId);
      const deckCompletionPercentage =
        deckCardCount > 0 ? Math.min(100, Math.round((reviewedUniqueCount / deckCardCount) * 100)) : 0;
      const completedDeck = deckCompletionPercentage / 100 >= DECK_COMPLETION_THRESHOLD;
      const deckProgress = (await client.query<DeckProgressRow>(
        `
          INSERT INTO progress (
            user_id,
            deck_id,
            scope,
            reviewed_card_count,
            weak_card_count,
            total_xp,
            completion_percentage,
            completed_at,
            last_reviewed_at
          )
          VALUES ($1, $2, 'deck', $3, $4, $5, $6, $7, $8)
          ON CONFLICT (user_id, deck_id) WHERE scope = 'deck'
          DO UPDATE SET
            reviewed_card_count = EXCLUDED.reviewed_card_count,
            weak_card_count = EXCLUDED.weak_card_count,
            total_xp = progress.total_xp + EXCLUDED.total_xp,
            completion_percentage = EXCLUDED.completion_percentage,
            completed_at = COALESCE(progress.completed_at, EXCLUDED.completed_at),
            last_reviewed_at = EXCLUDED.last_reviewed_at,
            updated_at = now()
          RETURNING *
        `,
        [
          user.id,
          metadata.deckId,
          reviewedUniqueCount,
          await getWeakCardCount(client, metadata.deckId, user.id),
          xpEarned,
          deckCompletionPercentage,
          completedDeck ? metadata.completedAt : null,
          metadata.completedAt,
        ],
      )).rows[0];

      await client.query(
        `
          UPDATE decks
          SET status = CASE WHEN $3 THEN 'completed' ELSE status END,
              last_reviewed_at = $2,
              updated_at = now()
          WHERE id = $1 AND user_id = $4
        `,
        [metadata.deckId, metadata.completedAt, completedDeck, user.id],
      );

      const totalProgress = (await client.query<UserProgressRow>(
        `
          INSERT INTO progress (
            user_id,
            scope,
            total_xp,
            daily_streak,
            last_activity_date,
            last_reviewed_at,
            reviewed_card_count,
            weak_card_count,
            completed_deck_count,
            generated_deck_count
          )
          VALUES ($1, 'user', $2, 1, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (user_id) WHERE scope = 'user'
          DO UPDATE SET
            total_xp = progress.total_xp + EXCLUDED.total_xp,
            daily_streak = GREATEST(progress.daily_streak, 1),
            last_activity_date = EXCLUDED.last_activity_date,
            last_reviewed_at = EXCLUDED.last_reviewed_at,
            reviewed_card_count = (
              SELECT COUNT(DISTINCT card_id)::integer
              FROM progress
              WHERE user_id = $1 AND scope = 'card' AND review_count > 0
            ),
            weak_card_count = (
              SELECT COUNT(*)::integer
              FROM progress
              WHERE user_id = $1 AND scope = 'card' AND is_weak = true
            ),
            completed_deck_count = (
              SELECT COUNT(*)::integer
              FROM progress
              WHERE user_id = $1 AND scope = 'deck' AND completion_percentage >= 100
            ),
            generated_deck_count = EXCLUDED.generated_deck_count,
            updated_at = now()
          RETURNING *
        `,
        [
          user.id,
          xpEarned,
          metadata.completedAt.slice(0, 10),
          metadata.completedAt,
          reviewedUniqueCount,
          await getWeakCardCount(client, metadata.deckId, user.id),
          completedDeck ? 1 : 0,
          await getGeneratedDeckCount(client, user.id),
        ],
      )).rows[0];

      return {
        cardStates,
        cardsReviewed: metadata.reviews.length,
        completedAt: metadata.completedAt,
        completedDeck,
        dailyStreak: totalProgress.daily_streak,
        deckCompletionPercentage: Number(deckProgress.completion_percentage),
        deckId: metadata.deckId,
        knownCount,
        mode: metadata.mode,
        reviewedCardIds: metadata.reviews.map((review) => review.cardId),
        retryable: false,
        sessionId: session.id,
        startedAt: metadata.startedAt,
        totalXp: totalProgress.total_xp,
        unknownCount,
        weakCardCount: await getWeakCardCount(client, metadata.deckId, user.id),
        weakCardIds,
        xpEarned,
      };
    }),
};

type ReviewSessionRow = {
  id: string;
  deck_id: string;
  mode: CreateReviewSessionResponse["mode"];
  cards_reviewed: number;
  known_count: number;
  unknown_count: number;
  xp_earned: number;
  started_at: Date | string;
  completed_at: Date | string;
};

type CardProgressRow = {
  card_id: string;
  deck_id: string;
  review_count: number;
  known_count: number;
  unknown_count: number;
  is_weak: boolean;
  last_reviewed_at: Date | string | null;
  next_review_at: Date | string | null;
};

type DeckProgressRow = {
  completion_percentage: number | string;
};

type UserProgressRow = {
  daily_streak: number;
  total_xp: number;
};

const getDeckCardCount = async (client: PoolClient, deckId: string, userId: string) => {
  const result = await client.query("SELECT card_count FROM decks WHERE id = $1 AND user_id = $2", [deckId, userId]);

  return Number(result.rows[0]?.card_count ?? 0);
};

const getReviewedCardCount = async (client: PoolClient, deckId: string, userId: string) => {
  const result = await client.query(
    "SELECT COUNT(DISTINCT card_id)::integer AS count FROM progress WHERE deck_id = $1 AND user_id = $2 AND scope = 'card' AND review_count > 0",
    [deckId, userId],
  );

  return Number(result.rows[0]?.count ?? 0);
};

const getWeakCardCount = async (client: PoolClient, deckId: string, userId: string) => {
  const result = await client.query(
    "SELECT COUNT(*)::integer AS count FROM progress WHERE deck_id = $1 AND user_id = $2 AND scope = 'card' AND is_weak = true",
    [deckId, userId],
  );

  return Number(result.rows[0]?.count ?? 0);
};

const getGeneratedDeckCount = async (client: PoolClient, userId: string) => {
  const result = await client.query("SELECT COUNT(*)::integer AS count FROM decks WHERE user_id = $1", [userId]);

  return Number(result.rows[0]?.count ?? 0);
};

const mapCardProgress = (row: CardProgressRow): CardReviewStateDTO => ({
  cardId: row.card_id,
  deckId: row.deck_id,
  isWeak: row.is_weak,
  knownCount: row.known_count,
  lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at).toISOString() : undefined,
  nextReviewAt: row.next_review_at ? new Date(row.next_review_at).toISOString() : undefined,
  reviewCount: row.review_count,
  unknownCount: row.unknown_count,
});

const buildExistingSessionResponse = async (
  client: PoolClient,
  userId: string,
  session: ReviewSessionRow,
): Promise<CreateReviewSessionResponse> => {
  const answers = await client.query(
    "SELECT card_id, answer FROM review_answers WHERE session_id = $1 AND user_id = $2 ORDER BY created_at ASC",
    [session.id, userId],
  );
  const cardStatesResult = await client.query<CardProgressRow>(
    "SELECT * FROM progress WHERE deck_id = $1 AND user_id = $2 AND scope = 'card'",
    [session.deck_id, userId],
  );
  const totalProgress = await client.query<UserProgressRow>(
    "SELECT total_xp, daily_streak FROM progress WHERE user_id = $1 AND scope = 'user'",
    [userId],
  );
  const deckProgress = await client.query<DeckProgressRow>(
    "SELECT completion_percentage FROM progress WHERE deck_id = $1 AND user_id = $2 AND scope = 'deck'",
    [session.deck_id, userId],
  );
  const cardStates = cardStatesResult.rows.map(mapCardProgress);
  const weakCardIds = cardStates.filter((state) => state.isWeak).map((state) => state.cardId);

  return {
    cardStates,
    cardsReviewed: session.cards_reviewed,
    completedAt: new Date(session.completed_at).toISOString(),
    completedDeck: Number(deckProgress.rows[0]?.completion_percentage ?? 0) / 100 >= DECK_COMPLETION_THRESHOLD,
    dailyStreak: totalProgress.rows[0]?.daily_streak ?? 0,
    deckCompletionPercentage: Number(deckProgress.rows[0]?.completion_percentage ?? 0),
    deckId: session.deck_id,
    knownCount: session.known_count,
    mode: session.mode,
    reviewedCardIds: answers.rows.map((row: { card_id: string }) => row.card_id),
    retryable: false,
    sessionId: session.id,
    startedAt: new Date(session.started_at).toISOString(),
    totalXp: totalProgress.rows[0]?.total_xp ?? session.xp_earned,
    unknownCount: session.unknown_count,
    weakCardCount: weakCardIds.length,
    weakCardIds,
    xpEarned: session.xp_earned,
  };
};
