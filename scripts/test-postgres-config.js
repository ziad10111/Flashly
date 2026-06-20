const { spawnSync } = require("node:child_process");
const path = require("node:path");

const {
  createPostgresPoolConfig,
  resolveDatabaseCaCertificate,
  sanitizeDatabaseUrl,
} = require("../src/api/server/database/postgresConnectionConfig");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const pem = [
  "-----BEGIN CERTIFICATE-----",
  "MIIBtestcertificatebody",
  "-----END CERTIFICATE-----",
].join("\n");
const escapedPem = pem.replace(/\n/g, "\\n");
const base64Pem = Buffer.from(pem, "utf8").toString("base64");
const remoteUrl =
  "postgresql://db.example.com/defaultdb?sslmode=require&sslcert=cert&sslkey=key&sslrootcert=root&connect_timeout=10";

const strictEnv = {
  FLASHLY_DATA_MODE: "database",
  FLASHLY_ENV: "staging",
};

assert(resolveDatabaseCaCertificate({ DATABASE_CA_CERT: pem }) === pem, "Expected multiline PEM to resolve.");
assert(resolveDatabaseCaCertificate({ DATABASE_CA_CERT: escapedPem }) === pem, "Expected escaped PEM newlines to normalize.");
assert(resolveDatabaseCaCertificate({ DATABASE_CA_CERT_BASE64: base64Pem }) === pem, "Expected base64 PEM to decode.");

assert(
  (() => {
    try {
      resolveDatabaseCaCertificate({ DATABASE_CA_CERT_BASE64: "not-a-valid-certificate" });
      return false;
    } catch {
      return true;
    }
  })(),
  "Expected malformed base64/non-PEM value to fail.",
);

assert(
  (() => {
    try {
      createPostgresPoolConfig({ databaseUrl: remoteUrl, env: strictEnv });
      return false;
    } catch {
      return true;
    }
  })(),
  "Expected missing CA to fail closed in staging database mode.",
);

const localConfig = createPostgresPoolConfig({
  databaseUrl: "postgresql://localhost:5432/flashly",
  env: { FLASHLY_DATA_MODE: "database", FLASHLY_ENV: "local" },
});
assert(!localConfig.ssl, "Expected local database mode without CA to omit SSL config.");

const sanitizedUrl = sanitizeDatabaseUrl(remoteUrl);
assert(!sanitizedUrl.includes("sslmode="), "Expected sslmode to be removed.");
assert(!sanitizedUrl.includes("sslcert="), "Expected sslcert to be removed.");
assert(!sanitizedUrl.includes("sslkey="), "Expected sslkey to be removed.");
assert(!sanitizedUrl.includes("sslrootcert="), "Expected sslrootcert to be removed.");
assert(sanitizedUrl.includes("connect_timeout=10"), "Expected unrelated query parameters to be preserved.");

const strictConfig = createPostgresPoolConfig({
  databaseUrl: remoteUrl,
  env: {
    ...strictEnv,
    DATABASE_CA_CERT: escapedPem,
  },
});
assert(strictConfig.connectionString === sanitizedUrl, "Expected pool config to use sanitized connection string.");
assert(strictConfig.ssl?.rejectUnauthorized === true, "Expected rejectUnauthorized to remain true.");
assert(strictConfig.ssl?.ca === pem, "Expected pool config to include resolved CA.");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const childEnv = Object.fromEntries(
  Object.entries({
    ...process.env,
    NODE_ENV: "production",
    DATABASE_CA_CERT: "",
    DATABASE_CA_CERT_BASE64: "",
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder",
    EXPO_PUBLIC_FLASHLY_AUTH_MODE: "clerk",
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "goog_test_store_sdk_key",
    EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID: "pro",
    EXPO_PUBLIC_USE_BACKEND: "true",
    CLERK_SECRET_KEY: "clerk-test-secret",
    DATABASE_URL: "postgresql://db.example.com/defaultdb",
    FLASHLY_AI_API_KEY: "nvidia-test-key",
    FLASHLY_AI_BASE_URL: "https://integrate.api.nvidia.com/v1",
    FLASHLY_AI_MODEL: "openai/gpt-oss-20b",
    FLASHLY_AI_PROVIDER: "nvidia",
    FLASHLY_BILLING_MODE: "revenuecat",
    FLASHLY_DATA_MODE: "database",
    FLASHLY_ENV: "staging",
    FLASHLY_EXTRACTION_MODE: "external",
    FLASHLY_GENERATION_MODE: "external",
    FLASHLY_OCR_API_KEY: "ocr-test-key",
    FLASHLY_OCR_API_URL: "https://api.ocr.space/parse/image",
    FLASHLY_OCR_PROVIDER: "ocrspace",
    FLASHLY_OCR_TIMEOUT_MS: "20000",
    FLASHLY_S3_ACCESS_KEY_ID: "access-key",
    FLASHLY_S3_BUCKET: "bucket",
    FLASHLY_S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
    FLASHLY_S3_REGION: "auto",
    FLASHLY_S3_SECRET_ACCESS_KEY: "secret-key",
    FLASHLY_STORAGE_MODE: "cloud",
    FLASHLY_STORAGE_PROVIDER: "s3",
    REVENUECAT_WEBHOOK_SECRET: "revenuecat-test-secret",
  })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, String(value)]),
);

const missingCaRuntime = spawnSync(npmCommand, ["run", "verify:staging-runtime", "--silent"], {
  cwd: path.resolve(__dirname, ".."),
  encoding: "utf8",
  env: childEnv,
  shell: process.platform === "win32",
});
assert(missingCaRuntime.status !== 0, "Expected runtime validation to fail when staging database CA is missing.");
assert(
  `${missingCaRuntime.stdout}\n${missingCaRuntime.stderr}`.includes("DATABASE_CA_CERT"),
  "Expected missing CA runtime validation to mention DATABASE_CA_CERT.",
);

console.log("PASS PostgreSQL TLS configuration tests");
