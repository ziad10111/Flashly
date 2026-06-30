import { useEffect, useState } from "react";

import { getDecks } from "@/api/repositories/deckRepository";
import { getActiveGenerationJobs } from "@/api/repositories/generationJobRepository";
import { getProgressSummary } from "@/api/repositories/progressRepository";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";
import { useFlashlyUploadStore } from "@/store/useFlashlyUploadStore";
import type { DeckDTO, ProgressResponse } from "@/api/contracts";

type DeckRepositoryState = {
  decks: DeckDTO[];
  errorMessage: string | null;
  progress: ProgressResponse | null;
  status: "loading" | "success" | "empty" | "error";
};

export function useFlashlyDecks() {
  const generatedDecks = useFlashlyUploadStore((state) => state.generatedDecks);
  const generatedCardsByDeckId = useFlashlyUploadStore((state) => state.generatedCardsByDeckId);
  const deckProgressById = useFlashlyProgressStore((state) => state.deckProgressById);
  const deletedDeckIds = useFlashlyProgressStore((state) => state.deletedDeckIds);
  const totalXp = useFlashlyProgressStore((state) => state.totalXp);
  const dailyStreak = useFlashlyProgressStore((state) => state.dailyStreak);
  const completedDeckIds = useFlashlyProgressStore((state) => state.completedDeckIds);
  const [state, setState] = useState<DeckRepositoryState>({
    decks: [],
    errorMessage: null,
    progress: null,
    status: "loading",
  });

  useEffect(() => {
    let isMounted = true;

    const loadDecks = async () => {
      setState((current) => ({
        ...current,
        errorMessage: null,
        status: current.decks.length > 0 ? current.status : "loading",
      }));

      try {
        const [deckResponse, progressResponse] = await Promise.all([getDecks(), getProgressSummary()]);
        const activeJobsResponse = await getActiveGenerationJobs().catch(() => ({ jobs: [] }));

        if (!isMounted) {
          return;
        }

        for (const job of activeJobsResponse.jobs) {
          useFlashlyUploadStore.getState().syncGenerationJob(job);
        }

        setState({
          decks: deckResponse.decks,
          errorMessage: null,
          progress: progressResponse,
          status: deckResponse.decks.length > 0 ? "success" : "empty",
        });
      } catch {
        if (!isMounted) {
          return;
        }

        setState((current) => ({
          ...current,
          errorMessage: "Could not load local deck data.",
          status: "error",
        }));
      }
    };

    loadDecks();

    return () => {
      isMounted = false;
    };
  }, [completedDeckIds, dailyStreak, deckProgressById, deletedDeckIds, generatedCardsByDeckId, generatedDecks, totalXp]);

  return state;
}
