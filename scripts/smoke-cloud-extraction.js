const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

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

const requireEnv = (key) => {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required for smoke:cloud-extraction.`);
  }

  return value;
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async () => {
  loadDotEnv();

  requireEnv("DATABASE_URL");
  requireEnv("FLASHLY_S3_ENDPOINT");
  requireEnv("FLASHLY_S3_REGION");
  requireEnv("FLASHLY_S3_BUCKET");
  requireEnv("FLASHLY_S3_ACCESS_KEY_ID");
  requireEnv("FLASHLY_S3_SECRET_ACCESS_KEY");

  if (process.env.FLASHLY_STORAGE_MODE !== "cloud") {
    throw new Error("FLASHLY_STORAGE_MODE=cloud is required for smoke:cloud-extraction.");
  }

  if (process.env.FLASHLY_STORAGE_PROVIDER !== "s3") {
    throw new Error("FLASHLY_STORAGE_PROVIDER=s3 is required for smoke:cloud-extraction.");
  }

  if (process.env.FLASHLY_DATA_MODE !== "database") {
    throw new Error("FLASHLY_DATA_MODE=database is required for smoke:cloud-extraction.");
  }

  const { storageService } = await import("../src/api/server/storage/index.ts");
  const { extractionService } = await import("../src/api/server/extraction/index.ts");
  const { materialRepository } = await import("../src/api/server/repositories/index.ts");

  assert(storageService.mode === "cloud", "storageService must be in cloud mode.");
  assert(storageService.storeObject, "cloud storage service must support storeObject.");
  assert(storageService.readObject, "cloud storage service must support readObject.");

  const databaseUrl = process.env.DATABASE_URL.trim();
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
  });
  const unique = `smoke-cloud-extraction-${Date.now()}`;
  const storageKey = `uploads/${unique}/cloud-source.txt`;
  const sourceText =
    "Cloud extraction smoke material. Pumps convert mechanical energy into hydraulic energy and cavitation can damage impellers.";
  let userId = null;

  try {
    await storageService.storeObject({
      contentType: "text/plain",
      fileName: "cloud-source.txt",
      metadata: {
        "flashly-smoke": "cloud-extraction",
      },
      sizeBytes: sourceText.length,
      storageKey,
      textContent: sourceText,
    });

    const userResult = await pool.query(
      "INSERT INTO users (clerk_user_id, email) VALUES ($1, $2) RETURNING id",
      [unique, `${unique}@example.invalid`],
    );
    userId = userResult.rows[0].id;

    const materialResult = await pool.query(
      `
        INSERT INTO materials (
          user_id,
          file_name,
          file_type,
          mime_type,
          file_size,
          storage_key,
          extraction_status,
          extraction_stage,
          ocr_status,
          ocr_required
        )
        VALUES ($1, 'cloud-source.txt', 'text', 'text/plain', $2, $3, 'not-started', 'not-started', 'not-needed', false)
        RETURNING id
      `,
      [userId, sourceText.length, storageKey],
    );
    const materialId = materialResult.rows[0].id;

    const extraction = await extractionService.prepareExtractionJob({
      materialId,
      metadata: {
        fileName: "cloud-source.txt",
        fileSize: sourceText.length,
        materialId,
        mimeType: "text/plain",
        ocrRequired: false,
        ocrStatus: "not-needed",
        sourceType: "text",
        storageKey,
        userId: unique,
      },
      sourceRef: {
        storageKey,
      },
    });

    assert(extraction.textLength >= sourceText.length - 10, "extraction should read text from cloud storage.");
    assert(
      extraction.extractedTextPreview?.includes("hydraulic energy"),
      "extraction preview should include cloud object text.",
    );

    await materialRepository.persistExtractionResult(
      {
        extraction,
        metadata: {
          fileName: "cloud-source.txt",
          fileSize: sourceText.length,
          materialId,
          mimeType: "text/plain",
          ocrRequired: false,
          ocrStatus: "not-needed",
          sourceType: "text",
          storageKey,
          userId: unique,
        },
      },
      { userId: unique },
    );

    const persisted = await pool.query(
      `
        SELECT extraction_status, extracted_text_preview, storage_key
        FROM materials
        WHERE id = $1 AND user_id = $2
      `,
      [materialId, userId],
    );

    assert(persisted.rows[0]?.extraction_status === "complete", "material extraction should persist as complete.");
    assert(persisted.rows[0]?.storage_key === storageKey, "material should keep durable storage key.");
    assert(
      persisted.rows[0]?.extracted_text_preview?.includes("hydraulic energy"),
      "persisted material should contain extracted cloud text.",
    );

    console.log("PASS cloud extraction smoke");
  } finally {
    if (userId) {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => undefined);
    }

    if (storageService.deleteObject) {
      await storageService.deleteObject(storageKey).catch(() => undefined);
    }

    await pool.end();
  }
};

main().catch((error) => {
  console.error("FAIL cloud extraction smoke");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
