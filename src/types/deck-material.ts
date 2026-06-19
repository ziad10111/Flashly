import type { ImageSourcePropType } from "react-native";

export type DeckMaterialStatus =
  | "new"
  | "processing"
  | "ready"
  | "generating"
  | "in-progress"
  | "partial-error"
  | "weak-cards"
  | "completed";

export type DeckMaterialSourceType =
  | "pdf"
  | "lecture-notes"
  | "scanned-pages"
  | "image"
  | "handwritten-notes"
  | "text-document"
  | "uploaded-material";

export type DeckMaterial = {
  id: string;
  title: string;
  sourceType: DeckMaterialSourceType;
  sourceLabel: string;
  fileName: string;
  cardCount: number;
  reviewedCount: number;
  progress: number;
  status: DeckMaterialStatus;
  weakCardCount: number;
  xpEarned: number;
  lastReviewedDate: string | null;
  extractionStatus: "not-started" | "extracting" | "ocr-needed" | "generated" | "complete";
  thumbnail: ImageSourcePropType;
  accentColor: string;
  tintColor: string;
};
