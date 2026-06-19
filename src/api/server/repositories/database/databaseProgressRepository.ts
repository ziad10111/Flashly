import type { ProgressResponse } from "@/api/contracts";
import { queryPostgres } from "../../database";
import type { ServerProgressRepository } from "../types";
import { ensureDatabaseUser, toDateString, toIsoString, withDatabaseRepositoryError } from "./utils";

export const databaseProgressRepository: ServerProgressRepository = {
  getProgress: (context) =>
    withDatabaseRepositoryError("progress.getProgress", async (): Promise<ProgressResponse> => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly");
      const result = await queryPostgres<ProgressRow>(
        `
          SELECT *
          FROM progress
          WHERE user_id = $1
        `,
        [user.id],
      );
      const userProgress = result.rows.find((row) => row.scope === "user");
      const completedDeckIds = result.rows
        .filter((row) => row.scope === "deck" && Number(row.completion_percentage) >= 100 && row.deck_id)
        .map((row) => row.deck_id as string);
      const weakCardIds = result.rows
        .filter((row) => row.scope === "card" && row.is_weak && row.card_id)
        .map((row) => row.card_id as string);

      return {
        completedDeckIds,
        dailyStreak: userProgress?.daily_streak ?? 0,
        generatedDeckCount: userProgress?.generated_deck_count ?? 0,
        lastActivityDate: toDateString(userProgress?.last_activity_date),
        lastReviewedAt: toIsoString(userProgress?.last_reviewed_at),
        reviewedCardCount: userProgress?.reviewed_card_count ?? 0,
        totalXp: userProgress?.total_xp ?? 0,
        weakCardCount: userProgress?.weak_card_count ?? weakCardIds.length,
        weakCardIds,
      };
    }),
};

type ProgressRow = {
  scope: "user" | "deck" | "card";
  deck_id: string | null;
  card_id: string | null;
  total_xp: number;
  daily_streak: number;
  last_activity_date: Date | string | null;
  last_reviewed_at: Date | string | null;
  reviewed_card_count: number;
  weak_card_count: number;
  generated_deck_count: number;
  completion_percentage: number | string;
  is_weak: boolean;
};
