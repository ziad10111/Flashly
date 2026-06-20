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

const requiredValues = {
  EXPO_PUBLIC_FLASHLY_AUTH_MODE: "clerk",
  EXPO_PUBLIC_USE_BACKEND: "true",
  FLASHLY_AI_PROVIDER: "nvidia",
  FLASHLY_BILLING_MODE: "revenuecat",
  FLASHLY_DATA_MODE: "database",
  FLASHLY_ENV: "staging",
  FLASHLY_EXTRACTION_MODE: "external",
  FLASHLY_GENERATION_MODE: "external",
  FLASHLY_OCR_PROVIDER: "ocrspace",
  FLASHLY_STORAGE_MODE: "cloud",
  FLASHLY_STORAGE_PROVIDER: "s3",
};

const requiredPresence = [
  "CLERK_SECRET_KEY",
  "DATABASE_URL",
  "EXPO_PUBLIC_FLASHLY_API_BASE_URL",
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
  "EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID",
  "FLASHLY_AI_API_KEY",
  "FLASHLY_AI_MODEL",
  "FLASHLY_OCR_API_KEY",
  "FLASHLY_S3_ACCESS_KEY_ID",
  "FLASHLY_S3_BUCKET",
  "FLASHLY_S3_ENDPOINT",
  "FLASHLY_S3_REGION",
  "FLASHLY_S3_SECRET_ACCESS_KEY",
  "FLASHLY_STAGING_BASE_URL",
  "REVENUECAT_WEBHOOK_SECRET",
];

const isPlaceholder = (value) =>
  /^(changeme|change_me|todo|replace_me|example|placeholder|server_side_|short_lived_|pk_test_or_live_key)/i.test(value);

const validateUrl = (key, failures) => {
  const value = envValue(key);

  if (!value) {
    return;
  }

  try {
    new URL(value);
  } catch {
    failures.push(`${key} must be a valid URL.`);
  }
};

const main = () => {
  loadDotEnv();

  const failures = [];

  for (const [key, expected] of Object.entries(requiredValues)) {
    if (envValue(key) !== expected) {
      failures.push(`${key} must be ${expected}.`);
    }
  }

  for (const key of requiredPresence) {
    const value = envValue(key);

    if (!value) {
      failures.push(`${key} is required.`);
    } else if (isPlaceholder(value)) {
      failures.push(`${key} appears to contain a placeholder value.`);
    }
  }

  const primaryStaticToken = envValue("FLASHLY_STAGING_TEST_TOKEN");
  const secondStaticToken = envValue("FLASHLY_STAGING_SECOND_USER_TOKEN");
  const primarySessionId = envValue("FLASHLY_STAGING_TEST_SESSION_ID");
  const secondSessionId = envValue("FLASHLY_STAGING_SECOND_USER_SESSION_ID");
  const hasStaticTokens = Boolean(primaryStaticToken && secondStaticToken);
  const hasSessionTokens = Boolean(envValue("CLERK_SECRET_KEY") && primarySessionId && secondSessionId);
  const hasPartialStaticTokens = Boolean(primaryStaticToken || secondStaticToken) && !hasStaticTokens;
  const hasPartialSessionTokens = Boolean(primarySessionId || secondSessionId) && !hasSessionTokens;

  if (!hasStaticTokens && !hasSessionTokens) {
    failures.push(
      "Configure either FLASHLY_STAGING_TEST_TOKEN plus FLASHLY_STAGING_SECOND_USER_TOKEN, or CLERK_SECRET_KEY plus both staging session ids.",
    );
  }

  if (hasPartialStaticTokens) {
    failures.push("FLASHLY_STAGING_TEST_TOKEN and FLASHLY_STAGING_SECOND_USER_TOKEN must be configured together.");
  }

  if (hasPartialSessionTokens) {
    failures.push("FLASHLY_STAGING_TEST_SESSION_ID and FLASHLY_STAGING_SECOND_USER_SESSION_ID must be configured together with CLERK_SECRET_KEY.");
  }

  for (const [key, value] of [
    ["FLASHLY_STAGING_TEST_TOKEN", primaryStaticToken],
    ["FLASHLY_STAGING_SECOND_USER_TOKEN", secondStaticToken],
    ["FLASHLY_STAGING_TEST_SESSION_ID", primarySessionId],
    ["FLASHLY_STAGING_SECOND_USER_SESSION_ID", secondSessionId],
  ]) {
    if (value && isPlaceholder(value)) {
      failures.push(`${key} appears to contain a placeholder value.`);
    }
  }

  for (const key of ["EXPO_PUBLIC_FLASHLY_API_BASE_URL", "FLASHLY_STAGING_BASE_URL", "FLASHLY_S3_ENDPOINT", "FLASHLY_AI_BASE_URL"]) {
    validateUrl(key, failures);
  }

  if (hasStaticTokens && primaryStaticToken === secondStaticToken) {
    failures.push("FLASHLY_STAGING_TEST_TOKEN and FLASHLY_STAGING_SECOND_USER_TOKEN must belong to different users.");
  }

  if (hasSessionTokens && primarySessionId === secondSessionId) {
    failures.push("FLASHLY_STAGING_TEST_SESSION_ID and FLASHLY_STAGING_SECOND_USER_SESSION_ID must belong to different users.");
  }

  if (failures.length > 0) {
    console.error("FAIL staging environment verification");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("PASS staging environment verification");
};

main();
