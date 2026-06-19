import type { ReviewModeDTO } from "@/api/contracts";

export const XP_PER_KNOWN_CARD = 7;

export const XP_PER_REVIEW_AGAIN_CARD = 2;

export const MOCK_STARTING_TOTAL_XP = 120;

export const MOCK_DAILY_STREAK = 5;

export const DECK_COMPLETION_THRESHOLD = 1;

export const SUPPORTED_REVIEW_MODES: ReviewModeDTO[] = ["full-deck", "weak-cards", "quick-review"];
