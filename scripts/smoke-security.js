const apiBaseUrl = process.env.FLASHLY_SMOKE_API_BASE_URL || "http://localhost:8081";

const postJson = async (path, body, clientKey = "security-smoke") => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": clientKey,
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => null);

  return { payload, status: response.status };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async () => {
  const blockedExtension = await postJson("/api/uploads", {
    fileName: "malware.exe",
    fileSize: 1024,
    idempotencyKey: "security-blocked-extension",
    mimeType: "application/x-msdownload",
  }, "security-smoke-blocked-extension");

  assert(blockedExtension.status === 415, `Expected executable upload to be blocked, got ${blockedExtension.status}.`);
  assert(blockedExtension.payload?.error?.code === "unsupported-media", "Expected unsupported-media error for executable upload.");

  const oversized = await postJson("/api/uploads/chunk/start", {
    fileName: "huge.pdf",
    fileSize: 51 * 1024 * 1024,
    mimeType: "application/pdf",
    totalChunks: 1,
  }, "security-smoke-oversized");

  assert([400, 429].includes(oversized.status), `Expected oversized chunk upload to be rejected, got ${oversized.status}.`);
  assert(
    ["rate-limited", "validation-error"].includes(oversized.payload?.error?.code),
    "Expected structured validation or entitlement error for oversized chunk upload.",
  );

  const rateLimitMax = Number(process.env.FLASHLY_RATE_LIMIT_MAX || 0);

  if (rateLimitMax > 0 && rateLimitMax <= 5) {
    let rateLimitedResponse = null;

    for (let index = 0; index < rateLimitMax + 2; index += 1) {
      const response = await fetch(`${apiBaseUrl}/health`, {
        headers: {
          "X-Forwarded-For": "security-smoke-rate-limit",
        },
      });

      if (response.status === 429) {
        rateLimitedResponse = await response.json().catch(() => null);
        break;
      }
    }

    assert(rateLimitedResponse?.error?.code === "rate-limited", "Expected structured rate-limited response.");
    assert(rateLimitedResponse?.error?.requestId, "Expected rate-limited response to include requestId.");
  } else {
    console.info("SKIP rate limit smoke shape check. Set FLASHLY_RATE_LIMIT_MAX=2 before starting the server to enable it.");
  }

  console.info("PASS security smoke check");
};

main().catch((error) => {
  console.error("FAIL security smoke check");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
