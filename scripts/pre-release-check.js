const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const results = [];

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

const hasEnv = (keys) => keys.every((key) => Boolean(envValue(key)));

const productionModeValues = {
  EXPO_PUBLIC_USE_BACKEND: "true",
  EXPO_PUBLIC_FLASHLY_AUTH_MODE: "clerk",
  FLASHLY_DATA_MODE: "database",
  FLASHLY_STORAGE_MODE: "cloud",
  FLASHLY_STORAGE_PROVIDER: "s3",
  FLASHLY_EXTRACTION_MODE: "external",
  FLASHLY_GENERATION_MODE: "external",
  FLASHLY_AI_PROVIDER: "nvidia",
  FLASHLY_OCR_PROVIDER: "ocrspace",
  FLASHLY_BILLING_MODE: "revenuecat",
  EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID: "pro",
};

const productionPresenceKeys = [
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "DATABASE_URL",
  "FLASHLY_S3_ENDPOINT",
  "FLASHLY_S3_REGION",
  "FLASHLY_S3_BUCKET",
  "FLASHLY_S3_ACCESS_KEY_ID",
  "FLASHLY_S3_SECRET_ACCESS_KEY",
  "FLASHLY_AI_API_KEY",
  "FLASHLY_OCR_API_KEY",
  "REVENUECAT_WEBHOOK_SECRET",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
];

const productionEnvLooksConfigured = () => {
  const modesConfigured = Object.entries(productionModeValues).every(
    ([key, expected]) => envValue(key) === expected,
  );

  const hasDatabaseCa = Boolean(envValue("DATABASE_CA_CERT") || envValue("DATABASE_CA_CERT_BASE64"));

  return modesConfigured && hasEnv(productionPresenceKeys) && hasDatabaseCa;
};

const storageEnvLooksConfigured = () =>
  envValue("FLASHLY_STORAGE_MODE") === "cloud" &&
  envValue("FLASHLY_STORAGE_PROVIDER") === "s3" &&
  hasEnv([
    "FLASHLY_S3_ENDPOINT",
    "FLASHLY_S3_REGION",
    "FLASHLY_S3_BUCKET",
    "FLASHLY_S3_ACCESS_KEY_ID",
    "FLASHLY_S3_SECRET_ACCESS_KEY",
  ]);

const checkBackendReachable = async () => {
  const baseUrl = envValue("FLASHLY_SMOKE_API_BASE_URL") || "http://localhost:8081";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
      signal: controller.signal,
    });

    return {
      baseUrl,
      reachable: response.ok,
    };
  } catch {
    return {
      baseUrl,
      reachable: false,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const printOutput = (output) => {
  const trimmed = output.trim();

  if (!trimmed) {
    return;
  }

  for (const line of trimmed.split(/\r?\n/g)) {
    console.log(`    ${line}`);
  }
};

const runNpmScript = (name, script) => {
  console.log(`RUN ${name}: npm run ${script}`);

  const result = spawnSync(npmCommand, ["run", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
    windowsHide: true,
  });

  if (result.error) {
    printOutput(result.error.message);
  }

  if (result.stdout) {
    printOutput(result.stdout);
  }

  if (result.stderr) {
    printOutput(result.stderr);
  }

  const ok = !result.error && result.status === 0;
  results.push({
    details: ok
      ? "Completed successfully."
      : result.error
        ? result.error.message
        : `Exited with code ${result.status}.`,
    name,
    status: ok ? "PASS" : "FAIL",
  });

  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  console.log("");
};

const skipCheck = (name, details) => {
  results.push({
    details,
    name,
    status: "SKIPPED",
  });

  console.log(`SKIPPED ${name}`);
  console.log(`    ${details}`);
  console.log("");
};

const printSummary = () => {
  const failed = results.filter((result) => result.status === "FAIL");
  const skipped = results.filter((result) => result.status === "SKIPPED");

  console.log("Pre-release check summary");
  console.log("=========================");

  for (const result of results) {
    console.log(`${result.status.padEnd(7)} ${result.name} - ${result.details}`);
  }

  console.log("");

  if (failed.length > 0) {
    console.log("FINAL STATUS: FAIL");
    console.log("Next actions:");
    console.log("- Fix failing checks above and rerun npm run pre-release-check.");

    if (skipped.length > 0) {
      console.log("- Review skipped checks before promoting a Play Store build.");
    }

    process.exitCode = 1;
    return;
  }

  if (skipped.length > 0) {
    console.log("FINAL STATUS: PASS WITH SKIPS");
    console.log("Next actions:");
    console.log("- Run skipped service checks in a configured staging or production environment.");
    console.log("- Do not submit to Google Play production until production verifier and service smokes pass.");
    return;
  }

  console.log("FINAL STATUS: PASS");
  console.log("Next actions:");
  console.log("- Continue with Android internal testing and manual QA.");
};

const main = async () => {
  loadDotEnv();

  runNpmScript("TypeScript", "typecheck");
  runNpmScript("Lint", "lint");
  runNpmScript("Runtime validation", "test:runtime-validation");
  runNpmScript("PostgreSQL TLS configuration", "test:postgres-config");
  runNpmScript("Storage readiness diagnostics", "test:storage-readiness");
  runNpmScript("RevenueCat webhook security", "smoke:billing");

  const backend = await checkBackendReachable();

  if (backend.reachable) {
    runNpmScript("Security smoke", "smoke:security");
  } else {
    skipCheck(
      "Security smoke",
      `Backend is not reachable at ${backend.baseUrl}. Start the server or set FLASHLY_SMOKE_API_BASE_URL.`,
    );
  }

  runNpmScript("Server build", "build:server");

  const requireProductionEnv =
    envValue("FLASHLY_REQUIRE_PRODUCTION_ENV") === "true" ||
    envValue("FLASHLY_PRE_RELEASE_STRICT_PRODUCTION") === "true";

  if (productionEnvLooksConfigured()) {
    runNpmScript("Production environment verification", "verify:production");
  } else if (requireProductionEnv) {
    results.push({
      details:
        "Production env is required by FLASHLY_REQUIRE_PRODUCTION_ENV/FLASHLY_PRE_RELEASE_STRICT_PRODUCTION but is incomplete.",
      name: "Production environment verification",
      status: "FAIL",
    });
    console.log("FAIL Production environment verification");
    console.log(
      "    Production env is required, but one or more production mode values or required variables are missing.",
    );
    console.log("");
  } else {
    skipCheck(
      "Production environment verification",
      "Production env is not fully configured. Set production env or FLASHLY_REQUIRE_PRODUCTION_ENV=true to enforce.",
    );
  }

  if (envValue("DATABASE_URL")) {
    runNpmScript("Database smoke", "smoke:database");
    runNpmScript("Database generation persistence smoke", "smoke:database-generation");
    runNpmScript("Ownership smoke", "smoke:ownership");
  } else {
    skipCheck("Database smoke", "DATABASE_URL is not set.");
    skipCheck("Database generation persistence smoke", "DATABASE_URL is not set.");
    skipCheck("Ownership smoke", "DATABASE_URL is not set.");
  }

  if (storageEnvLooksConfigured()) {
    runNpmScript("Storage smoke", "smoke:storage");
    if (envValue("DATABASE_URL")) {
      runNpmScript("Cloud extraction smoke", "smoke:cloud-extraction");
    } else {
      skipCheck("Cloud extraction smoke", "DATABASE_URL is not set.");
    }
  } else {
    skipCheck(
      "Storage smoke",
      "Cloud storage env is incomplete or FLASHLY_STORAGE_MODE is not cloud.",
    );
    skipCheck(
      "Cloud extraction smoke",
      "Cloud storage env is incomplete or FLASHLY_STORAGE_MODE is not cloud.",
    );
  }

  printSummary();
};

main().catch((error) => {
  console.error("FAIL pre-release check crashed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
