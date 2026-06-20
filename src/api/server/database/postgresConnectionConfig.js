const { Buffer } = require("node:buffer");

const SSL_QUERY_PARAMETERS = new Set(["sslmode", "sslcert", "sslkey", "sslrootcert"]);

const isStrictRuntime = (env = process.env) => {
  const runtime = (env.FLASHLY_ENV || env.NODE_ENV || "").trim().toLowerCase();

  return runtime === "staging" || runtime === "production";
};

const isDatabaseMode = (env = process.env) => env.FLASHLY_DATA_MODE?.trim().toLowerCase() === "database";

const isLocalDatabaseUrl = (databaseUrl) => /(^|@|\b)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(databaseUrl);

const normalizePem = (value) => value.trim().replace(/\\n/g, "\n");

const hasPemEnvelope = (value) =>
  value.includes("-----BEGIN CERTIFICATE-----") && value.includes("-----END CERTIFICATE-----");

const resolveDatabaseCaCertificate = (env = process.env) => {
  const rawCa = env.DATABASE_CA_CERT?.trim();

  if (rawCa) {
    const pem = normalizePem(rawCa);

    if (!hasPemEnvelope(pem)) {
      throw new Error("DATABASE_CA_CERT must contain a PEM certificate.");
    }

    return pem;
  }

  const rawBase64 = env.DATABASE_CA_CERT_BASE64?.trim();

  if (rawBase64) {
    const pem = Buffer.from(rawBase64, "base64").toString("utf8").trim();

    if (!hasPemEnvelope(pem)) {
      throw new Error("DATABASE_CA_CERT_BASE64 must decode to a PEM certificate.");
    }

    return pem;
  }

  return undefined;
};

const sanitizeDatabaseUrl = (databaseUrl) => {
  const parsed = new URL(databaseUrl);

  for (const key of SSL_QUERY_PARAMETERS) {
    parsed.searchParams.delete(key);
  }

  return parsed.toString();
};

const shouldRequireDatabaseCa = (databaseUrl, env = process.env) =>
  isStrictRuntime(env) && isDatabaseMode(env) && !isLocalDatabaseUrl(databaseUrl);

const createPostgresPoolConfig = ({ databaseUrl = process.env.DATABASE_URL, env = process.env } = {}) => {
  const trimmedUrl = databaseUrl?.trim();

  if (!trimmedUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const connectionString = sanitizeDatabaseUrl(trimmedUrl);
  const ca = resolveDatabaseCaCertificate(env);

  if (!ca) {
    if (shouldRequireDatabaseCa(trimmedUrl, env)) {
      throw new Error("DATABASE_CA_CERT or DATABASE_CA_CERT_BASE64 is required for staging/production database TLS.");
    }

    return {
      connectionString,
    };
  }

  return {
    connectionString,
    ssl: {
      ca,
      rejectUnauthorized: true,
    },
  };
};

module.exports = {
  createPostgresPoolConfig,
  resolveDatabaseCaCertificate,
  sanitizeDatabaseUrl,
  shouldRequireDatabaseCa,
};
