import fs from "node:fs";
import path from "node:path";

import { classifyDeckForDeletion } from "../src/api/repositories/deckDeletion";
import { validateStartGenerationJobRequest } from "../src/api/server/generationJobs/validation";
import { buildGenerationInput } from "../src/api/server/generationJobs/worker";

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const valid = validateStartGenerationJobRequest({
  idempotencyKey: "upload notes 1",
  materialId: "material-1",
  requestedCardCount: 51,
  batchSize: 5,
});
assert(valid.ok, "Valid generation job requests should pass validation.");

if (valid.ok) {
  assert(valid.request.idempotencyKey === "upload-notes-1", "Idempotency keys should be normalized.");
  assert(valid.request.requestedCardCount === 51, "Requested card count should be preserved.");
  assert(valid.request.batchSize === 5, "Batch size should be preserved.");
}

const invalid = validateStartGenerationJobRequest({
  idempotencyKey: "",
  materialId: "material-1",
  requestedCardCount: 51,
});
assert(!invalid.ok, "Missing idempotency key should fail validation.");

const oversizedBatch = validateStartGenerationJobRequest({
  idempotencyKey: "upload-notes-2",
  materialId: "material-1",
  requestedCardCount: 10,
  batchSize: 11,
});
assert(!oversizedBatch.ok, "Batch size larger than requested count should fail validation.");

const workerInput = buildGenerationInput({
  attemptCount: 1,
  batchId: "batch-1",
  batchIndex: 3,
  batchSize: 5,
  deckId: "deck-1",
  extractedTextPreview: "Enough study text to generate flashcards from backend-owned batches.",
  generationMode: "comprehensive",
  idempotencyKey: "job-1-batch-3",
  jobId: "job-1",
  materialId: "material-1",
  maxAttempts: 3,
  requestedCardCount: 5,
  startQuestionIndex: 15,
  totalRequestedCardCount: 51,
  topicFocus: ["Safety"],
  userId: "user-1",
});
assert(workerInput.deckId === "deck-1", "Worker input should target the persisted deck.");
assert(workerInput.metadata.batchMode === "batch", "Worker must always process durable batch units.");
assert(workerInput.metadata.startQuestionIndex === 15, "Worker should preserve batch offsets.");
assert(workerInput.metadata.maxCards === 51, "Worker should keep the full requested card count as maxCards.");
assert(workerInput.metadata.idempotencyKey === "job-1-batch-3", "Worker should use stable batch idempotency keys.");

const queuedDeck = classifyDeckForDeletion({
  deckId: "3f8f1025-7ce2-4457-a511-94667957fb21",
  deckStatus: "generating",
  generationJobId: "job-1",
  generationStatus: "queued",
  hasLocalGeneratedDeck: true,
  hasLocalStaticDeck: false,
  useBackendApi: true,
});
assert(queuedDeck.backendRequestRequired, "Queued server generation decks should delete through the backend.");
assert(queuedDeck.isGenerating, "Queued server generation should be classified as active generation.");

const partialDeck = classifyDeckForDeletion({
  deckId: "3f8f1025-7ce2-4457-a511-94667957fb21",
  deckStatus: "partial-error",
  generationJobId: "job-1",
  generationStatus: "partial",
  hasLocalGeneratedDeck: true,
  hasLocalStaticDeck: false,
  useBackendApi: true,
});
assert(partialDeck.backendRequestRequired, "Partial server generation decks should still delete through the backend.");
assert(partialDeck.isGenerating, "Partial generation should be treated as generation-owned for cleanup.");

const repoRoot = path.resolve(process.cwd());
const mobileFiles = [
  "src/components/upload/upload-screen.tsx",
  "src/app/deck/[id].tsx",
  "src/lib/progressive-generation.ts",
];

for (const relativePath of mobileFiles) {
  const contents = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  assert(
    !contents.includes("runRemainingGeneratedDeckBatches"),
    `${relativePath} should not run client-side generation batch loops.`,
  );
}

const uploadScreen = fs.readFileSync(path.join(repoRoot, "src/components/upload/upload-screen.tsx"), "utf8");
assert(uploadScreen.includes("startGenerationJob"), "Upload screen should submit one durable generation job.");
assert(
  !uploadScreen.includes("generateFlashcardsForMaterial"),
  "Upload screen should not call the synchronous flashcard generation endpoint.",
);

const deckScreen = fs.readFileSync(path.join(repoRoot, "src/app/deck/[id].tsx"), "utf8");
assert(deckScreen.includes("retryGenerationJob"), "Partial deck retry should call the server retry endpoint.");
assert(deckScreen.includes("getGenerationJob"), "Deck screen should poll persisted server job status.");

console.log("PASS generation job contract checks");
