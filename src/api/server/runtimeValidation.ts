import {
  CLERK_SECRET_KEY,
  DATABASE_URL,
  FLASHLY_AI_API_KEY,
  FLASHLY_AI_BASE_URL,
  FLASHLY_AI_MODEL,
  FLASHLY_AI_PROVIDER,
  FLASHLY_AUTH_MODE,
  FLASHLY_BILLING_MODE,
  FLASHLY_DATA_MODE,
  FLASHLY_EXTRACTION_MODE,
  FLASHLY_GENERATION_MODE,
  FLASHLY_OCR_API_KEY,
  FLASHLY_OCR_API_URL,
  FLASHLY_OCR_PROVIDER,
  FLASHLY_OCR_TIMEOUT_MS,
  FLASHLY_S3_ACCESS_KEY_ID,
  FLASHLY_S3_BUCKET,
  FLASHLY_S3_ENDPOINT,
  FLASHLY_S3_REGION,
  FLASHLY_S3_SECRET_ACCESS_KEY,
  FLASHLY_STORAGE_MODE,
  FLASHLY_STORAGE_PROVIDER,
  REVENUECAT_WEBHOOK_SECRET,
} from "./config";

export type FlashlyRuntimeEnvironment = "local" | "test" | "staging" | "production";

export type RuntimeValidationIssue = {
  key?: string;
  message: string;
  severity: "error" | "warning";
};

export type RuntimeValidationSection = {
  issues: RuntimeValidationIssue[];
  status: "ok" | "warning" | "error";
};

export type RuntimeValidationResult = {
  environment: FlashlyRuntimeEnvironment;
  ok: boolean;
  sections: Record<string, RuntimeValidationSection>;
};

const PLACEHOLDER_PATTERN = /^(|changeme|change_me|todo|replace_me|example|placeholder|your_|server_side_|pk_test_or_live_key)/i;

const getRuntimeEnvironment = (): FlashlyRuntimeEnvironment => {
  const raw = process.env.FLASHLY_ENV?.trim().toLowerCase() || process.env.NODE_ENV?.trim().toLowerCase();

  if (raw === "production") {
    return "production";
  }

  if (raw === "staging") {
    return "staging";
  }

  if (raw === "test") {
    return "test";
  }

  return "local";
};

const isStrictEnvironment = (environment: FlashlyRuntimeEnvironment) =>
  environment === "staging" || environment === "production";

const hasValue = (value: string | undefined) => Boolean(value?.trim());

const addIssue = (
  sections: Record<string, RuntimeValidationSection>,
  sectionName: string,
  issue: RuntimeValidationIssue,
) => {
  const section = sections[sectionName] ?? { issues: [], status: "ok" as const };
  section.issues.push(issue);
  section.status = section.issues.some((item) => item.severity === "error") ? "error" : "warning";
  sections[sectionName] = section;
};

const requireValue = (
  sections: Record<string, RuntimeValidationSection>,
  sectionName: string,
  key: string,
  value: string | undefined,
  message?: string,
) => {
  if (!hasValue(value)) {
    addIssue(sections, sectionName, {
      key,
      message: message ?? `${key} is required.`,
      severity: "error",
    });
    return;
  }

  if (PLACEHOLDER_PATTERN.test(value ?? "")) {
    addIssue(sections, sectionName, {
      key,
      message: `${key} appears to contain a placeholder value.`,
      severity: "error",
    });
  }
};

const validateUrl = (
  sections: Record<string, RuntimeValidationSection>,
  sectionName: string,
  key: string,
  value: string | undefined,
  options?: { required?: boolean },
) => {
  if (!value) {
    if (options?.required) {
      requireValue(sections, sectionName, key, value);
    }

    return;
  }

  try {
    new URL(value);
  } catch {
    addIssue(sections, sectionName, {
      key,
      message: `${key} must be a valid URL.`,
      severity: "error",
    });
  }
};

const validatePositiveInteger = (
  sections: Record<string, RuntimeValidationSection>,
  sectionName: string,
  key: string,
  value: string | undefined,
) => {
  if (!value) {
    return;
  }

  const numeric = Number(value);

  if (!Number.isInteger(numeric) || numeric <= 0) {
    addIssue(sections, sectionName, {
      key,
      message: `${key} must be a positive integer.`,
      severity: "error",
    });
  }
};

const ensureSection = (sections: Record<string, RuntimeValidationSection>, sectionName: string) => {
  sections[sectionName] ??= { issues: [], status: "ok" };
};

export const validateRuntimeEnvironment = (): RuntimeValidationResult => {
  const environment = getRuntimeEnvironment();
  const strict = isStrictEnvironment(environment);
  const sections: Record<string, RuntimeValidationSection> = {};

  for (const section of ["runtime", "database", "storage", "auth", "ocr", "ai", "billing", "security"]) {
    ensureSection(sections, section);
  }

  validatePositiveInteger(sections, "runtime", "PORT", process.env.PORT);
  validatePositiveInteger(sections, "runtime", "FLASHLY_SERVER_MAX_BODY_BYTES", process.env.FLASHLY_SERVER_MAX_BODY_BYTES);

  if (strict) {
    if (process.env.EXPO_PUBLIC_USE_BACKEND !== "true") {
      addIssue(sections, "runtime", {
        key: "EXPO_PUBLIC_USE_BACKEND",
        message: "EXPO_PUBLIC_USE_BACKEND must be true in staging and production.",
        severity: "error",
      });
    }
  }

  if (FLASHLY_DATA_MODE === "database") {
    requireValue(sections, "database", "DATABASE_URL", DATABASE_URL);
  } else if (strict) {
    addIssue(sections, "database", {
      key: "FLASHLY_DATA_MODE",
      message: "Staging and production must use FLASHLY_DATA_MODE=database.",
      severity: "error",
    });
  }

  if (FLASHLY_STORAGE_MODE === "cloud") {
    requireValue(sections, "storage", "FLASHLY_STORAGE_PROVIDER", FLASHLY_STORAGE_PROVIDER);
    requireValue(sections, "storage", "FLASHLY_S3_ENDPOINT", FLASHLY_S3_ENDPOINT);
    requireValue(sections, "storage", "FLASHLY_S3_REGION", FLASHLY_S3_REGION);
    requireValue(sections, "storage", "FLASHLY_S3_BUCKET", FLASHLY_S3_BUCKET);
    requireValue(sections, "storage", "FLASHLY_S3_ACCESS_KEY_ID", FLASHLY_S3_ACCESS_KEY_ID);
    requireValue(sections, "storage", "FLASHLY_S3_SECRET_ACCESS_KEY", FLASHLY_S3_SECRET_ACCESS_KEY);
    validateUrl(sections, "storage", "FLASHLY_S3_ENDPOINT", FLASHLY_S3_ENDPOINT, { required: true });
  } else if (strict) {
    addIssue(sections, "storage", {
      key: "FLASHLY_STORAGE_MODE",
      message: "Staging and production must use FLASHLY_STORAGE_MODE=cloud.",
      severity: "error",
    });
  }

  if (FLASHLY_AUTH_MODE === "clerk") {
    requireValue(sections, "auth", "CLERK_SECRET_KEY", CLERK_SECRET_KEY);
    requireValue(
      sections,
      "auth",
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
    );
  } else if (strict) {
    addIssue(sections, "auth", {
      key: "EXPO_PUBLIC_FLASHLY_AUTH_MODE",
      message: "Staging and production must use EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk.",
      severity: "error",
    });
  }

  if (FLASHLY_EXTRACTION_MODE === "external") {
    if (FLASHLY_OCR_PROVIDER === "ocrspace") {
      requireValue(sections, "ocr", "FLASHLY_OCR_API_KEY", FLASHLY_OCR_API_KEY);
      validateUrl(sections, "ocr", "FLASHLY_OCR_API_URL", FLASHLY_OCR_API_URL, { required: true });
      validatePositiveInteger(sections, "ocr", "FLASHLY_OCR_TIMEOUT_MS", String(FLASHLY_OCR_TIMEOUT_MS));
    } else {
      addIssue(sections, "ocr", {
        key: "FLASHLY_OCR_PROVIDER",
        message: "External extraction requires FLASHLY_OCR_PROVIDER=ocrspace.",
        severity: "error",
      });
    }
  } else if (strict) {
    addIssue(sections, "ocr", {
      key: "FLASHLY_EXTRACTION_MODE",
      message: "Staging and production must use FLASHLY_EXTRACTION_MODE=external.",
      severity: "error",
    });
  }

  if (FLASHLY_GENERATION_MODE === "external") {
    if (FLASHLY_AI_PROVIDER !== "nvidia") {
      addIssue(sections, "ai", {
        key: "FLASHLY_AI_PROVIDER",
        message: "Staging and production should validate NVIDIA with FLASHLY_AI_PROVIDER=nvidia.",
        severity: strict ? "error" : "warning",
      });
    }

    requireValue(sections, "ai", "FLASHLY_AI_API_KEY", FLASHLY_AI_API_KEY);
    requireValue(sections, "ai", "FLASHLY_AI_MODEL", FLASHLY_AI_MODEL);
    validateUrl(sections, "ai", "FLASHLY_AI_BASE_URL", FLASHLY_AI_BASE_URL, { required: false });
  } else if (strict) {
    addIssue(sections, "ai", {
      key: "FLASHLY_GENERATION_MODE",
      message: "Staging and production must use FLASHLY_GENERATION_MODE=external.",
      severity: "error",
    });
  }

  if (FLASHLY_BILLING_MODE === "revenuecat") {
    requireValue(sections, "billing", "REVENUECAT_WEBHOOK_SECRET", REVENUECAT_WEBHOOK_SECRET);
    requireValue(
      sections,
      "billing",
      "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
      process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim(),
    );
    requireValue(
      sections,
      "billing",
      "EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID",
      process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim(),
    );
  } else if (strict) {
    addIssue(sections, "billing", {
      key: "FLASHLY_BILLING_MODE",
      message: "Staging and production must use FLASHLY_BILLING_MODE=revenuecat.",
      severity: "error",
    });
  }

  validatePositiveInteger(sections, "security", "FLASHLY_RATE_LIMIT_WINDOW_MS", process.env.FLASHLY_RATE_LIMIT_WINDOW_MS);
  validatePositiveInteger(sections, "security", "FLASHLY_RATE_LIMIT_MAX", process.env.FLASHLY_RATE_LIMIT_MAX);
  validatePositiveInteger(sections, "security", "FLASHLY_AUTH_RATE_LIMIT_MAX", process.env.FLASHLY_AUTH_RATE_LIMIT_MAX);
  validatePositiveInteger(sections, "security", "FLASHLY_UPLOAD_RATE_LIMIT_MAX", process.env.FLASHLY_UPLOAD_RATE_LIMIT_MAX);
  validatePositiveInteger(sections, "security", "FLASHLY_GENERATION_RATE_LIMIT_MAX", process.env.FLASHLY_GENERATION_RATE_LIMIT_MAX);

  const ok = Object.values(sections).every((section) => section.status !== "error");

  return {
    environment,
    ok,
    sections,
  };
};

export const assertRuntimeEnvironmentReady = () => {
  const result = validateRuntimeEnvironment();

  if (!isStrictEnvironment(result.environment) || result.ok) {
    return result;
  }

  const messages = Object.entries(result.sections)
    .flatMap(([section, value]) =>
      value.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => `${section}${issue.key ? `.${issue.key}` : ""}: ${issue.message}`),
    )
    .join("; ");

  throw new Error(`Flashly ${result.environment} configuration is invalid: ${messages}`);
};
