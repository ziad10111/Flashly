import { Buffer } from "node:buffer";

import type { FlashlyStorageService } from "./types";

export type StorageReadinessPhase =
  | "write"
  | "read"
  | "compare"
  | "delete"
  | "missing-object-check";

export type StorageReadinessCheck = {
  message?: string;
  status: "ok" | "configured" | "warning" | "failed";
};

type SanitizedStorageError = {
  code?: string;
  httpStatusCode?: number;
  message?: string;
  name?: string;
  phase: StorageReadinessPhase;
  requestId?: string;
};

const REDACTED = "[redacted]";

export const sanitizeStorageErrorMessage = (message: string | undefined) => {
  if (!message) {
    return undefined;
  }

  return message
    .replace(/AWSAccessKeyId=[^&\s]+/gi, `AWSAccessKeyId=${REDACTED}`)
    .replace(/X-Amz-(Credential|Signature|Security-Token)=[^&\s]+/gi, `X-Amz-$1=${REDACTED}`)
    .replace(/Authorization:\s*[^\n\r]+/gi, `Authorization: ${REDACTED}`)
    .replace(/(accessKeyId|secretAccessKey|SecretAccessKey|AccessKeyId)\s*[:=]\s*["']?[^"',\s]+/g, `$1=${REDACTED}`)
    .replace(/https?:\/\/[^@\s]+@/gi, "https://[redacted]@")
    .slice(0, 220);
};

export const getSanitizedStorageError = (
  phase: StorageReadinessPhase,
  error: unknown,
): SanitizedStorageError => {
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const metadata = typeof record.$metadata === "object" && record.$metadata !== null
    ? (record.$metadata as Record<string, unknown>)
    : {};
  const code = typeof record.Code === "string" ? record.Code : typeof record.code === "string" ? record.code : undefined;
  const requestId =
    typeof metadata.requestId === "string"
      ? metadata.requestId
      : typeof metadata.extendedRequestId === "string"
        ? metadata.extendedRequestId
        : undefined;

  return {
    code,
    httpStatusCode: typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : undefined,
    message: sanitizeStorageErrorMessage(error instanceof Error ? error.message : String(error)),
    name: error instanceof Error ? error.name : typeof record.name === "string" ? record.name : undefined,
    phase,
    requestId,
  };
};

const logStorageReadinessFailure = (phase: StorageReadinessPhase, error: unknown) => {
  console.warn("[Flashly Storage Readiness]", getSanitizedStorageError(phase, error));
};

const bytesFromBase64 = (value: string) => Uint8Array.from(Buffer.from(value, "base64"));

const textFromReadResult = (result: Awaited<ReturnType<NonNullable<FlashlyStorageService["readObject"]>>>) => {
  if (result.textContent !== undefined) {
    return result.textContent;
  }

  return new TextDecoder().decode(bytesFromBase64(result.contentBase64));
};

const failed = (phase: StorageReadinessPhase): StorageReadinessCheck => ({
  message: `Cloud storage readiness failed during ${phase}.`,
  status: "failed",
});

export const checkCloudStorageReadiness = async (
  storageService: FlashlyStorageService,
): Promise<StorageReadinessCheck> => {
  const readiness = storageService.validateReadiness();

  if (!readiness.ok) {
    return {
      message: readiness.message,
      status: "failed",
    };
  }

  if (storageService.mode !== "cloud") {
    return { status: "configured" };
  }

  if (!storageService.storeObject || !storageService.readObject || !storageService.deleteObject) {
    return {
      message: "Cloud storage must support write/read/delete readiness checks.",
      status: "failed",
    };
  }

  const storageKey = `readiness/tmp/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const textContent = `Flashly readiness ${new Date().toISOString()}`;
  let wroteObject = false;
  let deletedObject = false;

  try {
    try {
      await storageService.storeObject({
        contentType: "text/plain",
        fileName: "readiness.txt",
        metadata: {
          "flashly-readiness": "true",
        },
        sizeBytes: textContent.length,
        storageKey,
        textContent,
      });
      wroteObject = true;
    } catch (error) {
      logStorageReadinessFailure("write", error);
      return failed("write");
    }

    let stored;
    try {
      stored = await storageService.readObject(storageKey);
    } catch (error) {
      logStorageReadinessFailure("read", error);
      return failed("read");
    }

    try {
      if (textFromReadResult(stored) !== textContent) {
        throw new Error("Read-back content did not match readiness object.");
      }
    } catch (error) {
      logStorageReadinessFailure("compare", error);
      return failed("compare");
    }

    try {
      await storageService.deleteObject(storageKey);
      deletedObject = true;
    } catch (error) {
      logStorageReadinessFailure("delete", error);
      return failed("delete");
    }

    if (storageService.headObject) {
      try {
        const missing = await storageService.headObject(storageKey);

        if (missing.exists) {
          throw new Error("Deleted readiness object still exists.");
        }
      } catch (error) {
        logStorageReadinessFailure("missing-object-check", error);
        return failed("missing-object-check");
      }
    }

    return { status: "ok" };
  } finally {
    if (wroteObject && !deletedObject && storageService.deleteObject) {
      await storageService.deleteObject(storageKey).catch((error) => {
        logStorageReadinessFailure("delete", error);
      });
    }
  }
};
