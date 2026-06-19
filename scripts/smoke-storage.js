const {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const fs = require("node:fs");
const path = require("node:path");

const loadDotEnv = () => {
  const envPath = path.join(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/g);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^"|"$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

const requireEnv = (key) => {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
};

const streamToBuffer = async (body) => {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks = [];

  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

const assertMissingObject = async (client, bucket, key) => {
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  } catch (error) {
    if (error?.name === "NotFound" || error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
      return;
    }

    throw error;
  }

  throw new Error("Missing-object check failed: deleted test object still exists.");
};

const putHeadReadDelete = async ({ body, bucket, client, contentType, key, metadata }) => {
  const expectedBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);

  await client.send(
    new PutObjectCommand({
      Body: body,
      Bucket: bucket,
      ContentType: contentType,
      Key: key,
      Metadata: metadata,
    }),
  );

  const head = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  if (head.ContentLength !== expectedBuffer.byteLength) {
    throw new Error(`Storage head size check failed for ${key}.`);
  }

  if (head.ContentType !== contentType) {
    throw new Error(`Storage content type check failed for ${key}.`);
  }

  const read = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  const readBuffer = await streamToBuffer(read.Body);

  if (!readBuffer.equals(expectedBuffer)) {
    throw new Error(`Storage read-back comparison failed for ${key}.`);
  }

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  await assertMissingObject(client, bucket, key);

  return {
    contentLength: head.ContentLength,
    contentType: head.ContentType,
    key,
  };
};

const main = async () => {
  loadDotEnv();

  const mode = process.env.FLASHLY_STORAGE_MODE?.trim().toLowerCase();

  if (mode !== "cloud") {
    throw new Error("Set FLASHLY_STORAGE_MODE=cloud to run the cloud storage smoke test.");
  }

  const provider = process.env.FLASHLY_STORAGE_PROVIDER?.trim().toLowerCase();

  if (provider !== "s3") {
    throw new Error("Set FLASHLY_STORAGE_PROVIDER=s3 to run the cloud storage smoke test.");
  }

  const endpoint = requireEnv("FLASHLY_S3_ENDPOINT");
  const region = requireEnv("FLASHLY_S3_REGION");
  const bucket = requireEnv("FLASHLY_S3_BUCKET");
  const accessKeyId = requireEnv("FLASHLY_S3_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("FLASHLY_S3_SECRET_ACCESS_KEY");
  const prefix = `smoke/storage/${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const client = new S3Client({
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    endpoint,
    forcePathStyle: true,
    region,
  });

  const textResult = await putHeadReadDelete({
    body: `Flashly storage smoke test ${new Date().toISOString()}\n`,
    bucket,
    client,
    contentType: "text/plain",
    key: `${prefix}.txt`,
    metadata: {
      "flashly-smoke-kind": "text",
      "flashly-smoke-test": "true",
    },
  });
  const binaryResult = await putHeadReadDelete({
    body: Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]),
    bucket,
    client,
    contentType: "application/octet-stream",
    key: `${prefix}.bin`,
    metadata: {
      "flashly-smoke-kind": "binary",
      "flashly-smoke-test": "true",
    },
  });

  console.info("PASS storage smoke check");
  console.info(
    JSON.stringify(
      {
        bucket,
        endpoint,
        objects: [textResult, binaryResult],
        provider,
        region,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error("FAIL storage smoke check");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
