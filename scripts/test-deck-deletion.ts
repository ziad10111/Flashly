import {
  classifyDeckForDeletion,
  createDeckDeletionLogPayload,
  createDeckDeletionOperationRegistry,
  isLegacyLocalOrMockDeckId,
  shouldApplyGeneratedDeckMutation,
  shouldTreatBackendDeleteErrorAsSuccessfulCleanup,
} from "../src/api/repositories/deckDeletion";
import { createApiRequestHeaders, shouldUseJsonContentType } from "../src/api/requestHeaders";

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const localGenerated = classifyDeckForDeletion({
  deckId: "generated-study-notes-abc123",
  deckStatus: "ready",
  hasLocalGeneratedDeck: true,
  hasLocalStaticDeck: false,
  useBackendApi: true,
});
assert(localGenerated.isLocal, "Local generated deck should be classified as local.");
assert(!localGenerated.backendRequestRequired, "Local generated deck should not call backend delete.");
assert(!localGenerated.isPersisted, "Local generated deck without backend metadata should not be persisted.");

const legacyMock = classifyDeckForDeletion({
  deckId: "ai-generated-deck-mock-material-mock-upload-3-ocr",
  deckStatus: "generating",
  generationJobId: "mock-generation-job-1",
  generationStatus: "generating",
  hasLocalGeneratedDeck: true,
  hasLocalStaticDeck: false,
  useBackendApi: true,
});
assert(legacyMock.isMock, "Legacy ai-generated/mock deck ids should be classified as mock/local.");
assert(legacyMock.isGenerating, "Generating decks should preserve generation status in classification.");
assert(!legacyMock.backendRequestRequired, "Legacy ai-generated/mock deck ids should not call backend delete.");

const backendGenerated = classifyDeckForDeletion({
  deckId: "3f8f1025-7ce2-4457-a511-94667957fb21",
  deckStatus: "generating",
  generationJobId: "generation-job-1",
  generationStatus: "generating",
  hasLocalGeneratedDeck: true,
  hasLocalStaticDeck: false,
  useBackendApi: true,
});
assert(backendGenerated.isLocal, "Backend-generated deck can still have a local mirror.");
assert(backendGenerated.isPersisted, "Generated deck with backend metadata and non-legacy id should be persisted.");
assert(backendGenerated.backendRequestRequired, "Persisted generated deck should call backend delete.");

const backendOnly = classifyDeckForDeletion({
  deckId: "backend-deck-1",
  deckStatus: "ready",
  hasLocalGeneratedDeck: false,
  hasLocalStaticDeck: false,
  useBackendApi: true,
});
assert(!backendOnly.isLocal, "Backend-only deck should not be classified as local.");
assert(backendOnly.isPersisted, "Backend-only deck should be persisted.");
assert(backendOnly.backendRequestRequired, "Backend-only deck should call backend delete.");

const localStatic = classifyDeckForDeletion({
  deckId: "sample-deck-1",
  deckStatus: "ready",
  hasLocalGeneratedDeck: false,
  hasLocalStaticDeck: true,
  useBackendApi: true,
});
assert(localStatic.isLocal, "Bundled/static deck should be local.");
assert(localStatic.isMock, "Bundled/static deck should be treated as mock data.");
assert(!localStatic.backendRequestRequired, "Bundled/static deck should not call backend delete.");

const backendDisabled = classifyDeckForDeletion({
  deckId: "unknown-local-deck",
  deckStatus: "ready",
  hasLocalGeneratedDeck: false,
  hasLocalStaticDeck: false,
  useBackendApi: false,
});
assert(backendDisabled.isLocal, "When backend API is disabled, unknown decks should delete locally.");
assert(!backendDisabled.backendRequestRequired, "Backend-disabled delete should not call backend.");

assert(isLegacyLocalOrMockDeckId("mock-generated-deck-material-1"), "mock-generated deck ids should be legacy local.");
assert(isLegacyLocalOrMockDeckId("ai-generated-deck-material-key"), "ai-generated deck ids should be legacy local.");
assert(isLegacyLocalOrMockDeckId("deck-mock-upload-1"), "mock-upload deck ids should be legacy local.");
assert(!isLegacyLocalOrMockDeckId("3f8f1025-7ce2-4457-a511-94667957fb21"), "UUID-like ids should not be legacy local.");

assert(shouldTreatBackendDeleteErrorAsSuccessfulCleanup(404), "Backend 404 should clean up stale local decks.");
assert(!shouldTreatBackendDeleteErrorAsSuccessfulCleanup(500), "Backend 500 should remain a genuine failure.");
assert(!shouldTreatBackendDeleteErrorAsSuccessfulCleanup(undefined), "Network failure should remain retryable.");

assert(
  shouldUseJsonContentType({ hasBody: false, method: "DELETE" }),
  "Bodyless DELETE API requests should still use JSON content type for backend security checks.",
);
assert(
  createApiRequestHeaders({ hasBody: false, method: "DELETE" }).get("Content-Type") === "application/json",
  "Deck deletion should send Content-Type: application/json even without a request body.",
);
assert(
  createApiRequestHeaders({ hasBody: false, method: "GET" }).get("Content-Type") === null,
  "GET requests should not add an unnecessary content type.",
);
assert(
  createApiRequestHeaders({ hasBody: false, headers: { "Content-Type": "text/plain" }, method: "DELETE" }).get(
    "Content-Type",
  ) === "text/plain",
  "Explicit content type headers should be preserved for bodyless mutating requests.",
);

assert(
  shouldApplyGeneratedDeckMutation({ deckId: "deck-a", deletedDeckIds: ["deck-b"] }),
  "Generation result for a non-deleted deck should apply.",
);
assert(
  !shouldApplyGeneratedDeckMutation({ deckId: "deck-a", deletedDeckIds: ["deck-a"] }),
  "Late generation result for a deleted deck should be ignored.",
);
assert(
  !shouldApplyGeneratedDeckMutation({ deckId: "deck-a", deletedDeckIds: ["deck-a"] }),
  "Rehydrated tombstones should keep deleted local decks hidden after restart.",
);

const logPayload = createDeckDeletionLogPayload(legacyMock, {
  backendRequestAttempted: false,
  localCleanupResult: "success",
});
assert(logPayload.deckId === legacyMock.deckId, "Structured log payload should include deckId.");
assert(logPayload.deckSource === "local-generated", "Structured log payload should include deck source/type.");
assert(logPayload.generationStatus === "generating", "Structured log payload should include generation status.");
assert(logPayload.backendRequestAttempted === false, "Structured log payload should include backend request status.");
assert(logPayload.localCleanupResult === "success", "Structured log payload should include local cleanup result.");

const registry = createDeckDeletionOperationRegistry();
let operationCalls = 0;
let resolveOperation: (() => void) | null = null;
const firstOperation = registry.run(
  "deck-a",
  () =>
    new Promise<void>((resolve) => {
      operationCalls += 1;
      resolveOperation = resolve;
    }),
);
const duplicateOperation = registry.run("deck-a", async () => {
  operationCalls += 1;
});
assert(firstOperation === duplicateOperation, "Duplicate delete taps should share one in-flight operation.");
assert(operationCalls === 1, "Duplicate delete taps should only start one operation.");
resolveOperation?.();
Promise.all([firstOperation, duplicateOperation])
  .then(() =>
    registry.run("deck-a", async () => {
      operationCalls += 1;
    }),
  )
  .then(() => {
    assert(operationCalls === 2, "A later retry after completion should be allowed.");
    console.log("PASS deck deletion checks");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
