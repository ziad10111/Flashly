import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import {
  FLASHLY_S3_ACCESS_KEY_ID,
  FLASHLY_S3_BUCKET,
  FLASHLY_S3_ENDPOINT,
  FLASHLY_S3_FORCE_PATH_STYLE,
  FLASHLY_S3_PUBLIC_BASE_URL,
  FLASHLY_S3_REGION,
  FLASHLY_S3_SECRET_ACCESS_KEY,
  FLASHLY_STORAGE_PROVIDER,
} from "../config";
import type {
  FlashlyStorageService,
  PrepareStorageUploadInput,
  ReadStorageObjectResult,
  StorageObjectMetadata,
  StoreStorageObjectInput,
  StoredStorageObject,
} from "./types";
import { StorageServiceNotConfiguredError } from "./types";

const requiredConfig = {
  FLASHLY_S3_ACCESS_KEY_ID,
  FLASHLY_S3_BUCKET,
  FLASHLY_S3_ENDPOINT,
  FLASHLY_S3_REGION,
  FLASHLY_S3_SECRET_ACCESS_KEY,
};

const missingConfigKeys = () =>
  Object.entries(requiredConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

const assertS3Configured = (operation: string) => {
  if (FLASHLY_STORAGE_PROVIDER !== "s3") {
    throw new StorageServiceNotConfiguredError(`${operation}: set FLASHLY_STORAGE_PROVIDER=s3`);
  }

  const missing = missingConfigKeys();

  if (missing.length > 0) {
    throw new StorageServiceNotConfiguredError(`${operation}: missing ${missing.join(", ")}`);
  }
};

const getS3Client = () => {
  assertS3Configured("storage.s3.client");

  const config: S3ClientConfig = {
    credentials: {
      accessKeyId: FLASHLY_S3_ACCESS_KEY_ID!,
      secretAccessKey: FLASHLY_S3_SECRET_ACCESS_KEY!,
    },
    endpoint: FLASHLY_S3_ENDPOINT,
    forcePathStyle: FLASHLY_S3_FORCE_PATH_STYLE,
    region: FLASHLY_S3_REGION,
  };

  return new S3Client(config);
};

const hashString = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
};

const sanitizeKeyPart = (value: string) =>
  value
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

const extensionFromFileName = (fileName: string) => {
  const cleanName = sanitizeKeyPart(fileName);
  const dotIndex = cleanName.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === cleanName.length - 1) {
    return "";
  }

  return cleanName.slice(dotIndex).toLowerCase();
};

const createPublicUrl = (storageKey: string) => {
  if (!FLASHLY_S3_PUBLIC_BASE_URL) {
    return undefined;
  }

  return `${FLASHLY_S3_PUBLIC_BASE_URL.replace(/\/+$/g, "")}/${storageKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
};

export const createS3StorageKey = (input: PrepareStorageUploadInput) => {
  const safeIdempotencyKey = sanitizeKeyPart(input.idempotencyKey) || hashString(input.fileName);
  const safeFileStem = sanitizeKeyPart(input.fileName.replace(/\.[^.]+$/g, "")) || "upload";
  const fileHash = hashString(`${input.fileName}:${input.fileSize ?? 0}:${input.mimeType ?? ""}`);
  const extension = input.extension || extensionFromFileName(input.fileName);

  return `uploads/${safeIdempotencyKey}/${safeFileStem}-${fileHash}${extension}`;
};

const base64ToBytes = (contentBase64: string) => {
  const normalized = contentBase64.trim().replace(/^data:[^,]*;base64,/i, "").replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const textToBytes = (value: string) => new TextEncoder().encode(value);

const streamToBytes = async (body: unknown) => {
  if (!body) {
    return new Uint8Array();
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (typeof body === "object" && "transformToByteArray" in body) {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();

    return new Uint8Array(bytes);
  }

  const chunks: Uint8Array[] = [];

  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    chunks.push(typeof chunk === "string" ? textToBytes(chunk) : new Uint8Array(chunk));
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  const chunkSize = 8192;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
};

const normalizeMetadata = (metadata: StoreStorageObjectInput["metadata"]) =>
  Object.fromEntries(
    Object.entries(metadata ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9-]+/g, "-"), value]),
  );

export const s3StorageService: FlashlyStorageService = {
  createStorageKey: createS3StorageKey,
  deleteObject: async (storageKey) => {
    assertS3Configured("storage.s3.deleteObject");
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: FLASHLY_S3_BUCKET!,
        Key: storageKey,
      }),
    );
  },
  headObject: async (storageKey): Promise<StorageObjectMetadata> => {
    assertS3Configured("storage.s3.headObject");

    try {
      const result = await getS3Client().send(
        new HeadObjectCommand({
          Bucket: FLASHLY_S3_BUCKET!,
          Key: storageKey,
        }),
      );

      return {
        contentLength: result.ContentLength,
        contentType: result.ContentType,
        exists: true,
        storageKey,
      };
    } catch (error) {
      if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) {
        return {
          exists: false,
          storageKey,
        };
      }

      throw error;
    }
  },
  mode: "cloud",
  prepareUpload: (input) => {
    assertS3Configured("storage.s3.prepareUpload");
    const storageKey = createS3StorageKey(input);

    return {
      downloadRef: { storageKey },
      publicUrl: createPublicUrl(storageKey),
      storageKey,
    };
  },
  readObject: async (storageKey): Promise<ReadStorageObjectResult> => {
    assertS3Configured("storage.s3.readObject");

    const result = await getS3Client().send(
      new GetObjectCommand({
        Bucket: FLASHLY_S3_BUCKET!,
        Key: storageKey,
      }),
    );
    const bytes = await streamToBytes(result.Body);
    const contentType = result.ContentType;

    return {
      contentBase64: bytesToBase64(bytes),
      contentType,
      sizeBytes: bytes.byteLength,
      storageKey,
      textContent: contentType?.startsWith("text/") ? new TextDecoder().decode(bytes) : undefined,
    };
  },
  storeObject: async (input): Promise<StoredStorageObject> => {
    assertS3Configured("storage.s3.storeObject");

    const body = input.contentBase64 !== undefined ? base64ToBytes(input.contentBase64) : textToBytes(input.textContent ?? "");

    await getS3Client().send(
      new PutObjectCommand({
        Body: body,
        Bucket: FLASHLY_S3_BUCKET!,
        ContentType: input.contentType,
        Key: input.storageKey,
        Metadata: normalizeMetadata({
          ...input.metadata,
          "original-name": input.fileName,
          "size-bytes": input.sizeBytes === undefined ? undefined : String(input.sizeBytes),
        }),
      }),
    );

    return {
      contentType: input.contentType,
      publicUrl: createPublicUrl(input.storageKey),
      sizeBytes: input.sizeBytes ?? body.byteLength,
      storageKey: input.storageKey,
    };
  },
  validateReadiness: () => {
    if (FLASHLY_STORAGE_PROVIDER !== "s3") {
      return {
        message: "Cloud storage mode requires FLASHLY_STORAGE_PROVIDER=s3.",
        ok: false,
      };
    }

    const missing = missingConfigKeys();

    if (missing.length > 0) {
      return {
        message: `Cloud storage is missing server-only env variables: ${missing.join(", ")}.`,
        ok: false,
      };
    }

    return { ok: true };
  },
};
