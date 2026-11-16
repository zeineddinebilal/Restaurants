import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class StorageNotConfiguredError extends Error {
  constructor(
    message = "Photo storage (S3) is not configured in production. Set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.",
  ) {
    super(message);
    this.name = "StorageNotConfiguredError";
  }
}

export interface StorageConfig {
  nodeEnv: string;
  s3Endpoint?: string;
  s3Region?: string;
  s3Bucket?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3PublicUrl?: string;
}

export function getStorageConfigFromEnv(): StorageConfig {
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    s3Endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    s3Region: process.env.S3_REGION?.trim() || undefined,
    s3Bucket: process.env.S3_BUCKET?.trim() || undefined,
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || undefined,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() || undefined,
    s3PublicUrl: process.env.S3_PUBLIC_URL?.trim() || undefined,
  };
}

export function isS3Configured(cfg: StorageConfig = getStorageConfigFromEnv()): boolean {
  return Boolean(cfg.s3Bucket && cfg.s3Region && cfg.s3AccessKeyId && cfg.s3SecretAccessKey);
}

export function canUploadPhotos(cfg: StorageConfig = getStorageConfigFromEnv()): {
  enabled: boolean;
  mode: "s3" | "local-dev" | "disabled";
  reason?: string;
} {
  if (isS3Configured(cfg)) {
    return { enabled: true, mode: "s3" };
  }
  if (cfg.nodeEnv === "development" || cfg.nodeEnv === "test") {
    return { enabled: true, mode: "local-dev" };
  }
  return {
    enabled: false,
    mode: "disabled",
    reason:
      "Photo storage is disabled in production until S3 environment variables are configured.",
  };
}

const ALLOWED_IMAGE_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function uploadDishPhoto(params: {
  buffer: Buffer;
  contentType: string;
  restaurantId: string;
  config?: StorageConfig;
}): Promise<{ url: string; mode: "s3" | "local-dev" }> {
  const cfg = params.config ?? getStorageConfigFromEnv();
  const ext = ALLOWED_IMAGE_MIME[params.contentType];
  if (!ext) {
    throw new Error("Unsupported image type. Allowed: JPEG, PNG, WebP.");
  }
  if (params.buffer.byteLength > 5 * 1024 * 1024) {
    throw new Error("Image exceeds maximum size of 5 MB.");
  }

  const status = canUploadPhotos(cfg);
  if (!status.enabled) {
    throw new StorageNotConfiguredError(status.reason);
  }

  const safeRestaurant = params.restaurantId.replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const objectKey = `dishes/${safeRestaurant}/${fileName}`;

  if (status.mode === "s3") {
    const client = new S3Client({
      region: cfg.s3Region!,
      endpoint: cfg.s3Endpoint,
      forcePathStyle: Boolean(cfg.s3Endpoint),
      credentials: {
        accessKeyId: cfg.s3AccessKeyId!,
        secretAccessKey: cfg.s3SecretAccessKey!,
      },
    });

    await client.send(
      new PutObjectCommand({
        Bucket: cfg.s3Bucket!,
        Key: objectKey,
        Body: params.buffer,
        ContentType: params.contentType,
      }),
    );

    const baseUrl = cfg.s3PublicUrl
      ? cfg.s3PublicUrl.replace(/\/$/, "")
      : cfg.s3Endpoint
        ? `${cfg.s3Endpoint.replace(/\/$/, "")}/${cfg.s3Bucket}`
        : `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com`;

    return { url: `${baseUrl}/${objectKey}`, mode: "s3" };
  }

  // Strictly dev/test local fallback (never reached in production)
  const localDir = path.join(process.cwd(), "public", "uploads", "dishes", safeRestaurant);
  await fs.mkdir(localDir, { recursive: true });
  await fs.writeFile(path.join(localDir, fileName), params.buffer);

  return {
    url: `/uploads/dishes/${safeRestaurant}/${fileName}`,
    mode: "local-dev",
  };
}
