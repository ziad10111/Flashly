import {
  checkCloudStorageReadiness,
  getSanitizedStorageError,
  type StorageReadinessPhase,
} from "../src/api/server/storage/readiness";
import type { FlashlyStorageService, ReadStorageObjectResult, StoreStorageObjectInput } from "../src/api/server/storage/types";

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const makeProviderError = () => {
  const error = new Error(
    "Request failed with Authorization: Bearer REDACTION_TOKEN and AWSAccessKeyId=ACCESS_TO_REDACT and X-Amz-Signature=SIGNATURE_TO_REDACT",
  ) as Error & {
    $metadata?: {
      httpStatusCode?: number;
      requestId?: string;
    };
    Code?: string;
  };
  error.name = "S3ServiceException";
  error.Code = "AccessDenied";
  error.$metadata = {
    httpStatusCode: 403,
    requestId: "safe-request-id",
  };

  return error;
};

const createService = (options: {
  failPhase?: StorageReadinessPhase;
  mismatch?: boolean;
} = {}) => {
  let storedText = "";
  let storageKey = "";
  let deleteCalls = 0;

  const service: FlashlyStorageService & { getDeleteCalls: () => number } = {
    createStorageKey: () => "unused",
    deleteObject: async () => {
      deleteCalls += 1;

      if (options.failPhase === "delete") {
        throw makeProviderError();
      }

      storedText = "";
    },
    getDeleteCalls: () => deleteCalls,
    headObject: async () => {
      if (options.failPhase === "missing-object-check") {
        throw makeProviderError();
      }

      return {
        exists: false,
        storageKey,
      };
    },
    mode: "cloud",
    prepareUpload: () => ({
      storageKey: "unused",
    }),
    readObject: async (): Promise<ReadStorageObjectResult> => {
      if (options.failPhase === "read") {
        throw makeProviderError();
      }

      return {
        contentBase64: Buffer.from(options.mismatch ? "different" : storedText, "utf8").toString("base64"),
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength(options.mismatch ? "different" : storedText),
        storageKey,
        textContent: options.mismatch ? "different" : storedText,
      };
    },
    storeObject: async (input: StoreStorageObjectInput) => {
      if (options.failPhase === "write") {
        throw makeProviderError();
      }

      assert(input.storageKey.startsWith("readiness/tmp/"), "Expected readiness key to use temporary prefix.");
      storageKey = input.storageKey;
      storedText = input.textContent ?? "";

      return {
        contentType: input.contentType,
        sizeBytes: Buffer.byteLength(storedText),
        storageKey,
      };
    },
    validateReadiness: () => ({ ok: true }),
  };

  return service;
};

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

  return warnings;
};

const assertFailedPhase = async (
  phase: StorageReadinessPhase,
  service = createService({ failPhase: phase }),
  options: { expectProviderMetadata?: boolean } = { expectProviderMetadata: true },
) => {
  const warnings = await captureWarnings(async () => {
    const result = await checkCloudStorageReadiness(service);
    assert(result.status === "failed", `Expected ${phase} to fail.`);
    assert(result.message === `Cloud storage readiness failed during ${phase}.`, `Expected safe ${phase} message.`);
  });

  const serialized = JSON.stringify(warnings);
  assert(serialized.includes(phase), `Expected sanitized log to include phase ${phase}.`);
  if (options.expectProviderMetadata !== false) {
    assert(serialized.includes("AccessDenied"), "Expected sanitized log to include provider code.");
    assert(serialized.includes("403"), "Expected sanitized log to include HTTP status.");
    assert(serialized.includes("safe-request-id"), "Expected sanitized log to include request id.");
  }
  assert(!serialized.includes("REDACTION_TOKEN"), "Expected log to redact bearer token.");
  assert(!serialized.includes("ACCESS_TO_REDACT"), "Expected log to redact access key id.");
  assert(!serialized.includes("SIGNATURE_TO_REDACT"), "Expected log to redact signature.");
};

const main = async () => {
  await assertFailedPhase("write");
  await assertFailedPhase("read");
  await assertFailedPhase("delete");
  await assertFailedPhase("missing-object-check");
  await assertFailedPhase("compare", createService({ mismatch: true }), {
    expectProviderMetadata: false,
  });

  const cleanupService = createService({ failPhase: "read" });
  await captureWarnings(async () => {
    await checkCloudStorageReadiness(cleanupService);
  });
  assert(cleanupService.getDeleteCalls() === 1, "Expected failed read to attempt cleanup delete in finally.");

  const successWarnings = await captureWarnings(async () => {
    const result = await checkCloudStorageReadiness(createService());
    assert(result.status === "ok", "Expected successful lifecycle to pass.");
  });
  assert(successWarnings.length === 0, "Expected no warnings for successful lifecycle.");

  const sanitized = getSanitizedStorageError("write", makeProviderError());
  assert(sanitized.phase === "write", "Expected sanitizer to preserve phase.");
  assert(sanitized.name === "S3ServiceException", "Expected sanitizer to preserve safe error name.");
  assert(sanitized.code === "AccessDenied", "Expected sanitizer to preserve safe provider code.");
  assert(sanitized.httpStatusCode === 403, "Expected sanitizer to preserve HTTP status.");
  assert(sanitized.requestId === "safe-request-id", "Expected sanitizer to preserve request id.");
  assert(!JSON.stringify(sanitized).includes("REDACTION_TOKEN"), "Expected sanitizer to redact secret values.");

  console.log("PASS storage readiness diagnostics tests");
};

main().catch((error) => {
  console.error("FAIL storage readiness diagnostics tests");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
