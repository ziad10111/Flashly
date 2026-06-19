import type { FlashcardChoiceDTO, FlashcardDifficultyDTO, FlashcardDTO, FlashcardTypeDTO } from "@/api/contracts";
import {
  MAX_FLASHCARD_ANSWER_LENGTH,
  MAX_FLASHCARD_QUESTION_LENGTH,
} from "../generationLimits";
import { GenerationServiceFailureError } from "./types";

type UnknownRecord = Record<string, unknown>;

export type RawFlashcard = {
  answer: string;
  choices?: FlashcardChoiceDTO[];
  correctChoiceId?: string;
  difficulty?: FlashcardDifficultyDTO;
  explanation?: string;
  question: string;
  topic?: string;
  type?: FlashcardTypeDTO;
};

const difficultyValues = new Set<FlashcardDifficultyDTO>(["easy", "medium", "hard"]);

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asTrimmedString = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
};

const normalizeQuestionKey = (question: string) => question.toLowerCase().replace(/\s+/g, " ").trim();

const normalizeChoiceKey = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

const normalizeChoiceLabel = (value: string, index: number) => value.trim() || String.fromCharCode(65 + index);

const getChoiceLetter = (index: number) => String.fromCharCode(65 + index);

const parseChoices = (value: unknown): FlashcardChoiceDTO[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const choices: FlashcardChoiceDTO[] = [];
  const seenTexts = new Set<string>();

  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }

    const id = getChoiceLetter(choices.length);
    const label = normalizeChoiceLabel(asTrimmedString(item.label, 8) ?? id, choices.length);
    const text = asTrimmedString(item.text, MAX_FLASHCARD_ANSWER_LENGTH);
    const textKey = text ? normalizeChoiceKey(text) : "";

    if (!id || !text || seenTexts.has(textKey)) {
      return null;
    }

    seenTexts.add(textKey);
    choices.push({ id, label, text });

    if (choices.length === 4) {
      break;
    }
  }

  return choices.length === 4 ? choices : null;
};

const normalizeMcqFields = (card: UnknownRecord, answer: string) => {
  if (card.type !== "mcq") {
    return null;
  }

  const choices = parseChoices(card.choices);
  const correctChoiceId = asTrimmedString(card.correctChoiceId, 24)?.toUpperCase();

  if (!choices || !correctChoiceId || !choices.some((choice) => choice.id === correctChoiceId)) {
    return null;
  }

  const correctChoice = choices.find((choice) => choice.id === correctChoiceId);

  if (!correctChoice) {
    return null;
  }

  return {
    answer: correctChoice.text,
    choices,
    correctChoiceId,
    type: "mcq" as const,
  };
};

const getRawFlashcardArray = (parsed: unknown): unknown[] => {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (isRecord(parsed) && Array.isArray(parsed.flashcards)) {
    return parsed.flashcards;
  }

  if (isRecord(parsed) && Array.isArray(parsed.cards)) {
    return parsed.cards;
  }

  throw new GenerationServiceFailureError(
    "processing-failed",
    "AI flashcard output was not valid JSON with a flashcards or cards array.",
  );
};

const stripMarkdownCodeFence = (value: string) =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

const extractJsonCandidate = (value: string) => {
  const stripped = stripMarkdownCodeFence(value);

  try {
    JSON.parse(stripped);
    return stripped;
  } catch {
    // Continue to balanced-object extraction below.
  }

  const firstBrace = stripped.indexOf("{");
  const firstBracket = stripped.indexOf("[");
  const start =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
        ? firstBrace
        : Math.min(firstBrace, firstBracket);

  if (start === -1) {
    return stripped;
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < stripped.length; index += 1) {
    const char = stripped[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
    } else if (char === "}" || char === "]") {
      const expectedClose = stack.pop();

      if (expectedClose !== char) {
        return stripped;
      }

      if (stack.length === 0) {
        return stripped.slice(start, index + 1);
      }
    }
  }

  return stripped;
};

export const parseAiFlashcardJson = (jsonText: string): RawFlashcard[] => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJsonCandidate(jsonText));
  } catch {
    throw new GenerationServiceFailureError("processing-failed", "AI flashcard output was not valid JSON.");
  }

  return getRawFlashcardArray(parsed)
    .map((card): RawFlashcard | null => {
      if (!isRecord(card)) {
        return null;
      }

      const question = asTrimmedString(card.question, MAX_FLASHCARD_QUESTION_LENGTH);
      const answer = asTrimmedString(card.answer, MAX_FLASHCARD_ANSWER_LENGTH);

      if (!question || !answer) {
        return null;
      }

      const explanation = asTrimmedString(card.explanation, MAX_FLASHCARD_ANSWER_LENGTH);
      const topic = asTrimmedString(card.topic, 80);
      const difficulty = difficultyValues.has(card.difficulty as FlashcardDifficultyDTO)
        ? (card.difficulty as FlashcardDifficultyDTO)
        : undefined;
      const mcqFields = normalizeMcqFields(card, answer);

      if (!mcqFields) {
        return null;
      }

      return {
        answer: mcqFields.answer ?? answer,
        choices: mcqFields.choices,
        correctChoiceId: mcqFields.correctChoiceId,
        difficulty,
        explanation: explanation ?? undefined,
        question,
        topic: topic ?? undefined,
        type: mcqFields.type,
      };
    })
    .filter((card): card is RawFlashcard => card !== null);
};

export const buildValidatedFlashcards = ({
  deckId,
  defaultDifficulty,
  idPrefix,
  positionOffset = 0,
  rawCards,
  requestedCardCount,
}: {
  deckId: string;
  defaultDifficulty?: FlashcardDifficultyDTO;
  idPrefix: string;
  positionOffset?: number;
  rawCards: RawFlashcard[];
  requestedCardCount: number;
}): FlashcardDTO[] => {
  const seenQuestions = new Set<string>();
  const cards: FlashcardDTO[] = [];

  for (const rawCard of rawCards) {
    const questionKey = normalizeQuestionKey(rawCard.question);

    if (seenQuestions.has(questionKey)) {
      continue;
    }

    seenQuestions.add(questionKey);
    cards.push({
      id: `${idPrefix}-${positionOffset + cards.length + 1}`,
      deckId,
      type: "mcq",
      question: rawCard.question,
      answer: rawCard.answer,
      explanation: rawCard.explanation,
      difficulty: rawCard.difficulty ?? defaultDifficulty ?? "medium",
      topic: rawCard.topic,
      choices: rawCard.choices,
      correctChoiceId: rawCard.correctChoiceId,
      position: positionOffset + cards.length,
    });

    if (cards.length >= requestedCardCount) {
      break;
    }
  }

  if (cards.length === 0) {
    throw new GenerationServiceFailureError("processing-failed", "AI did not return any valid flashcards.");
  }

  return cards;
};
