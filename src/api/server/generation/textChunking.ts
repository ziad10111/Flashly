import {
  MAX_GENERATION_CHARS_PER_REQUEST,
  MAX_MCQ_BLOCKS_PER_BATCH,
} from "../generationLimits";

export type GenerationTextChunk = {
  chunkIndex: number;
  estimatedQuestionCount?: number;
  sourceEnd?: number;
  sourceStart?: number;
  text: string;
};

export type DetectedMcqChoice = {
  id: string;
  text: string;
};

export type DetectedMcqBlock = {
  choices: DetectedMcqChoice[];
  confidence: "high" | "medium" | "low";
  correctChoiceId?: string;
  index: number;
  question: string;
  rawText: string;
  sourceEnd: number;
  sourcePage?: number;
  sourceStart: number;
  text: string;
};

export type McqDetectionDiagnostics = {
  acceptedPreviews: string[];
  acceptedSourceBlocks: number;
  candidateBlocksBuilt: number;
  candidateQuestionStarts: number;
  expectedCardCount: number;
  mode: "standard" | "ocr-tolerant" | "plain-text";
  normalizedLines: number;
  questionStartPreviews: string[];
  rawOcrChars: number;
  rejectedPreviews: string[];
  rejectedSourceBlocks: number;
  rejectionReasons: Record<string, number>;
};

type NormalizedLine = {
  page?: number;
  sourceStart: number;
  text: string;
};

type QuestionStart = {
  choices: DetectedMcqChoice[];
  index: number;
  question: string;
};

type CandidateBlock = {
  choices: (DetectedMcqChoice & { labeled: boolean })[];
  index: number;
  page?: number;
  question: string;
  rawLines: string[];
  sourceStart: number;
};

const choiceIds = ["A", "B", "C", "D", "E"];

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const isDevelopmentRuntime = () =>
  typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";

const logMcqDetection = (payload: Record<string, unknown>) => {
  if (isDevelopmentRuntime()) {
    console.info("[MCQ Detection]", payload);
  }
};

const incrementReason = (reasons: Record<string, number>, reason: string) => {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
};

const normalizeOcrLine = (value: string) =>
  value
    .replace(/[|â€¢Â·•·]+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const pageSeparatorPattern = /^---\s*Page\s+(\d+)\s*---$/i;

const isLikelyHeaderOrFooter = (line: string) =>
  pageSeparatorPattern.test(line) ||
  /^page\s+\d+\s+(?:of|\/)\s+\d+$/i.test(line) ||
  /^page\s+\d+$/i.test(line) ||
  /^(candidate name|version|date|date of test|nationality|position applied for|venue)$/i.test(line) ||
  /^(guidelines for your strict compliance|multiple choice|answer sheet)$/i.test(line) ||
  /maaden aluminum company/i.test(line) ||
  /certified maintenance\s*&?\s*reliability professional/i.test(line) ||
  /reliability engineering\/certified maintenance/i.test(line) ||
  /^reliability engineering$/i.test(line);

const normalizeSourceLines = (sourceText: string) => {
  const lines: NormalizedLine[] = [];
  let cursor = 0;
  let currentPage: number | undefined;

  for (const rawLine of sourceText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    const sourceStart = cursor;
    cursor += rawLine.length + 1;
    const line = normalizeOcrLine(rawLine);

    if (!line) {
      continue;
    }

    const pageMatch = line.match(pageSeparatorPattern);

    if (pageMatch) {
      currentPage = Number.parseInt(pageMatch[1], 10);
      continue;
    }

    if (isLikelyHeaderOrFooter(line)) {
      continue;
    }

    lines.push({
      page: currentPage,
      sourceStart,
      text: line,
    });
  }

  return lines;
};

const questionLeadPattern =
  /^(?:what|which|when|who|why|how|for|in|the|a|an|to|during|regarding|select|choose|identify|where|if|as|based|of|preventive|maintenance|reliability|failure|asset|risk|work|planning|inspection|condition|root|most|least|best)\b/i;

const hasQuestionIntent = (body: string) =>
  /[?ØŸ]/.test(body) ||
  questionLeadPattern.test(body) ||
  /\b(which of the following|what is|what are|the primary purpose|the most|the least|is to|should be)\b/i.test(body);

const isFalseQuestionNumber = (index: number, body: string) => {
  if (index < 1 || index > 250) {
    return true;
  }

  if (/^(?:of|\/)\s+\d+/.test(body)) {
    return true;
  }

  if (/^\d+(?:\.\d+)?\s*%/.test(body)) {
    return true;
  }

  return false;
};

const choiceMarkerPattern = /(?:^|\s)(?:[oO0]\s*)?([A-E])\s*[\.)\-:]?\s*/g;

const splitInlineChoices = (text: string) => {
  const matches: { id: string; index: number; markerEnd: number }[] = [];
  let match: RegExpExecArray | null;
  choiceMarkerPattern.lastIndex = 0;

  while ((match = choiceMarkerPattern.exec(text)) !== null) {
    const marker = match[0];
    const nextChar = text[choiceMarkerPattern.lastIndex] ?? "";
    const previousChar = text[Math.max(0, match.index - 1)] ?? " ";

    if (/[a-z0-9]/.test(previousChar) || !nextChar || !/[A-Z0-9"'(]/.test(nextChar)) {
      continue;
    }

    matches.push({
      id: match[1].toUpperCase(),
      index: match.index + (marker.startsWith(" ") ? 1 : 0),
      markerEnd: choiceMarkerPattern.lastIndex,
    });
  }

  if (matches.length < 2) {
    return {
      choices: [] as DetectedMcqChoice[],
      leadingText: text,
    };
  }

  const choices = matches
    .map((current, index) => {
      const next = matches[index + 1];
      const choiceText = normalizeWhitespace(text.slice(current.markerEnd, next?.index ?? text.length));

      return choiceText
        ? {
            id: current.id,
            text: choiceText,
          }
        : null;
    })
    .filter((choice): choice is DetectedMcqChoice => choice !== null);

  return {
    choices,
    leadingText: normalizeWhitespace(text.slice(0, matches[0].index)),
  };
};

const parseQuestionStart = (line: string): QuestionStart | null => {
  const match =
    line.match(/^(\d{1,3})\s*[-.)]\s*(.{8,})$/) ??
    line.match(/^(\d{1,3})\s+(.{12,})$/);

  if (!match) {
    return null;
  }

  const index = Number.parseInt(match[1], 10);
  const inline = splitInlineChoices(normalizeWhitespace(match[2]));
  const body = inline.leadingText || normalizeWhitespace(match[2]);

  if (!body || isFalseQuestionNumber(index, body)) {
    return null;
  }

  if (!hasQuestionIntent(body) && body.length < 28) {
    return null;
  }

  return {
    choices: inline.choices,
    index,
    question: body,
  };
};

const parseChoiceLine = (line: string): (DetectedMcqChoice & { labeled: boolean })[] => {
  const inline = splitInlineChoices(line);

  if (inline.choices.length >= 2 && !inline.leadingText) {
    return inline.choices.map((choice) => ({ ...choice, labeled: true }));
  }

  const labeled = line.match(/^(?:[oO0]\s*)?([A-E])\s*[\.)\-:]?\s*(.*)$/);

  if (labeled) {
    const text = normalizeWhitespace(labeled[2]);

    return [{
      id: labeled[1].toUpperCase(),
      labeled: true,
      text,
    }];
  }

  return [];
};

const shouldAppendToQuestion = (candidate: CandidateBlock, line: string) =>
  candidate.choices.length === 0 &&
  candidate.question.length < 180 &&
  !hasQuestionIntent(line) &&
  (line.length > 90 || /^[a-z,(]/.test(line));

const shouldAppendToPreviousChoice = (candidate: CandidateBlock, line: string) => {
  const lastChoice = candidate.choices[candidate.choices.length - 1];

  if (!lastChoice) {
    return false;
  }

  return lastChoice.labeled && (/^[a-z,(]/.test(line) || line.length > 80 || lastChoice.text.length < 18);
};

const addChoice = (candidate: CandidateBlock, choiceText: string, id?: string, labeled = false) => {
  const normalized = normalizeWhitespace(choiceText);

  if (!normalized || isLikelyHeaderOrFooter(normalized)) {
    return;
  }

  const choiceId = id ?? choiceIds[candidate.choices.length] ?? String.fromCharCode(65 + candidate.choices.length);
  candidate.choices.push({
    id: choiceId,
    labeled,
    text: normalized,
  });
};

const normalizeAcceptedChoices = (choices: CandidateBlock["choices"]) => {
  const accepted: DetectedMcqChoice[] = [];
  const seen = new Set<string>();

  for (const choice of choices) {
    const text = normalizeWhitespace(choice.text)
      .replace(/^[.)\-:]+/, "")
      .trim();
    const key = text.toLowerCase();

    if (!text || text.length < 2 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    accepted.push({
      id: choiceIds[accepted.length] ?? choice.id,
      text,
    });
  }

  return accepted.slice(0, 5);
};

const isUsableQuestion = (question: string) =>
  question.length >= 12 &&
  question.length <= 500 &&
  !isLikelyHeaderOrFooter(question) &&
  (hasQuestionIntent(question) || question.length >= 32);

const createBlockText = (block: Pick<DetectedMcqBlock, "choices" | "index" | "question" | "rawText">) =>
  [
    `${block.index}. ${block.question}`,
    ...block.choices.map((choice) => `${choice.id}. ${choice.text}`),
    "",
    "Raw OCR block:",
    block.rawText.slice(0, 1200),
  ].join("\n");

const buildOcrTolerantMcqBlocks = (sourceText: string, maxCards: number) => {
  const lines = normalizeSourceLines(sourceText);
  const blocks: DetectedMcqBlock[] = [];
  const rejected: { preview: string; reason: string }[] = [];
  const rejectionReasons: Record<string, number> = {};
  const questionStarts: string[] = [];
  const seenQuestions = new Set<string>();
  let candidateBlocksBuilt = 0;
  let current: CandidateBlock | null = null;
  let pendingQuestionNumber: { index: number; page?: number; sourceStart: number } | null = null;

  const reject = (reason: string, preview: string) => {
    incrementReason(rejectionReasons, reason);
    if (rejected.length < 10) {
      rejected.push({ preview: preview.slice(0, 220), reason });
    }
  };

  const pushCurrent = (sourceEnd: number) => {
    if (!current) {
      return;
    }

    candidateBlocksBuilt += 1;
    const question = normalizeWhitespace(current.question);
    const rawText = current.rawLines.join("\n");
    const questionKey = question.toLowerCase();
    const choices = normalizeAcceptedChoices(current.choices);

    if (!isUsableQuestion(question)) {
      reject("too_short_question", rawText);
      current = null;
      return;
    }

    if (seenQuestions.has(questionKey)) {
      reject("duplicate_question", rawText);
      current = null;
      return;
    }

    if (choices.length === 0) {
      reject("missing_choices", rawText);
      current = null;
      return;
    }

    if (choices.length < 4) {
      reject("too_few_choices", rawText);
      current = null;
      return;
    }

    const labeledChoiceCount = current.choices.filter((choice) => choice.labeled).length;
    const confidence: DetectedMcqBlock["confidence"] = labeledChoiceCount >= 4 ? "high" : choices.length >= 4 ? "medium" : "low";
    const blockDraft = {
      choices,
      confidence,
      index: current.index,
      question,
      rawText,
    };

    seenQuestions.add(questionKey);
    blocks.push({
      ...blockDraft,
      sourceEnd,
      sourcePage: current.page,
      sourceStart: current.sourceStart,
      text: createBlockText(blockDraft),
    });
    current = null;
  };

  for (const line of lines) {
    const standaloneNumber = line.text.match(/^(\d{1,3})$/);

    if (standaloneNumber) {
      const index = Number.parseInt(standaloneNumber[1], 10);

      if (index >= 1 && index <= 250) {
        pendingQuestionNumber = {
          index,
          page: line.page,
          sourceStart: line.sourceStart,
        };
        continue;
      }
    }

    const pairedQuestionStart = pendingQuestionNumber
      ? parseQuestionStart(`${pendingQuestionNumber.index}. ${line.text}`)
      : null;
    const questionStart = pairedQuestionStart ?? parseQuestionStart(line.text);

    if (questionStart) {
      pushCurrent(line.sourceStart);
      questionStarts.push(`${questionStart.index}. ${questionStart.question}`.slice(0, 180));
      current = {
        choices: questionStart.choices.map((choice) => ({ ...choice, labeled: true })),
        index: questionStart.index,
        page: pairedQuestionStart ? pendingQuestionNumber?.page : line.page,
        question: questionStart.question,
        rawLines: [pairedQuestionStart ? `${pendingQuestionNumber?.index ?? questionStart.index}. ${line.text}` : line.text],
        sourceStart: pairedQuestionStart ? pendingQuestionNumber?.sourceStart ?? line.sourceStart : line.sourceStart,
      };
      pendingQuestionNumber = null;
      continue;
    }

    pendingQuestionNumber = null;

    if (!current) {
      continue;
    }

    current.rawLines.push(line.text);
    const labeledChoices = parseChoiceLine(line.text);

    if (labeledChoices.length > 0) {
      for (const choice of labeledChoices) {
        if (!choice.text && choice.id) {
          current.choices.push({
            id: choice.id,
            labeled: true,
            text: "",
          });
        } else {
          addChoice(current, choice.text, choice.id, true);
        }
      }
      continue;
    }

    if (shouldAppendToQuestion(current, line.text)) {
      current.question = `${current.question} ${line.text}`;
      continue;
    }

    if (shouldAppendToPreviousChoice(current, line.text)) {
      const lastChoice = current.choices[current.choices.length - 1];
      lastChoice.text = normalizeWhitespace(`${lastChoice.text} ${line.text}`);
      continue;
    }

    if (current.choices.length < 6 && !parseQuestionStart(line.text)) {
      addChoice(current, line.text, undefined, false);
    }
  }

  const finalSourceEnd = sourceText.length;
  pushCurrent(finalSourceEnd);

  const diagnostics: McqDetectionDiagnostics = {
    acceptedPreviews: blocks.slice(0, 10).map((block) => block.text.slice(0, 260)),
    acceptedSourceBlocks: blocks.length,
    candidateBlocksBuilt,
    candidateQuestionStarts: questionStarts.length,
    expectedCardCount: Math.min(blocks.length, maxCards),
    mode: blocks.length > 0 ? "ocr-tolerant" : "plain-text",
    normalizedLines: lines.length,
    questionStartPreviews: questionStarts.slice(0, 10),
    rawOcrChars: sourceText.length,
    rejectedPreviews: rejected.map((item) => `${item.reason}: ${item.preview}`),
    rejectedSourceBlocks: rejected.reduce((sum) => sum + 1, 0) + Object.values(rejectionReasons).reduce((sum, count) => sum + count, 0) - rejected.length,
    rejectionReasons,
  };

  return {
    blocks: blocks.slice(0, maxCards),
    diagnostics: {
      ...diagnostics,
      acceptedSourceBlocks: Math.min(blocks.length, maxCards),
      expectedCardCount: Math.min(blocks.length, maxCards),
    },
  };
};

const detectStandardMcqBlocks = (sourceText: string, maxCards: number): DetectedMcqBlock[] => {
  const text = normalizeWhitespace(sourceText);
  const questionPattern =
    /(?:^|\s)(\d{1,3})\s*[-.)]\s*(.{20,900}?)\s+A\s*[.)]\s*(.{1,400}?)\s+B\s*[.)]\s*(.{1,400}?)\s+C\s*[.)]\s*(.{1,400}?)\s+D\s*[.)]\s*(.{1,500}?)(?=\s+\d{1,3}\s*[-.)]\s+|$)/g;
  const blocks: DetectedMcqBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = questionPattern.exec(text)) !== null && blocks.length < maxCards) {
    const question = normalizeWhitespace(match[2]);
    const choices = [match[3], match[4], match[5], match[6]].map((choice, index) => ({
      id: choiceIds[index],
      text: normalizeWhitespace(choice),
    }));

    if (!question || choices.some((choice) => choice.text.length < 1)) {
      continue;
    }

    const rawText = match[0].trim();
    const blockDraft = {
      choices,
      confidence: "high" as const,
      index: Number.parseInt(match[1], 10),
      question,
      rawText,
    };

    blocks.push({
      ...blockDraft,
      sourceEnd: questionPattern.lastIndex,
      sourceStart: match.index,
      text: createBlockText(blockDraft),
    });
  }

  return blocks;
};

export const detectMcqBlocksWithDiagnostics = (sourceText: string, maxCards: number) => {
  const standardBlocks = detectStandardMcqBlocks(sourceText, maxCards);
  const ocr = buildOcrTolerantMcqBlocks(sourceText, maxCards);
  const useStandard = standardBlocks.length >= ocr.blocks.length;
  const blocks = useStandard ? standardBlocks : ocr.blocks;
  const diagnostics: McqDetectionDiagnostics = useStandard
    ? {
        ...ocr.diagnostics,
        acceptedPreviews: standardBlocks.slice(0, 10).map((block) => block.text.slice(0, 260)),
        acceptedSourceBlocks: standardBlocks.length,
        expectedCardCount: standardBlocks.length,
        mode: standardBlocks.length > 0 ? "standard" : "plain-text",
      }
    : ocr.diagnostics;

  logMcqDetection({
    "accepted source blocks": diagnostics.acceptedSourceBlocks,
    "candidate blocks built": diagnostics.candidateBlocksBuilt,
    "candidate question starts": diagnostics.candidateQuestionStarts,
    expectedCardCount: diagnostics.expectedCardCount,
    firstBlockPreview: blocks[0]?.text.slice(0, 240) ?? null,
    mode: diagnostics.mode,
    "normalized lines": diagnostics.normalizedLines,
    "raw OCR chars": diagnostics.rawOcrChars,
    "rejected source blocks": diagnostics.rejectedSourceBlocks,
    "rejection reasons": diagnostics.rejectionReasons,
  });

  return {
    blocks,
    diagnostics,
  };
};

export const detectMcqBlocks = (sourceText: string, maxCards: number): DetectedMcqBlock[] =>
  detectMcqBlocksWithDiagnostics(sourceText, maxCards).blocks;

export const splitMcqBlocksForGeneration = (
  blocks: DetectedMcqBlock[],
  options: {
    batchSize?: number;
    maxCharsPerRequest?: number;
    startIndex?: number;
  } = {},
): GenerationTextChunk[] => {
  const maxChars = options.maxCharsPerRequest ?? MAX_GENERATION_CHARS_PER_REQUEST;
  const batchSize = Math.min(options.batchSize ?? MAX_MCQ_BLOCKS_PER_BATCH, MAX_MCQ_BLOCKS_PER_BATCH);
  const selectedBlocks = blocks.slice(options.startIndex ?? 0);
  const chunks: GenerationTextChunk[] = [];
  let currentBlocks: DetectedMcqBlock[] = [];
  let currentLength = 0;

  const pushChunk = () => {
    if (currentBlocks.length === 0) {
      return;
    }

    chunks.push({
      chunkIndex: chunks.length,
      estimatedQuestionCount: currentBlocks.length,
      sourceEnd: currentBlocks[currentBlocks.length - 1].sourceEnd,
      sourceStart: currentBlocks[0].sourceStart,
      text: currentBlocks.map((block) => JSON.stringify({
        choices: block.choices,
        confidence: block.confidence,
        correctChoiceId: block.correctChoiceId ?? null,
        question: block.question,
        rawText: block.rawText.slice(0, 1200),
        sourcePage: block.sourcePage ?? null,
      })).join("\n"),
    });
    currentBlocks = [];
    currentLength = 0;
  };

  for (const block of selectedBlocks) {
    const nextLength = currentLength + block.text.length + 2;
    const wouldExceedBatchSize = currentBlocks.length >= batchSize;
    const wouldExceedChars = currentBlocks.length > 0 && nextLength > maxChars;

    if (wouldExceedBatchSize || wouldExceedChars) {
      pushChunk();
    }

    currentBlocks.push(block);
    currentLength += block.text.length + 2;
  }

  pushChunk();

  return chunks;
};

export const splitPlainTextForGeneration = (
  sourceText: string,
  options: {
    maxCharsPerRequest?: number;
  } = {},
): GenerationTextChunk[] => {
  const maxChars = options.maxCharsPerRequest ?? MAX_GENERATION_CHARS_PER_REQUEST;
  const normalized = sourceText.replace(/\r\n/g, "\n").trim();
  const parts = normalized
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: GenerationTextChunk[] = [];
  let current = "";
  let sourceStart = 0;
  let cursor = 0;

  const pushChunk = () => {
    if (!current.trim()) {
      return;
    }

    chunks.push({
      chunkIndex: chunks.length,
      sourceEnd: sourceStart + current.length,
      sourceStart,
      text: current.trim(),
    });
    sourceStart = cursor;
    current = "";
  };

  for (const part of parts) {
    if (!current) {
      sourceStart = cursor;
    }

    if (current && current.length + part.length + 1 > maxChars) {
      pushChunk();
    }

    if (part.length > maxChars) {
      for (let index = 0; index < part.length; index += maxChars) {
        chunks.push({
          chunkIndex: chunks.length,
          sourceEnd: cursor + Math.min(index + maxChars, part.length),
          sourceStart: cursor + index,
          text: part.slice(index, index + maxChars).trim(),
        });
      }
      cursor += part.length + 1;
      current = "";
      sourceStart = cursor;
      continue;
    }

    current = current ? `${current}\n${part}` : part;
    cursor += part.length + 1;
  }

  pushChunk();

  return chunks.length > 0 ? chunks : [{ chunkIndex: 0, text: normalized.slice(0, maxChars) }];
};

export const splitExtractedTextForGeneration = (
  sourceText: string,
  options: {
    batchSize?: number;
    maxCards: number;
    maxCharsPerRequest?: number;
    startQuestionIndex?: number;
  },
) => {
  const mcqDetection = detectMcqBlocksWithDiagnostics(sourceText, options.maxCards);
  const mcqBlocks = mcqDetection.blocks;

  if (mcqBlocks.length > 0) {
    const chunks = splitMcqBlocksForGeneration(mcqBlocks, {
      batchSize: options.batchSize,
      maxCharsPerRequest: options.maxCharsPerRequest,
      startIndex: options.startQuestionIndex,
    });

    logMcqDetection({
      expectedCardCount: mcqBlocks.length,
      firstBatchCount: chunks[0]?.estimatedQuestionCount ?? 0,
      "hasMore after first batch":
        options.startQuestionIndex !== undefined && chunks[0]?.estimatedQuestionCount !== undefined
          ? options.startQuestionIndex + chunks[0].estimatedQuestionCount < mcqBlocks.length
          : chunks.length > 1,
      mode: "mcq-bank",
      nextBatchStartIndex: options.startQuestionIndex ?? 0,
    });

    return {
      chunks,
      diagnostics: mcqDetection.diagnostics,
      mcqBlocks,
    };
  }

  return {
    chunks: splitPlainTextForGeneration(sourceText, {
      maxCharsPerRequest: options.maxCharsPerRequest,
    }),
    diagnostics: mcqDetection.diagnostics,
    mcqBlocks,
  };
};
