const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env");

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

const requireHttpsBaseUrl = () => {
  const value = envValue("FLASHLY_STAGING_BASE_URL");

  if (!value) {
    throw new Error("FLASHLY_STAGING_BASE_URL is required.");
  }

  const url = new URL(value);

  if (url.protocol !== "https:") {
    throw new Error("FLASHLY_STAGING_BASE_URL must use HTTPS.");
  }

  return value.replace(/\/+$/g, "");
};

const requestJson = async (baseUrl, pathName) => {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${pathName}`);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  return {
    elapsedMs: Date.now() - startedAt,
    json,
    requestId: response.headers.get("x-request-id"),
    status: response.status,
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertReadyCheck = (ready, key, acceptedStatuses = ["ok", "configured"]) => {
  const check = ready.json?.checks?.[key];

  assert(check, `/ready is missing ${key} check.`);
  assert(
    acceptedStatuses.includes(check.status),
    `/ready ${key} status must be ${acceptedStatuses.join(" or ")}, got ${check.status}.`,
  );
};

const main = async () => {
  loadDotEnv();

  const baseUrl = requireHttpsBaseUrl();
  const health = await requestJson(baseUrl, "/health");

  assert(health.status === 200, `/health expected 200, got ${health.status}.`);
  assert(health.json?.service === "flashly-backend", "/health did not identify Flashly backend.");

  const ready = await requestJson(baseUrl, "/ready");

  assert(ready.status === 200, `/ready expected 200, got ${ready.status}.`);
  assert(ready.json?.environment === "staging", `/ready environment must be staging, got ${ready.json?.environment}.`);
  assert(ready.json?.status === "ready", `/ready status must be ready, got ${ready.json?.status}.`);

  for (const key of ["database", "migrations", "storage"]) {
    assertReadyCheck(ready, key, ["ok"]);
  }

  for (const key of ["auth", "ocr", "ai", "billing", "security"]) {
    assertReadyCheck(ready, key, ["ok", "configured", "warning"]);
  }

  const failedChecks = Object.entries(ready.json?.checks ?? {})
    .filter(([, value]) => value?.status === "failed")
    .map(([key]) => key);

  assert(failedChecks.length === 0, `/ready has failed checks: ${failedChecks.join(", ")}.`);

  console.log("PASS staging deployment check");
  console.log(
    JSON.stringify(
      {
        baseUrl,
        health: {
          elapsedMs: health.elapsedMs,
          requestId: health.requestId,
          status: health.status,
        },
        ready: {
          checks: ready.json.checks,
          elapsedMs: ready.elapsedMs,
          environment: ready.json.environment,
          requestId: ready.requestId,
          status: ready.status,
        },
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error("FAIL staging deployment check");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
