const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

Object.assign(process.env, {
  FLASHLY_AI_API_KEY: "nvapi-redaction-fixture",
  FLASHLY_AI_BASE_URL: "https://integrate.api.nvidia.com/v1",
  FLASHLY_AI_MODEL: "openai/gpt-oss-20b",
  FLASHLY_AI_REQUEST_TIMEOUT_MS: "120000",
});

const validBody = {
  choices: [
    {
      message: {
        content: '{"flashcards":[]}',
      },
    },
  ],
};

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    status: init?.status ?? 200,
  });

const captureWarnings = async (action: () => Promise<void>) => {
  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    await action();
  } finally {
    console.warn = originalWarn;
  }

  return JSON.stringify(warnings);
};

const assertProviderError = (
  error: unknown,
  expected: {
    code: string;
    retryable?: boolean;
    status?: number;
  },
) => {
  assert(error instanceof Error && error.name === "GenerationServiceFailureError", "Expected GenerationServiceFailureError.");
  const generationError = error as Error & {
    code?: string;
    retryable?: boolean;
    status?: number;
  };
  assert(generationError.code === expected.code, `Expected code ${expected.code}, got ${generationError.code}.`);

  if (expected.status !== undefined) {
    assert(generationError.status === expected.status, `Expected status ${expected.status}, got ${generationError.status}.`);
  }

  if (expected.retryable !== undefined) {
    assert(generationError.retryable === expected.retryable, `Expected retryable=${expected.retryable}.`);
  }
};

const main = async () => {
  const { createNvidiaChatCompletionsCaller } = await import(
    "../src/api/server/generation/providers/nvidiaGenerationProvider"
  );

  {
    let calls = 0;
    const caller = createNvidiaChatCompletionsCaller({
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse(validBody);
      },
      maxRetries: 0,
      timeoutMs: 1_000,
    });
    const output = await caller("normal prompt");
    assert(output === '{"flashcards":[]}', "Expected successful NVIDIA output text.");
    assert(calls === 1, "Expected one successful provider call.");
  }

  {
    const caller = createNvidiaChatCompletionsCaller({
      fetchImpl: (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            const error = new Error("The operation was aborted.");
            error.name = "AbortError";
            reject(error);
          });
        }),
      maxRetries: 0,
      timeoutMs: 5,
    });

    try {
      await caller("slow prompt");
      throw new Error("Expected timeout to throw.");
    } catch (error) {
      assertProviderError(error, {
        code: "ai-provider-timeout",
        retryable: true,
        status: 504,
      });
    }
  }

  {
    let calls = 0;
    const caller = createNvidiaChatCompletionsCaller({
      fetchImpl: async () => {
        calls += 1;
        return calls === 1 ? jsonResponse({ error: "temporary" }, { status: 503 }) : jsonResponse(validBody);
      },
      maxRetries: 1,
      random: () => 0,
      sleep: async () => undefined,
    });
    const output = await caller("retry prompt");
    assert(output === '{"flashcards":[]}', "Expected retry to return successful output.");
    assert(calls === 2, "Expected one retry after 503.");
  }

  {
    let sleptFor: number | undefined;
    let calls = 0;
    const caller = createNvidiaChatCompletionsCaller({
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse({ error: "rate limit" }, { headers: { "Retry-After": "1" }, status: 429 })
          : jsonResponse(validBody);
      },
      maxRetries: 1,
      sleep: async (ms) => {
        sleptFor = ms;
      },
    });
    await caller("rate limit prompt");
    assert(calls === 2, "Expected one retry after 429.");
    assert(sleptFor === 1000, `Expected Retry-After delay of 1000ms, got ${sleptFor}.`);
  }

  for (const status of [400, 401, 403]) {
    let calls = 0;
    const caller = createNvidiaChatCompletionsCaller({
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ error: "no retry" }, { status });
      },
      maxRetries: 1,
      sleep: async () => {
        throw new Error(`${status} should not sleep before retry.`);
      },
    });

    try {
      await caller(`status ${status}`);
      throw new Error(`Expected HTTP ${status} to throw.`);
    } catch (error) {
      assert(calls === 1, `Expected HTTP ${status} not to retry.`);
      assertProviderError(error, {
        code:
          status === 401
            ? "ai-provider-authentication"
            : status === 403
              ? "ai-provider-authorization"
              : "ai-provider-upstream",
        retryable: false,
        status: status === 400 ? 502 : 500,
      });
    }
  }

  {
    let calls = 0;
    const caller = createNvidiaChatCompletionsCaller({
      fetchImpl: async () => {
        calls += 1;
        const error = new Error("connect ETIMEDOUT");
        (error as Error & { code?: string }).code = "ETIMEDOUT";
        throw error;
      },
      maxRetries: 1,
      random: () => 0,
      sleep: async () => undefined,
    });

    try {
      await caller("network timeout");
      throw new Error("Expected retry exhaustion to throw.");
    } catch (error) {
      assert(calls === 2, "Expected network timeout to retry at most once.");
      assertProviderError(error, {
        code: "ai-provider-timeout",
        retryable: true,
        status: 504,
      });
    }
  }

  {
    const invalidJsonCaller = createNvidiaChatCompletionsCaller({
      fetchImpl: async () => new Response("{not-json", { status: 200 }),
      maxRetries: 0,
    });
    try {
      await invalidJsonCaller("invalid json");
      throw new Error("Expected invalid JSON to throw.");
    } catch (error) {
      assertProviderError(error, {
        code: "ai-provider-invalid-response",
        retryable: false,
        status: 502,
      });
    }

    const invalidSchemaCaller = createNvidiaChatCompletionsCaller({
      fetchImpl: async () => jsonResponse({ choices: [] }),
      maxRetries: 0,
    });
    try {
      await invalidSchemaCaller("invalid schema");
      throw new Error("Expected schema-invalid response to throw.");
    } catch (error) {
      assertProviderError(error, {
        code: "ai-provider-invalid-response",
        retryable: false,
        status: 502,
      });
    }
  }

  {
    let calls = 0;
    const warnings = await captureWarnings(async () => {
      const caller = createNvidiaChatCompletionsCaller({
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse({ error: "Authorization: Bearer nvapi-redaction-fixture" }, { status: 503 });
        },
        maxRetries: 0,
      });

      try {
        await caller("uploaded text should not be logged");
      } catch {
        // Expected.
      }
    });
    assert(calls === 1, "Expected diagnostics test to call provider once.");
    assert(!warnings.includes("nvapi-redaction-fixture"), "Expected logs not to contain API key.");
    assert(!warnings.includes("Authorization:"), "Expected logs not to contain Authorization header.");
    assert(!warnings.includes("uploaded text should not be logged"), "Expected logs not to contain prompt text.");
  }

  console.log("PASS NVIDIA generation provider tests");
};

main().catch((error) => {
  console.error("FAIL NVIDIA generation provider tests");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
