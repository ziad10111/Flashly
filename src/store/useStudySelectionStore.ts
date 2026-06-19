import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { studyTypes } from "@/data/studyTypes";
import type { StudyType } from "@/types/study";

type StudySelectionState = {
  hasHydrated: boolean;
  selectedStudyType: StudyType | null;
  selectedStudyTypeId: string | null;
  clearSelectedStudyType: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  setSelectedStudyType: (studyType: StudyType) => void;
};

type PersistedStudySelection = Pick<StudySelectionState, "selectedStudyTypeId">;

const getStudyTypeById = (studyTypeId: string | null) =>
  studyTypeId ? studyTypes.find((studyType) => studyType.id === studyTypeId) ?? null : null;

export const useStudySelectionStore = create<StudySelectionState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      selectedStudyType: null,
      selectedStudyTypeId: null,
      clearSelectedStudyType: () =>
        set({
          selectedStudyType: null,
          selectedStudyTypeId: null,
        }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setSelectedStudyType: (studyType) =>
        set({
          selectedStudyType: studyType,
          selectedStudyTypeId: studyType.id,
        }),
    }),
    {
      name: "study-selection-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state): PersistedStudySelection => ({
        selectedStudyTypeId: state.selectedStudyTypeId,
      }),
      merge: (persistedState, currentState) => {
        const persistedSelection = (persistedState as Partial<PersistedStudySelection> | undefined) ?? {};
        const selectedStudyTypeId = persistedSelection.selectedStudyTypeId ?? null;

        return {
          ...currentState,
          ...persistedSelection,
          selectedStudyType: getStudyTypeById(selectedStudyTypeId),
          selectedStudyTypeId,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
