import type { Flashcard } from "@/types/learning";

const templateGeneratedCardMarkers = [
  "Define the key term mentioned in the uploaded material.",
  "A key term is the important concept the material expects you to remember.",
  "Real AI generation will replace this template with a term grounded in extracted text.",
] as const;

export const isTemplateGeneratedCard = (card: Pick<Flashcard, "answer" | "explanation" | "question">) =>
  templateGeneratedCardMarkers.some(
    (marker) => card.question === marker || card.answer === marker || card.explanation === marker,
  );

export const filterTemplateGeneratedCards = (cards: Flashcard[]) =>
  cards.filter((card) => !isTemplateGeneratedCard(card));
