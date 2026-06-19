import type { FlashcardChoiceDTO } from "@/api/contracts";

import { queryPostgres } from "../../database";
import type { ServerFlashcardRepository } from "../types";
import { ensureDatabaseUser, toIsoString, withDatabaseRepositoryError } from "./utils";

export const databaseFlashcardRepository: ServerFlashcardRepository = {
  getFlashcardsByDeckId: (deckId, context) =>
    withDatabaseRepositoryError("flashcards.getFlashcardsByDeckId", async () => {
      const user = await ensureDatabaseUser(context?.userId ?? "mock-clerk-user-flashly");
      const result = await queryPostgres<FlashcardRow>(
        `
          SELECT *
          FROM flashcards
          WHERE deck_id = $1 AND user_id = $2
          ORDER BY position ASC
        `,
        [deckId, user.id],
      );

      return result.rows.map((row) => ({
        answer: row.answer,
        choices: row.choices ?? undefined,
        correctChoiceId: row.correct_choice_id ?? undefined,
        createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
        deckId: row.deck_id,
        difficulty: row.difficulty,
        explanation: row.explanation ?? undefined,
        id: row.id,
        materialId: row.material_id ?? undefined,
        position: row.position,
        question: row.question,
        sourceChunkId: row.source_chunk_id ?? undefined,
        sourcePage: row.source_page ?? undefined,
        sourceSection: row.source_section ?? undefined,
        topic: row.topic ?? undefined,
        updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
        userId: row.user_id,
      }));
    }),
};

type FlashcardRow = {
  id: string;
  user_id: string;
  deck_id: string;
  material_id: string | null;
  source_chunk_id: string | null;
  question: string;
  answer: string;
  explanation: string | null;
  difficulty: "easy" | "medium" | "hard";
  topic: string | null;
  choices: FlashcardChoiceDTO[] | null;
  correct_choice_id: string | null;
  source_page: number | null;
  source_section: string | null;
  position: number;
  created_at: Date | string;
  updated_at: Date | string;
};
