const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

Object.assign(process.env, {
  CLERK_SECRET_KEY: "clerk-test-secret-value",
  DATABASE_URL: "postgresql://db.example.com/defaultdb?sslmode=require",
  DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\\nMIIBtestcertificatebody\\n-----END CERTIFICATE-----",
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_staging_value",
  EXPO_PUBLIC_FLASHLY_AUTH_MODE: "clerk",
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "goog_test_store_sdk_key",
  EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID: "pro",
  EXPO_PUBLIC_USE_BACKEND: "true",
  FLASHLY_AI_API_KEY: "nvapi-staging-value",
  FLASHLY_AI_BASE_URL: "https://integrate.api.nvidia.com/v1",
  FLASHLY_AI_MODEL: "openai/gpt-oss-20b",
  FLASHLY_AI_PROVIDER: "nvidia",
  FLASHLY_AI_REQUEST_TIMEOUT_MS: "120000",
  FLASHLY_BILLING_MODE: "revenuecat",
  FLASHLY_DATA_MODE: "database",
  FLASHLY_ENV: "staging",
  FLASHLY_EXTRACTION_MODE: "external",
  FLASHLY_GENERATION_MODE: "external",
  FLASHLY_OCR_API_KEY: "ocrspace-test-key",
  FLASHLY_OCR_API_URL: "https://api.ocr.space/parse/image",
  FLASHLY_OCR_PROVIDER: "ocrspace",
  FLASHLY_OCR_TIMEOUT_MS: "20000",
  FLASHLY_RATE_LIMIT_MAX: "120",
  FLASHLY_RATE_LIMIT_WINDOW_MS: "60000",
  FLASHLY_S3_ACCESS_KEY_ID: "test-access-key",
  FLASHLY_S3_BUCKET: "flashly-staging-bucket",
  FLASHLY_S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
  FLASHLY_S3_REGION: "auto",
  FLASHLY_S3_SECRET_ACCESS_KEY: "test-secret-key",
  FLASHLY_SERVER_MAX_BODY_BYTES: "83886080",
  FLASHLY_STORAGE_MODE: "cloud",
  FLASHLY_STORAGE_PROVIDER: "s3",
  REVENUECAT_WEBHOOK_SECRET: "revenuecat-test-secret",
});

const main = async () => {
  const { isExplicitPlaceholderValue, validateRuntimeEnvironment } = await import("../src/api/server/runtimeValidation");

  const legitimateValues = [
    "s3",
    "openai/gpt-oss-20b",
    "pro",
    "pk_test_valid_staging_key",
    "goog_test_store_sdk_key",
    "postgresql://example.aivencloud.com/defaultdb?sslmode=require",
    "flashly-staging-bucket",
    "us-east-1",
    "project_test_store",
    "secret-looking-but-real-value",
  ];

  const explicitPlaceholders = [
    "changeme",
    "change-me",
    "change_me",
    "replace-me",
    "replace_me",
    "placeholder",
    "todo",
    "tbd",
    "<DATABASE_URL>",
    "${DATABASE_URL}",
    "your-api-key",
    "replace-secret",
    "insert-value",
    "enter-token",
  ];

  for (const value of legitimateValues) {
    assert(!isExplicitPlaceholderValue(value), `Expected legitimate value to pass placeholder detection: ${value}`);
  }

  for (const value of explicitPlaceholders) {
    assert(isExplicitPlaceholderValue(value), `Expected explicit placeholder to fail placeholder detection: ${value}`);
  }

  assert(!isExplicitPlaceholderValue(""), "Empty strings are handled by missing-variable validation, not placeholder detection.");
  assert(!isExplicitPlaceholderValue(undefined), "Undefined values are handled by missing-variable validation, not placeholder detection.");

  const result = validateRuntimeEnvironment();
  assert(result.ok, `Expected realistic staging values to pass runtime validation: ${JSON.stringify(result.sections)}`);

  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = "test_bad_release_key";
  const revenueCatTestKeyResult = validateRuntimeEnvironment();
  assert(!revenueCatTestKeyResult.ok, "Expected RevenueCat test_ public SDK key to fail strict runtime validation.");

  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = "goog_test_store_sdk_key";

  process.env.FLASHLY_AI_REQUEST_TIMEOUT_MS = "4999";
  const lowTimeoutResult = validateRuntimeEnvironment();
  assert(!lowTimeoutResult.ok, "Expected too-low FLASHLY_AI_REQUEST_TIMEOUT_MS to fail runtime validation.");

  process.env.FLASHLY_AI_REQUEST_TIMEOUT_MS = "300001";
  const highTimeoutResult = validateRuntimeEnvironment();
  assert(!highTimeoutResult.ok, "Expected too-high FLASHLY_AI_REQUEST_TIMEOUT_MS to fail runtime validation.");

  process.env.FLASHLY_AI_REQUEST_TIMEOUT_MS = "not-a-number";
  const invalidTimeoutResult = validateRuntimeEnvironment();
  assert(!invalidTimeoutResult.ok, "Expected invalid FLASHLY_AI_REQUEST_TIMEOUT_MS to fail runtime validation.");

  console.log("PASS runtime placeholder validation tests");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
