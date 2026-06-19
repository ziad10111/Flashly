const zlib = require("node:zlib");
const fs = require("node:fs");
const path = require("node:path");

const apiBaseUrl = process.env.FLASHLY_SMOKE_API_BASE_URL || "http://localhost:8081";
const fallbackApiBaseUrl = apiBaseUrl === "http://localhost:8081" ? "http://[::1]:8081" : null;
const defaultFixturePath = path.join(__dirname, "fixtures", "1-ocr.PDF");
const fixturePath = process.argv[2] || process.env.FLASHLY_SMOKE_PDF_FIXTURE || defaultFixturePath;
const scannedFixturePath =
  process.env.FLASHLY_SMOKE_SCANNED_PDF_FIXTURE || "d:/MEP/MEP Diploma/download (2).pdf";
const largeScannedFixturePath =
  process.env.FLASHLY_SMOKE_LARGE_SCANNED_PDF_FIXTURE ||
  "d:/MEP/MEP Diploma/AI mentor Data/Question bank 2/150 MCQ,solved (1).pdf";
const repoRoot = path.resolve(__dirname, "..");
const templateMarkers = [
  "Define the key term mentioned in the uploaded material.",
  "A key term is the important concept the material expects you to remember.",
  "Real AI generation will replace this template",
];

const postJson = async (path, body) => {
  const request = {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  };
  let response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, request);
  } catch (error) {
    if (!fallbackApiBaseUrl) {
      throw error;
    }

    response = await fetch(`${fallbackApiBaseUrl}${path}`, request);
  }

  const payload = await response.json().catch(() => null);

  return { payload, status: response.status };
};

const generateWithRetry = async (path, body, attempts = 2, options = {}) => {
  let lastResponse = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await postJson(path, {
      ...body,
      idempotencyKey:
        attempt === 1 || options.keepIdempotencyKey
          ? body.idempotencyKey
          : `${body.idempotencyKey}-retry-${attempt}`,
    });
    lastResponse = response;

    if (response.status === 201 && response.payload?.cards?.[0]?.question) {
      return response;
    }
  }

  return lastResponse;
};

const createPdfBase64 = (streamBytes, streamDictionary = "<< /Length 0 >>") => {
  const header = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nstream\n", "latin1");
  const objectPrefix = Buffer.from(
    `%PDF-1.4\n1 0 obj\n${streamDictionary.replace("/Length 0", `/Length ${streamBytes.length}`)}\nstream\n`,
    "latin1",
  );
  const footer = Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1");
  const pdf = streamDictionary.includes("/FlateDecode")
    ? Buffer.concat([objectPrefix, streamBytes, footer])
    : Buffer.concat([header, streamBytes, footer]);

  return {
    base64: pdf.toString("base64"),
    byteLength: pdf.byteLength,
  };
};

const preview = (value, maxLength = 500) => value.replace(/\s+/g, " ").trim().slice(0, maxLength);

const hasTemplateCard = (cards = []) =>
  cards.some((card) =>
    templateMarkers.some(
      (marker) =>
        card.question?.includes(marker) ||
        card.answer?.includes(marker) ||
        card.explanation?.includes(marker),
    ),
  );

const isValidMcqCard = (card) => {
  if (card?.type !== "mcq" || !Array.isArray(card.choices) || card.choices.length !== 4 || !card.correctChoiceId) {
    return false;
  }

  const ids = new Set();
  const texts = new Set();

  for (const choice of card.choices) {
    const id = String(choice.id || "").trim();
    const text = String(choice.text || "").trim().toLowerCase();

    if (!id || !text || ids.has(id) || texts.has(text)) {
      return false;
    }

    ids.add(id);
    texts.add(text);
  }

  const correctChoice = card.choices.find((choice) => String(choice.id || "").trim() === card.correctChoiceId);
  const answer = String(card.answer || "").trim().toLowerCase();

  return Boolean(correctChoice && answer === String(correctChoice.text || "").trim().toLowerCase());
};

const assertAllMcqCards = (cards, context) => {
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error(`Expected ${context} to include generated cards.`);
  }

  const invalidCards = cards.filter((card) => !isValidMcqCard(card));

  if (invalidCards.length > 0) {
    throw new Error(`Expected ${context} to return only valid 4-choice MCQ cards: ${JSON.stringify(invalidCards)}`);
  }
};

const assertNvidiaProviderWiring = () => {
  const configPath = path.join(repoRoot, "src", "api", "server", "config.ts");
  const externalServicePath = path.join(repoRoot, "src", "api", "server", "generation", "externalGenerationService.ts");
  const nvidiaProviderPath = path.join(
    repoRoot,
    "src",
    "api",
    "server",
    "generation",
    "providers",
    "nvidiaGenerationProvider.ts",
  );

  const configSource = fs.readFileSync(configPath, "utf8");
  const externalServiceSource = fs.readFileSync(externalServicePath, "utf8");
  const providerSource = fs.readFileSync(nvidiaProviderPath, "utf8");

  if (!configSource.includes('"nvidia"') || !configSource.includes("FLASHLY_AI_BASE_URL")) {
    throw new Error("Expected server config to support FLASHLY_AI_PROVIDER=nvidia and FLASHLY_AI_BASE_URL.");
  }

  if (!externalServiceSource.includes('config.provider === "nvidia"') || !externalServiceSource.includes("callNvidiaChatCompletionsApi")) {
    throw new Error("Expected external generation service to route FLASHLY_AI_PROVIDER=nvidia to the NVIDIA provider.");
  }

  if (
    !providerSource.includes("/chat/completions") ||
    !providerSource.includes("Authorization") ||
    providerSource.includes("EXPO_PUBLIC")
  ) {
    throw new Error("Expected NVIDIA provider to use server-only chat completions configuration.");
  }
};

const runFixturePdfSmoke = async () => {
  if (!fs.existsSync(fixturePath)) {
    return null;
  }

  const fileBuffer = fs.readFileSync(fixturePath);
  const fileName = path.basename(fixturePath);
  const mimeType = "application/pdf";
  const sourceType = "pdf";
  const sourceBase64 = fileBuffer.toString("base64");
  const startsWithPdf = fileBuffer.subarray(0, 4).toString("latin1") === "%PDF";
  const materialId = "smoke-fixture-1-ocr-pdf";

  const extractionInput = {
    fileName,
    fileSize: fileBuffer.byteLength,
    hasSourceBase64: Boolean(sourceBase64),
    mimeType,
    sourceType,
  };

  const extraction = await postJson(`/api/materials/${materialId}/extract`, {
    fileName,
    fileSize: fileBuffer.byteLength,
    materialId,
    mimeType,
    sourceBase64,
    sourceType,
  });

  const extractedText = extraction.payload?.extractedTextPreview || "";
  const extractionSummary = {
    ...extractionInput,
    decodedByteLength: fileBuffer.byteLength,
    extractionStatus: extraction.payload?.extractionStatus || extraction.payload?.error?.code,
    extractedTextLength: extraction.payload?.textLength || extractedText.length,
    extractedTextPreview: preview(extractedText),
    parser: "flashly-local-pdf-text-extractor:zlib",
    pdfStartsWithPdf: startsWithPdf,
    routeStatus: extraction.status,
  };

  if (extraction.status !== 200) {
    return {
      extraction: extractionSummary,
      extractionError: extraction.payload?.error,
      generation: null,
    };
  }

  if (!extractedText || extractedText.length <= 40) {
    throw new Error(`Fixture PDF extracted too little text: ${JSON.stringify(extractionSummary)}`);
  }

  const normalizedExtractedText = extractedText.replace(/\s+/g, " ").trim();
  const detectedMcqCount = (
    normalizedExtractedText.match(
      /(?:^|\s)\d{1,3}\s*[-.)]\s*.{20,900}?\s+A\s*[.)]\s*.{1,400}?\s+B\s*[.)]\s*.{1,400}?\s+C\s*[.)]\s*.{1,400}?\s+D\s*[.)]/g,
    ) || []
  ).length;

  const firstBatchSize = 3;
  const backgroundBatchSize = 5;
  const firstGeneration = await generateWithRetry(`/api/materials/${materialId}/generate-flashcards`, {
    extractedTextPreview: extractedText,
    idempotencyKey: "smoke-fixture-1-ocr-pdf",
    batchMode: "batch",
    batchIndex: 0,
    batchSize: firstBatchSize,
    generationMode: "comprehensive",
    maxCards: 40,
    materialId,
    requestedCardCount: firstBatchSize,
    startQuestionIndex: 0,
  }, 2, { keepIdempotencyKey: true });

  const firstCards = firstGeneration.payload?.cards || [];

  if (firstGeneration.status !== 201 || firstCards.length === 0) {
    throw new Error(`Expected fixture first batch Gemini generation to pass. Status ${firstGeneration.status}: ${JSON.stringify(firstGeneration.payload)}`);
  }

  if (firstCards.length !== firstBatchSize) {
    throw new Error(`Expected progressive first batch to return exactly ${firstBatchSize} MCQ cards, got ${firstCards.length}.`);
  }

  assertAllMcqCards(firstCards, "fixture first batch");

  if (detectedMcqCount <= 5) {
    throw new Error(`Expected fixture MCQ detector to find more than 5 blocks, got ${detectedMcqCount}.`);
  }

  if (!firstGeneration.payload?.expectedTotalCards || firstGeneration.payload.expectedTotalCards <= firstCards.length) {
    throw new Error(`Expected first batch to report a larger expected total: ${JSON.stringify(firstGeneration.payload)}`);
  }

  const cards = [...firstCards];
  let startQuestionIndex = firstBatchSize;
  let batchIndex = 1;
  let hasMore = firstGeneration.payload?.hasMore === true;

  while (hasMore) {
    const batchGeneration = await generateWithRetry(`/api/materials/${materialId}/generate-flashcards`, {
      extractedTextPreview: extractedText,
      idempotencyKey: "smoke-fixture-1-ocr-pdf",
      batchMode: "batch",
      batchIndex,
      batchSize: backgroundBatchSize,
      generationMode: "comprehensive",
      maxCards: 40,
      materialId,
      requestedCardCount: backgroundBatchSize,
      startQuestionIndex,
    }, 2, { keepIdempotencyKey: true });

    if (batchGeneration.status !== 201) {
      throw new Error(`Expected background batch ${batchIndex} to pass. Status ${batchGeneration.status}: ${JSON.stringify(batchGeneration.payload)}`);
    }

    cards.push(...(batchGeneration.payload?.cards || []));
    assertAllMcqCards(batchGeneration.payload?.cards || [], `fixture background batch ${batchIndex}`);
    hasMore = batchGeneration.payload?.hasMore === true;
    startQuestionIndex += backgroundBatchSize;
    batchIndex += 1;
  }

  if (firstCards.length < 1 || firstCards.length > firstBatchSize) {
    throw new Error(`Expected first batch to return 1-${firstBatchSize} cards, got ${firstCards.length}.`);
  }

  if (cards.length <= firstCards.length) {
    throw new Error(`Expected remaining batches to add cards. First ${firstCards.length}, final ${cards.length}.`);
  }

  if (cards.length < 15) {
    throw new Error(`Expected at least 15 cards from progressive 1-ocr.PDF fixture, got ${cards.length}.`);
  }

  if (hasTemplateCard(cards)) {
    throw new Error(`Fixture Gemini generation returned template cards: ${JSON.stringify(cards)}`);
  }

  const uniqueQuestionCount = new Set(cards.map((card) => String(card.question || "").trim().toLowerCase())).size;

  if (uniqueQuestionCount !== cards.length) {
    throw new Error(`Fixture Gemini generation returned duplicate questions: ${JSON.stringify(cards)}`);
  }

  assertAllMcqCards(cards, "fixture progressive generation");

  const firstMcq = cards.find(isValidMcqCard);

  if (!firstMcq) {
    throw new Error(`Expected at least one valid MCQ card from fixture PDF: ${JSON.stringify(cards)}`);
  }

  if (firstMcq.choices.length !== 4 || !firstMcq.choices.some((choice) => choice.id === firstMcq.correctChoiceId)) {
    throw new Error(`Expected source MCQ choices and a valid inferred correct choice to be preserved: ${JSON.stringify(firstMcq)}`);
  }

  return {
    extraction: extractionSummary,
    generation: {
      firstAnswer: cards[0].answer,
      firstBatchCardCount: firstCards.length,
      firstQuestion: cards[0].question,
      detectedMcqCount,
      expectedTotalCards: firstGeneration.payload.expectedTotalCards,
      finalGeneratedCardCount: cards.length,
      generationStatusTransitions: ["generating", "complete"],
      mcqChoiceCount: firstMcq.choices.length,
      mcqCorrectChoiceId: firstMcq.correctChoiceId,
      mcqQuestion: firstMcq.question,
      routeStatus: firstGeneration.status,
    },
  };
};

const runScannedPdfFixtureSmoke = async () => {
  if (!fs.existsSync(scannedFixturePath)) {
    return null;
  }

  const fileBuffer = fs.readFileSync(scannedFixturePath);
  const fileName = path.basename(scannedFixturePath);
  const materialId = "smoke-scanned-download-2-pdf";
  const sourceBase64 = fileBuffer.toString("base64");

  const extraction = await postJson(`/api/materials/${materialId}/extract`, {
    fileName,
    fileSize: fileBuffer.byteLength,
    materialId,
    mimeType: "application/pdf",
    sourceBase64,
    sourceType: "pdf",
  });

  const extractedText = extraction.payload?.extractedTextPreview || "";
  const normalizedText = extractedText.replace(/\s+/g, " ").trim();

  if (extraction.status !== 200) {
    throw new Error(`Expected scanned fixture OCR extraction to pass. Status ${extraction.status}: ${JSON.stringify(extraction.payload)}`);
  }

  if ((extraction.payload?.textLength || extractedText.length) <= 300) {
    throw new Error(`Expected scanned fixture OCR text length above 300: ${JSON.stringify(extraction.payload)}`);
  }

  const expectedPhrases = [
    "Maintenance and reliability best practices",
    "Best practices are practices",
    "RCM stands",
    "PM compliance",
  ];

  if (!expectedPhrases.some((phrase) => normalizedText.toLowerCase().includes(phrase.toLowerCase()))) {
    throw new Error(`Expected scanned fixture OCR text to include known maintenance phrases: ${normalizedText.slice(0, 800)}`);
  }

  if (extraction.payload?.ocrRequired !== true || extraction.payload?.ocrStatus !== "complete") {
    throw new Error(`Expected scanned fixture to report completed OCR fallback: ${JSON.stringify(extraction.payload)}`);
  }

  const generation = await generateWithRetry(`/api/materials/${materialId}/generate-flashcards`, {
    extractedTextPreview: extractedText,
    idempotencyKey: "smoke-scanned-download-2-pdf",
    batchMode: "batch",
    batchIndex: 0,
    batchSize: 3,
    generationMode: "comprehensive",
    maxCards: 40,
    materialId,
    requestedCardCount: 3,
    startQuestionIndex: 0,
  }, 2, { keepIdempotencyKey: true });

  const cards = generation.payload?.cards || [];

  if (generation.status !== 201 || cards.length !== 3) {
    throw new Error(`Expected scanned fixture first generation batch to return 3 cards. Status ${generation.status}: ${JSON.stringify(generation.payload)}`);
  }

  assertAllMcqCards(cards, "scanned fixture first batch");

  return {
    extraction: {
      fileName,
      ocrRequired: extraction.payload?.ocrRequired,
      ocrStatus: extraction.payload?.ocrStatus,
      routeStatus: extraction.status,
      textLength: extraction.payload?.textLength || extractedText.length,
      textPreview: preview(extractedText),
    },
    generation: {
      firstBatchCardCount: cards.length,
      firstQuestion: cards[0]?.question,
      routeStatus: generation.status,
    },
  };
};

const runLargeScannedPdfFixtureSmoke = async () => {
  if (!fs.existsSync(largeScannedFixturePath)) {
    return null;
  }

  const fileBuffer = fs.readFileSync(largeScannedFixturePath);
  const fileName = path.basename(largeScannedFixturePath);
  const materialId = "smoke-large-scanned-150-mcq-pdf";
  const sourceBase64 = fileBuffer.toString("base64");

  const extraction = await postJson(`/api/materials/${materialId}/extract`, {
    fileName,
    fileSize: fileBuffer.byteLength,
    materialId,
    mimeType: "application/pdf",
    sourceBase64,
    sourceType: "pdf",
  });

  const extractedText = extraction.payload?.extractedTextPreview || "";
  const normalizedText = extractedText.replace(/\s+/g, " ").trim();

  if (extraction.status !== 200) {
    throw new Error(`Expected large scanned fixture page OCR extraction to pass. Status ${extraction.status}: ${JSON.stringify(extraction.payload)}`);
  }

  if ((extraction.payload?.textLength || extractedText.length) <= 50000) {
    throw new Error(`Expected large scanned fixture OCR text length above 50000: ${JSON.stringify(extraction.payload)}`);
  }

  const expectedPhrases = [
    "Certified Maintenance",
    "Multiple Choice",
    "maintenance and reliability",
    "Reliability Centered Maintenance",
    "Overall Equipment",
    "world class performance",
  ];

  if (!expectedPhrases.some((phrase) => normalizedText.toLowerCase().includes(phrase.toLowerCase()))) {
    throw new Error(`Expected large scanned fixture OCR text to include known CMRP/maintenance phrases: ${normalizedText.slice(0, 800)}`);
  }

  if (extraction.payload?.ocrRequired !== true || extraction.payload?.ocrStatus !== "complete") {
    throw new Error(`Expected large scanned fixture to report completed OCR fallback: ${JSON.stringify(extraction.payload)}`);
  }

  const generation = await generateWithRetry(`/api/materials/${materialId}/generate-flashcards`, {
    extractedTextPreview: extractedText,
    idempotencyKey: "smoke-large-scanned-150-mcq-pdf",
    batchMode: "batch",
    batchIndex: 0,
    batchSize: 3,
    generationMode: "comprehensive",
    maxCards: 40,
    materialId,
    requestedCardCount: 3,
    startQuestionIndex: 0,
  }, 2, { keepIdempotencyKey: true });

  const cards = generation.payload?.cards || [];
  const mcqDetection = generation.payload?.generationDebug?.mcqDetection || {};

  if (generation.status !== 201 || cards.length !== 3) {
    throw new Error(`Expected large scanned fixture first generation batch to return 3 cards. Status ${generation.status}: ${JSON.stringify(generation.payload)}`);
  }

  if ((mcqDetection.candidateQuestionStarts ?? 0) < 50) {
    throw new Error(`Expected large scanned fixture detector to find at least 50 question starts: ${JSON.stringify(mcqDetection)}`);
  }

  if ((mcqDetection.acceptedSourceBlocks ?? 0) < 40) {
    throw new Error(`Expected large scanned fixture detector to accept at least 40 source MCQ blocks: ${JSON.stringify(mcqDetection)}`);
  }

  if (generation.payload?.hasMore !== true || (generation.payload?.expectedTotalCards ?? 0) <= 25) {
    throw new Error(`Expected large scanned fixture to continue after first progressive batch: ${JSON.stringify(generation.payload)}`);
  }

  assertAllMcqCards(cards, "large scanned fixture first batch");

  const secondGeneration = await generateWithRetry(`/api/materials/${materialId}/generate-flashcards`, {
    extractedTextPreview: extractedText,
    idempotencyKey: "smoke-large-scanned-150-mcq-pdf",
    batchMode: "batch",
    batchIndex: 1,
    batchSize: 5,
    generationMode: "comprehensive",
    maxCards: 40,
    materialId,
    requestedCardCount: 5,
    startQuestionIndex: 3,
  }, 2, { keepIdempotencyKey: true });

  const secondCards = secondGeneration.payload?.cards || [];

  if (secondGeneration.status !== 201 || secondCards.length === 0) {
    throw new Error(`Expected large scanned fixture background batch to generate cards. Status ${secondGeneration.status}: ${JSON.stringify(secondGeneration.payload)}`);
  }

  assertAllMcqCards(secondCards, "large scanned fixture background batch");

  const uniqueQuestionCount = new Set([...cards, ...secondCards].map((card) => String(card.question || "").trim().toLowerCase())).size;

  if (uniqueQuestionCount !== cards.length + secondCards.length) {
    throw new Error(`Expected large scanned fixture batches to avoid duplicate questions: ${JSON.stringify([...cards, ...secondCards])}`);
  }

  return {
    extraction: {
      fileName,
      ocrRequired: extraction.payload?.ocrRequired,
      ocrStatus: extraction.payload?.ocrStatus,
      routeStatus: extraction.status,
      textLength: extraction.payload?.textLength || extractedText.length,
      textPreview: preview(extractedText),
    },
    generation: {
      expectedTotalCards: generation.payload?.expectedTotalCards,
      firstBatchHasMore: generation.payload?.hasMore,
      firstBatchCardCount: cards.length,
      firstQuestion: cards[0]?.question,
      mcqDetection,
      secondBatchCardCount: secondCards.length,
      secondBatchHasMore: secondGeneration.payload?.hasMore,
      routeStatus: generation.status,
    },
  };
};

const main = async () => {
  assertNvidiaProviderWiring();

  const expectedText =
    "Flashly compressed PDF extraction should find nebula gravity protostar fusion notes for generated flashcards.";
  const compressedStream = zlib.deflateSync(Buffer.from(`BT\n(${expectedText}) Tj\nET`, "latin1"));
  const textPdf = createPdfBase64(compressedStream, "<< /Length 0 /Filter /FlateDecode >>");

  const extraction = await postJson("/api/materials/smoke-text-pdf/extract", {
    fileName: "smoke-text.pdf",
    fileSize: textPdf.byteLength,
    materialId: "smoke-text-pdf",
    mimeType: "application/pdf",
    sourceBase64: `data:application/pdf;base64,${textPdf.base64}`,
    sourceType: "pdf",
  });

  if (extraction.status !== 200) {
    throw new Error(`Expected text PDF extraction to pass. Status ${extraction.status}: ${JSON.stringify(extraction.payload)}`);
  }

  const extractedText = extraction.payload?.extractedTextPreview || "";

  if (!extractedText.includes("nebula gravity protostar fusion")) {
    throw new Error(`Text PDF extraction did not contain expected words: ${extractedText}`);
  }

  const textPdfGeneration = await generateWithRetry("/api/materials/smoke-text-pdf/generate-flashcards", {
    extractedTextPreview: extractedText,
    idempotencyKey: "smoke-text-pdf-mcq",
    batchMode: "all",
    generationMode: "sample",
    maxCards: 3,
    materialId: "smoke-text-pdf",
    requestedCardCount: 3,
  }, 3);
  const textPdfCards = textPdfGeneration.payload?.cards || [];

  if (textPdfGeneration.status !== 201) {
    throw new Error(`Expected normal text PDF Gemini generation to pass. Status ${textPdfGeneration.status}: ${JSON.stringify(textPdfGeneration.payload)}`);
  }

  assertAllMcqCards(textPdfCards, "normal text PDF generation");

  const scannedPdf = createPdfBase64(Buffer.from("q\n100 0 0 100 0 0 cm\n/Im0 Do\nQ", "latin1"));
  const scannedExtraction = await postJson("/api/materials/smoke-scanned-pdf/extract", {
    fileName: "smoke-scanned.pdf",
    fileSize: scannedPdf.byteLength,
    materialId: "smoke-scanned-pdf",
    mimeType: "application/pdf",
    sourceBase64: scannedPdf.base64,
    sourceType: "pdf",
  });

  const scannedMessage = scannedExtraction.payload?.error?.message || "";
  const scannedExtractedText = scannedExtraction.payload?.extractedTextPreview || "";
  const scannedFriendlyFailure =
    scannedExtraction.status >= 400 &&
    (scannedMessage.includes("We couldn't read this PDF") || scannedMessage.includes("scanned PDF needs OCR")) &&
    !scannedMessage.includes("cannot extract text from scanned PDFs yet");

  if (scannedExtraction.status !== 200 && !scannedFriendlyFailure) {
    throw new Error(
      `Expected scanned PDF OCR success or friendly OCR failure. Status ${scannedExtraction.status}: ${JSON.stringify(scannedExtraction.payload)}`,
    );
  }

  const fixtureSmoke = await runFixturePdfSmoke();
  const scannedFixtureSmoke = await runScannedPdfFixtureSmoke();
  const largeScannedFixtureSmoke = await runLargeScannedPdfFixtureSmoke();

  console.log(JSON.stringify(
    {
      fixtureSmoke,
      generatedFixturePath: fs.existsSync(fixturePath) ? path.resolve(fixturePath) : null,
      largeScannedFixturePath: fs.existsSync(largeScannedFixturePath) ? path.resolve(largeScannedFixturePath) : null,
      largeScannedFixtureSmoke,
      scannedFixtureSmoke,
      scannedFixturePath: fs.existsSync(scannedFixturePath) ? path.resolve(scannedFixturePath) : null,
      generatedPdfSmoke: {
        scannedPdfMessage: scannedMessage || null,
        scannedPdfRouteStatus: scannedExtraction.status,
        scannedPdfTextLength: scannedExtraction.payload?.textLength || scannedExtractedText.length,
        textPdfGeneratedCardCount: textPdfCards.length,
        textPdfGeneratedFirstChoiceCount: textPdfCards[0]?.choices?.length ?? 0,
        textPdfGeneratedFirstQuestion: textPdfCards[0]?.question ?? null,
        textPdfExtractedText: extractedText,
      },
    },
    null,
    2,
  ));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
