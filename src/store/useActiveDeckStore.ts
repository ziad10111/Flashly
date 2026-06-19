import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { deckMaterials } from "@/data/deckMaterials";

type ActiveDeckState = {
  activeDeckId: string;
  hasHydrated: boolean;
  setActiveDeckId: (deckId: string) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
};

type PersistedActiveDeckState = Pick<ActiveDeckState, "activeDeckId">;

const defaultDeck = deckMaterials[0];

export const useActiveDeckStore = create<ActiveDeckState>()(
  persist(
    (set) => ({
      activeDeckId: defaultDeck.id,
      hasHydrated: false,
      setActiveDeckId: (deckId) => set({ activeDeckId: deckId }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "active-deck-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state): PersistedActiveDeckState => ({
        activeDeckId: state.activeDeckId,
      }),
      merge: (persistedState, currentState) => {
        const persistedActiveDeck = (persistedState as Partial<PersistedActiveDeckState> | undefined) ?? {};
        const activeDeckId = persistedActiveDeck.activeDeckId ?? defaultDeck.id;

        return {
          ...currentState,
          activeDeckId,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
