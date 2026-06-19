import type { DeckDTO } from "@/api/contracts";
import { MAX_SOURCE_TEXT_INPUT_LENGTH, MIN_SOURCE_TEXT_INPUT_LENGTH } from "@/api/contracts";

export { MAX_SOURCE_TEXT_INPUT_LENGTH, MIN_SOURCE_TEXT_INPUT_LENGTH };

export const MAX_EXTRACTED_TEXT_PREVIEW_LENGTH = 60_000;

export const MOCK_EXTRACTED_TEXT_LENGTH = 1240;

export const MOCK_EXTRACTED_PAGE_COUNT = 4;

export const SUPPORTED_EXTRACTION_SOURCE_TYPES: DeckDTO["sourceType"][] = ["pdf", "image", "text", "document"];
