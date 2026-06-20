const fs = require("node:fs");
const path = require("node:path");
const {
  createAuthenticatedClient,
  createClerkSessionTokenProvider,
  createStaticTokenProvider,
  decodeJwtSub,
} = require("./staging-clerk-token-provider");
const { formatStagingSmokeReport } = require("./staging-smoke-report");

const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env");
const fixturePath = path.join(repoRoot, "fixtures", "staging", "small-upload.txt");
const stepResults = [];

const loadDotEnv = () => {
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/g)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

const envValue = (key) => process.env[key]?.trim();

const requiredEnv = (key) => {
  const value = envValue(key);

  if (!value) {
    throw new Error(`${key} is required for smoke:staging.`);
  }

  return value;
};

const createClient = (baseUrl, token) => {
  const root = baseUrl.replace(/\/+$/g, "");

  return async (pathName, options = {}) => {
    const method = options.method ?? "GET";
    const startedAt = Date.now();
    const headers = {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    };
    const response = await fetch(`${root}${pathName}`, {
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;

    return {
      elapsedMs: Date.now() - startedAt,
      headers: response.headers,
      json,
      method,
      ok: response.ok,
      pathName,
      requestId: response.headers.get("x-request-id"),
      status: response.status,
    };
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertStatus = (result, expected, message) => {
  assert(
    result.status === expected,
    `${message} ${result.method ?? "GET"} ${result.pathName ?? ""} expected ${expected}, got ${result.status}. requestId=${result.requestId ?? "none"} message=${result.json?.error?.message ?? "none"}${result.authHint ? ` hint=${result.authHint}` : ""}`,
  );
};

const assertMcqCard = (card, index) => {
  assert(card.type === "mcq", `Card ${index + 1} should be type mcq.`);
  assert(Array.isArray(card.choices) && card.choices.length === 4, `Card ${index + 1} should have 4 choices.`);
  assert(new Set(card.choices.map((choice) => choice.id)).size === card.choices.length, `Card ${index + 1} choice ids should be unique.`);
  assert(card.choices.some((choice) => choice.id === card.correctChoiceId), `Card ${index + 1} correctChoiceId should match a choice.`);
  assert(card.question && card.answer, `Card ${index + 1} should include question and answer.`);
};

const runStep = async (category, name, action) => {
  const startedAt = Date.now();
  process.stdout.write(`RUN ${name} ... `);

  try {
    const result = await action();
    const elapsedMs = Date.now() - startedAt;
    stepResults.push({ category, elapsedMs, name, status: "PASS" });
    console.log(`PASS (${elapsedMs}ms)`);
    return result;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    stepResults.push({ category, elapsedMs, message, name, status: "FAIL" });
    console.log(`FAIL (${elapsedMs}ms)`);
    console.error(`  ${message}`);
    throw error;
  }
};

const printReport = () => {
  console.log(formatStagingSmokeReport(stepResults));
};

const poll = async (action, predicate, { intervalMs = 1500, timeoutMs = 90_000 } = {}) => {
  const startedAt = Date.now();
  let last;

  while (Date.now() - startedAt < timeoutMs) {
    last = await action();

    if (predicate(last)) {
      return last;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Polling timed out. Last result: ${JSON.stringify(last)?.slice(0, 500)}`);
};

const main = async () => {
  loadDotEnv();

  const baseUrl = requiredEnv("FLASHLY_STAGING_BASE_URL");
  const clerkSecretKey = envValue("CLERK_SECRET_KEY");
  const primarySessionId = envValue("FLASHLY_STAGING_TEST_SESSION_ID");
  const secondSessionId = envValue("FLASHLY_STAGING_SECOND_USER_SESSION_ID");
  const hasSessionTokenConfig = Boolean(clerkSecretKey && primarySessionId && secondSessionId);

  if ((primarySessionId || secondSessionId) && !hasSessionTokenConfig) {
    throw new Error(
      "Configure CLERK_SECRET_KEY, FLASHLY_STAGING_TEST_SESSION_ID, and FLASHLY_STAGING_SECOND_USER_SESSION_ID together, or omit session ids to use static staging tokens.",
    );
  }

  const primaryToken = hasSessionTokenConfig ? undefined : requiredEnv("FLASHLY_STAGING_TEST_TOKEN");
  const secondToken = hasSessionTokenConfig ? undefined : requiredEnv("FLASHLY_STAGING_SECOND_USER_TOKEN");
  const revenueCatSecret = requiredEnv("REVENUECAT_WEBHOOK_SECRET");

  const primaryTokenProvider = hasSessionTokenConfig
    ? createClerkSessionTokenProvider({
        label: "primary staging user",
        secretKey: clerkSecretKey,
        sessionId: primarySessionId,
      })
    : createStaticTokenProvider({
        label: "primary staging user",
        token: primaryToken,
      });
  const secondTokenProvider = hasSessionTokenConfig
    ? createClerkSessionTokenProvider({
        label: "second staging user",
        secretKey: clerkSecretKey,
        sessionId: secondSessionId,
      })
    : createStaticTokenProvider({
        label: "second staging user",
        token: secondToken,
      });
  const primaryUserId =
    envValue("FLASHLY_STAGING_TEST_CLERK_USER_ID") ?? decodeJwtSub(await primaryTokenProvider.getToken());

  if (hasSessionTokenConfig) {
    assert(primarySessionId !== secondSessionId, "Staging primary and second session ids must belong to different users.");
  } else {
    assert(primaryToken !== secondToken, "Staging primary and second user tokens must be different.");
  }

  const publicClient = createClient(baseUrl);
  const client = createAuthenticatedClient(baseUrl, primaryTokenProvider);
  const secondClient = createAuthenticatedClient(baseUrl, secondTokenProvider);
  const unique = `staging-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sourceText = fs.readFileSync(fixturePath, "utf8");
  const fileName = `${unique}.txt`;
  const fileSize = Buffer.byteLength(sourceText);
  const sourceBase64 = Buffer.from(sourceText, "utf8").toString("base64");
  const midpoint = Math.ceil(sourceBase64.length / 8) * 4;
  const sourceChunks = [sourceBase64.slice(0, midpoint), sourceBase64.slice(midpoint)];

  await runStep("health", "GET /health", async () => {
    const result = await publicClient("/health");
    assert(result.ok, "/health should return 2xx.");
    assert(result.json?.service === "flashly-backend", "/health should identify Flashly backend.");
  });

  await runStep("readiness", "GET /ready", async () => {
    const result = await publicClient("/ready");
    assert(result.ok, `/ready should be ready. Body: ${JSON.stringify(result.json)}`);
    assert(result.json?.status === "ready", "/ready should return status=ready.");
    for (const key of ["database", "migrations", "storage", "auth", "ocr", "ai", "billing"]) {
      assert(result.json?.checks?.[key], `/ready should include ${key}.`);
      assert(result.json.checks[key].status !== "failed", `/ready ${key} should not fail.`);
    }
  });

  await runStep("auth", "protected route rejects unauthenticated request", async () => {
    const result = await publicClient("/api/progress");
    assertStatus(result, 401, "Unauthenticated protected route should reject.");
    assert(result.headers.get("x-request-id"), "Protected route response should include request id.");
  });

  await runStep("auth", "invalid token rejects request", async () => {
    const badClient = createClient(baseUrl, "invalid-token");
    const result = await badClient("/api/progress");
    assertStatus(result, 401, "Invalid token should reject.");
  });

  const upload = await runStep("upload", "create upload metadata", async () => {
    const result = await client("/api/uploads", {
      body: {
        fileName,
        fileSize,
        idempotencyKey: unique,
        mimeType: "text/plain",
      },
      method: "POST",
    });
    assertStatus(result, 201, "Upload metadata should be created.");
    assert(result.json?.materialId, "Upload response should include materialId.");
    assert(result.json?.storageKey, "Upload response should include durable storageKey.");
    return result.json;
  });

  await runStep("security", "reject unsupported upload type", async () => {
    const result = await client("/api/uploads", {
      body: {
        fileName: `${unique}.exe`,
        fileSize: 128,
        idempotencyKey: `${unique}-bad-type`,
        mimeType: "application/x-msdownload",
      },
      method: "POST",
    });
    assert(result.status === 415 || result.status === 400, "Unsupported file type should be rejected.");
  });

  await runStep("security", "reject oversized upload metadata", async () => {
    const result = await client("/api/uploads", {
      body: {
        fileName: `${unique}-large.pdf`,
        fileSize: 51 * 1024 * 1024,
        idempotencyKey: `${unique}-too-large`,
        mimeType: "application/pdf",
      },
      method: "POST",
    });
    assert(result.status === 400 || result.status === 403, "Oversized upload should be rejected.");
  });

  const chunk = await runStep("chunk", "complete multi-part chunk upload to cloud storage", async () => {
    const start = await client("/api/uploads/chunk/start", {
      body: {
        fileName,
        fileSize,
        mimeType: "text/plain",
        storageKey: upload.storageKey,
        totalChunks: sourceChunks.length,
      },
      method: "POST",
    });
    assertStatus(start, 201, "Chunk start should succeed.");
    for (const [chunkIndex, chunkBase64] of sourceChunks.entries()) {
      const part = await client("/api/uploads/chunk/part", {
        body: {
          chunkBase64,
          chunkIndex,
          totalChunks: sourceChunks.length,
          uploadId: start.json.uploadId,
        },
        method: "POST",
      });
      assertStatus(part, 200, `Chunk part ${chunkIndex + 1} should succeed.`);
    }
    const complete = await client("/api/uploads/chunk/complete", {
      body: {
        uploadId: start.json.uploadId,
      },
      method: "POST",
    });
    assertStatus(complete, 200, "Chunk complete should succeed.");
    assert(complete.json.storageKey === upload.storageKey, "Chunk complete should keep the durable storageKey.");
    assert(complete.json.storageProvider && complete.json.storageProvider !== "local", "Chunk complete should report cloud storage provider.");
    assert(complete.json.sizeBytes === fileSize, "Chunk complete should report stored byte length.");
    assert(complete.json.contentType === "text/plain", "Chunk complete should preserve content type.");
    assert(complete.json.originalName === fileName, "Chunk complete should preserve original name.");

    const duplicate = await client("/api/uploads/chunk/complete", {
      body: {
        uploadId: start.json.uploadId,
      },
      method: "POST",
    });
    assert(duplicate.status === 200 || duplicate.status === 400 || duplicate.status === 404, `Duplicate chunk complete should be safe, got ${duplicate.status}.`);
    return complete.json;
  });

  await runStep("persistence", "confirm upload status persistence", async () => {
    const result = await client(`/api/uploads/${encodeURIComponent(upload.uploadJobId)}/status`);
    assert(result.ok, "Upload status should be readable.");
    assert(result.json?.materialId === upload.materialId, "Upload status should keep materialId.");
    assert(result.json?.storageKey === upload.storageKey, "Upload status should keep storageKey.");
  });

  const extraction = await runStep("extraction", "extract using storageKey only", async () => {
    const result = await client(`/api/materials/${encodeURIComponent(upload.materialId)}/extract`, {
      body: {
        fileName: chunk.fileName,
        fileSize: chunk.fileSize,
        materialId: upload.materialId,
        mimeType: chunk.mimeType,
        sourceType: "text",
        storageKey: upload.storageKey,
      },
      method: "POST",
    });
    assert(result.ok, `Extraction should succeed. Body: ${JSON.stringify(result.json)}`);
    assert(result.json?.extractedTextPreview?.includes("Evaporation"), "Extraction should read cloud object content.");
    assert(result.json?.material?.storageKey === upload.storageKey, "Extracted material should retain storageKey.");
    return result.json;
  });

  const generation = await runStep("generation", "generate first progressive MCQ batch", async () => {
    const result = await client(`/api/materials/${encodeURIComponent(upload.materialId)}/generate-flashcards`, {
      body: {
        batchIndex: 0,
        batchMode: "batch",
        batchSize: 3,
        extractedTextPreview: extraction.extractedTextPreview,
        generationMode: "comprehensive",
        idempotencyKey: unique,
        materialId: upload.materialId,
        maxCards: 6,
        requestedCardCount: 3,
        startQuestionIndex: 0,
      },
      method: "POST",
    });
    assertStatus(result, 201, "Generation should return created.");
    assert(result.json?.generationJobId, "Generation should include generationJobId.");
    assert(result.json?.deckId, "Generation should include deckId.");
    assert(Array.isArray(result.json?.cards), "Generation should include cards.");
    assert(result.json.cards.length >= 3, "First progressive batch should include at least 3 cards.");
    result.json.cards.slice(0, 3).forEach(assertMcqCard);
    return result.json;
  });

  const deck = await runStep("persistence", "confirm deck and flashcards persisted", async () => {
    const result = await poll(
      () => client(`/api/decks/${encodeURIComponent(generation.deckId)}`),
      (response) => response.ok && Array.isArray(response.json?.cards) && response.json.cards.length >= 3,
    );
    assert(result.json.deck.id === generation.deckId, "Deck read should return generated deck id.");
    result.json.cards.slice(0, 3).forEach(assertMcqCard);
    return result.json;
  });

  await runStep("ownership", "ownership rejects second user", async () => {
    await secondTokenProvider.getToken({ forceRefresh: true });
    const result = await secondClient(`/api/decks/${encodeURIComponent(generation.deckId)}`);
    assert(
      result.status === 403 || result.status === 404,
      `Cross-user deck access should reject, got ${result.status}.${result.authHint ? ` ${result.authHint}` : ""}`,
    );
  });

  await runStep("review", "create review session and persist progress", async () => {
    await primaryTokenProvider.getToken({ forceRefresh: true });
    const now = new Date();
    const completedAt = new Date(now.getTime() + 1000).toISOString();
    const reviews = deck.cards.slice(0, 3).map((card, index) => ({
      answeredAt: new Date(now.getTime() + index * 250).toISOString(),
      answer: index === 1 ? "again" : "known",
      cardId: card.id,
    }));
    const result = await client("/api/review-sessions", {
      body: {
        completedAt,
        deckId: generation.deckId,
        idempotencyKey: `${unique}-review`,
        mode: "quick-review",
        reviews,
        startedAt: now.toISOString(),
      },
      method: "POST",
    });
    assertStatus(result, 201, "Review session should be created.");
    assert(result.json?.cardsReviewed === reviews.length, "Review response should count reviewed cards.");
    const progress = await client("/api/progress");
    assert(progress.ok, "Progress should be readable after review.");
    assert(progress.json?.reviewedCardCount >= reviews.length, "Progress should include reviewed cards.");
  });

  await runStep("billing", "RevenueCat webhook authentication and subscription status", async () => {
    const missingAuth = await publicClient("/api/billing/revenuecat/webhook", {
      body: { event: {} },
      method: "POST",
    });
    assertStatus(missingAuth, 401, "RevenueCat missing auth should reject.");

    const wrongAuth = await publicClient("/api/billing/revenuecat/webhook", {
      body: { event: {} },
      headers: { Authorization: "Bearer wrong-secret" },
      method: "POST",
    });
    assertStatus(wrongAuth, 403, "RevenueCat wrong auth should reject.");

    const event = {
      event: {
        app_user_id: primaryUserId,
        entitlement_id: "pro",
        event_timestamp_ms: Date.now(),
        expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
        id: `${unique}-rc-event`,
        original_transaction_id: `${unique}-tx`,
        product_id: "flashly_pro_monthly",
        purchased_at_ms: Date.now(),
        store: "PLAY_STORE",
        transaction_id: `${unique}-tx`,
        type: "INITIAL_PURCHASE",
      },
    };
    const valid = await publicClient("/api/billing/revenuecat/webhook", {
      body: event,
      headers: { Authorization: `Bearer ${revenueCatSecret}` },
      method: "POST",
    });
    assert(valid.ok, `RevenueCat valid webhook should accept. Body: ${JSON.stringify(valid.json)}`);
    const idempotent = await publicClient("/api/billing/revenuecat/webhook", {
      body: event,
      headers: { Authorization: `Bearer ${revenueCatSecret}` },
      method: "POST",
    });
    assert(idempotent.ok, "RevenueCat repeated webhook should be idempotent.");

    const subscription = await client("/api/me/subscription");
    assert(subscription.ok, "Subscription status should be readable.");
    assert(subscription.json?.planId === "pro", `Subscription should normalize to pro. Body: ${JSON.stringify(subscription.json)}`);
  });

  await runStep("security", "malformed JSON is rejected", async () => {
    const requestMalformedJson = async (token) =>
      fetch(`${baseUrl.replace(/\/+$/g, "")}/api/uploads`, {
        body: "{not-json",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    let response = await requestMalformedJson(await primaryTokenProvider.getToken());

    if (response.status === 401 && primaryTokenProvider.canRefresh) {
      response = await requestMalformedJson(await primaryTokenProvider.getToken({ forceRefresh: true }));
    }

    assert(
      response.status === 400,
      `Malformed JSON should return 400, got ${response.status}.${
        response.status === 401 && !primaryTokenProvider.canRefresh
          ? " Static Clerk session token may have expired; configure CLERK_SECRET_KEY plus staging session ids to mint fresh tokens."
          : ""
      }`,
    );
    assert(response.headers.get("x-request-id"), "Malformed JSON response should include request id.");
  });

  await runStep("security", "rate limiting is enforced", async () => {
    const attempts = Number(envValue("FLASHLY_STAGING_RATE_LIMIT_ATTEMPTS") ?? 150);
    let sawRateLimit = false;

    for (let index = 0; index < attempts; index += 1) {
      const response = await publicClient("/health");

      if (response.status === 429) {
        sawRateLimit = true;
        assert(response.json?.error?.requestId || response.headers.get("x-request-id"), "Rate-limit response should include request id.");
        break;
      }
    }

    assert(sawRateLimit, `Expected rate limiting within ${attempts} /health requests.`);
  });

  printReport();
  console.log("PASS staging end-to-end smoke");
};

main().catch((error) => {
  printReport();
  console.error("FAIL staging end-to-end smoke");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
