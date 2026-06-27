const {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { createPostgresPoolConfig } = require("../src/api/server/database/postgresConnectionConfig");

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

const isRevenueCatTestPublicKey = (value) => value?.trim().toLowerCase().startsWith("test_") ?? false;

const getForcePathStyle = () =>
  envValue("FLASHLY_S3_FORCE_PATH_STYLE")?.toLowerCase() === "false" ? false : true;

const requiredPresence = [
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

const requiredValues = {
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

const printSection = (name, ok, details = []) => {
  const status = ok ? "PASS" : "FAIL";
  console.log(`${status} ${name}`);

  for (const detail of details) {
    console.log(`  - ${detail}`);
  }
};

const validateEnvironment = () => {
  const missing = requiredPresence.filter((key) => !envValue(key));
  if (!envValue("DATABASE_CA_CERT") && !envValue("DATABASE_CA_CERT_BASE64")) {
    missing.push("DATABASE_CA_CERT or DATABASE_CA_CERT_BASE64");
  }
  const unsafeRevenueCatKeys = [
    "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
    "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY",
  ].filter((key) => isRevenueCatTestPublicKey(envValue(key)));
  const misconfigured = Object.entries(requiredValues)
    .filter(([key, expected]) => envValue(key) !== expected)
    .map(([key, expected]) => `${key} must be ${expected}`);
  misconfigured.push(
    ...unsafeRevenueCatKeys.map((key) => `${key} must be the public platform SDK key, not a RevenueCat test_ key`),
  );

  return {
    missing,
    misconfigured,
    ok: missing.length === 0 && misconfigured.length === 0,
  };
};

const checkPostgres = async () => {
  const databaseUrl = envValue("DATABASE_URL");

  if (!databaseUrl) {
    return { ok: false, details: ["DATABASE_URL is missing."] };
  }

  let pool;

  try {
    pool = new Pool(createPostgresPoolConfig({ databaseUrl }));
  } catch (error) {
    return {
      ok: false,
      details: [error instanceof Error ? error.message : String(error)],
    };
  }

  try {
    const result = await pool.query("SELECT 1 AS ok");
    const ok = result.rows[0]?.ok === 1;

    return {
      ok,
      details: [ok ? "PostgreSQL accepted SELECT 1." : "PostgreSQL returned an unexpected result."],
    };
  } catch (error) {
    return {
      ok: false,
      details: [error instanceof Error ? error.message : String(error)],
    };
  } finally {
    await pool?.end().catch(() => undefined);
  }
};

const checkS3 = async () => {
  const required = [
    "FLASHLY_S3_ENDPOINT",
    "FLASHLY_S3_REGION",
    "FLASHLY_S3_BUCKET",
    "FLASHLY_S3_ACCESS_KEY_ID",
    "FLASHLY_S3_SECRET_ACCESS_KEY",
  ];
  const missing = required.filter((key) => !envValue(key));

  if (missing.length > 0) {
    return { ok: false, details: [`Missing ${missing.join(", ")}.`] };
  }

  const bucket = envValue("FLASHLY_S3_BUCKET");
  const key = `verify-production/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const body = `Flashly production verification ${new Date().toISOString()}\n`;
  const client = new S3Client({
    credentials: {
      accessKeyId: envValue("FLASHLY_S3_ACCESS_KEY_ID"),
      secretAccessKey: envValue("FLASHLY_S3_SECRET_ACCESS_KEY"),
    },
    endpoint: envValue("FLASHLY_S3_ENDPOINT"),
    forcePathStyle: getForcePathStyle(),
    region: envValue("FLASHLY_S3_REGION"),
  });

  try {
    await client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: bucket,
        ContentType: "text/plain",
        Key: key,
        Metadata: {
          "flashly-production-verify": "true",
        },
      }),
    );

    const head = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const ok = Number(head.ContentLength) >= body.length;

    return {
      ok,
      details: [
        ok
          ? "S3-compatible bucket accepted put/head/delete test object."
          : "S3 head response did not include expected content length.",
      ],
    };
  } catch (error) {
    return {
      ok: false,
      details: [error instanceof Error ? error.message : String(error)],
    };
  }
};

const checkNvidia = async () => {
  const apiKey = envValue("FLASHLY_AI_API_KEY");
  const model = envValue("FLASHLY_AI_MODEL") || "openai/gpt-oss-20b";
  const baseUrl = (envValue("FLASHLY_AI_BASE_URL") || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");

  if (!apiKey) {
    return { ok: false, details: ["FLASHLY_AI_API_KEY is missing."] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Return strict JSON only.",
          },
          {
            role: "user",
            content: 'Return {"ok":true}.',
          },
        ],
        max_tokens: 16,
        temperature: 0,
        top_p: 1,
        stream: false,
      }),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        details: [`NVIDIA chat completions returned HTTP ${response.status}.`],
      };
    }

    const payload = await response.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;

    return {
      ok: typeof content === "string" && content.length > 0,
      details: [
        typeof content === "string" && content.length > 0
          ? "NVIDIA chat completions responded."
          : "NVIDIA response did not include message content.",
      ],
    };
  } catch (error) {
    return {
      ok: false,
      details: [error instanceof Error ? error.message : String(error)],
    };
  } finally {
    clearTimeout(timeout);
  }
};

const checkPresenceOnly = (name, keys) => {
  const missing = keys.filter((key) => !envValue(key));

  return {
    ok: missing.length === 0,
    details: missing.length === 0 ? [`${name} configuration is present.`] : [`Missing ${missing.join(", ")}.`],
  };
};

const main = async () => {
  loadDotEnv();

  const envCheck = validateEnvironment();
  printSection("environment modes and required variables", envCheck.ok, [
    envCheck.missing.length > 0 ? `Missing variables: ${envCheck.missing.join(", ")}` : "No required variables are missing.",
    envCheck.misconfigured.length > 0
      ? `Misconfigured values: ${envCheck.misconfigured.join("; ")}`
      : "All required mode values are production-ready.",
  ]);

  const postgres = await checkPostgres();
  printSection("PostgreSQL reachability", postgres.ok, postgres.details);

  const storage = await checkS3();
  printSection("S3/R2 storage reachability", storage.ok, storage.details);

  const nvidia = await checkNvidia();
  printSection("NVIDIA AI reachability", nvidia.ok, nvidia.details);

  const ocr = checkPresenceOnly("OCR.space", ["FLASHLY_OCR_API_KEY"]);
  printSection("OCR.space configuration", ocr.ok, ocr.details);

  const revenueCat = checkPresenceOnly("RevenueCat", [
    "REVENUECAT_WEBHOOK_SECRET",
    "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
    "EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID",
  ]);
  printSection("RevenueCat configuration", revenueCat.ok, revenueCat.details);

  const ok = envCheck.ok && postgres.ok && storage.ok && nvidia.ok && ocr.ok && revenueCat.ok;

  console.log("");
  console.log(ok ? "PASS Flashly production readiness verified." : "FAIL Flashly production readiness checks failed.");

  if (!ok) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error("FAIL production verification crashed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
