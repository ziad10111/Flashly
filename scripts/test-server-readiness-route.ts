import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { formatReleaseForLog, getReleaseMetadata } from "../src/api/server/releaseMetadata";
import { checkCloudStorageReadiness } from "../src/api/server/storage/readiness";
import type { FlashlyStorageService } from "../src/api/server/storage/types";

const repoRoot = path.resolve(__dirname, "..");
const oldGenericMessage = "Cloud storage write/read/delete readiness check failed.";

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const readSourceFiles = (directory: string): string[] => {
  const files: string[] = [];

  for (const item of readdirSync(directory)) {
    const fullPath = path.join(directory, item);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...readSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/u.test(item)) {
      files.push(fullPath);
    }
  }

  return files;
};

const assertReadyRouteUsesPhasedStorageHelper = () => {
  const serverSource = readFileSync(path.join(repoRoot, "src/api/server/index.ts"), "utf8");

  assert(
    serverSource.includes('import { checkCloudStorageReadiness } from "@/api/server/storage/readiness";'),
    "Expected server entrypoint to import phased cloud storage readiness helper.",
  );
  assert(
    /return\s+checkCloudStorageReadiness\(storageService\);/u.test(serverSource),
    "Expected /ready storage check to call phased cloud storage readiness helper.",
  );
};

const assertOldGenericMessageIsAbsent = () => {
  const offenders = readSourceFiles(path.join(repoRoot, "src")).filter((filePath) =>
    readFileSync(filePath, "utf8").includes(oldGenericMessage),
  );

  assert(offenders.length === 0, `Old generic storage readiness message still exists in ${offenders.join(", ")}.`);
};

const assertWriteFailureUsesSafePhaseMessage = async () => {
  const service: FlashlyStorageService = {
    createStorageKey: () => "unused",
    deleteObject: async () => undefined,
    mode: "cloud",
    prepareUpload: () => ({ storageKey: "unused" }),
    readObject: async () => {
      throw new Error("read should not be reached");
    },
    storeObject: async () => {
      throw new Error("Provider rejected request with Authorization: Bearer REDACTION_TOKEN");
    },
    validateReadiness: () => ({ ok: true }),
  };
  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    const result = await checkCloudStorageReadiness(service);

    assert(result.status === "failed", "Expected simulated write failure to fail readiness.");
    assert(result.message === "Cloud storage readiness failed during write.", "Expected safe write-phase readiness message.");
    assert(result.message !== oldGenericMessage, "Expected old generic readiness message not to be returned.");
    assert(!JSON.stringify(warnings).includes("REDACTION_TOKEN"), "Expected sanitized logs not to expose provider token.");
  } finally {
    console.warn = originalWarn;
  }
};

const assertReleaseMetadataIsSafe = () => {
  const previous = {
    COMMIT_SHA: process.env.COMMIT_SHA,
    FLASHLY_ENV: process.env.FLASHLY_ENV,
    NODE_ENV: process.env.NODE_ENV,
    RAILWAY_DEPLOYMENT_ID: process.env.RAILWAY_DEPLOYMENT_ID,
    RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
    RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA,
  };

  try {
    process.env.RAILWAY_GIT_COMMIT_SHA = "4eefdcb1234567890abcdef";
    process.env.RAILWAY_DEPLOYMENT_ID = "deploy_12345";
    process.env.RAILWAY_ENVIRONMENT_NAME = "staging";

    const release = getReleaseMetadata();
    assert(release.commit === "4eefdcb12345", "Expected release commit to be safely truncated.");
    assert(release.deploymentId === "deploy_12345", "Expected safe Railway deployment id.");
    assert(release.environment === "staging", "Expected safe Railway environment name.");
    assert(formatReleaseForLog().includes("commit=4eefdcb12345"), "Expected startup log release string to include commit.");

    process.env.RAILWAY_GIT_COMMIT_SHA = "https://user:secret@example.com/repo";
    const sanitized = getReleaseMetadata();
    assert(!sanitized.commit, "Expected unsafe commit-like values to be omitted.");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const main = async () => {
  assertReadyRouteUsesPhasedStorageHelper();
  assertOldGenericMessageIsAbsent();
  await assertWriteFailureUsesSafePhaseMessage();
  assertReleaseMetadataIsSafe();
  console.log("PASS server readiness route regression tests");
};

main().catch((error) => {
  console.error("FAIL server readiness route regression tests");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
