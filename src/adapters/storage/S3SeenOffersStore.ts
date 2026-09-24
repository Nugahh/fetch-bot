import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { SeenOffersStore } from "../../domain/ports/SeenOffersStore.js";

interface StateFile {
  ids: string[];
  updatedAt: string;
}

/**
 * Stores already-notified offer IDs as a single JSON object in S3.
 *
 * This is the AWS counterpart of {@link FileSeenOffersStore}: same port, same
 * behaviour, but backed by S3 because a Lambda's local filesystem is ephemeral.
 * A missing object (first ever run) is treated as "nothing seen yet".
 */
export class S3SeenOffersStore implements SeenOffersStore {
  private readonly s3: S3Client;

  constructor(
    private readonly bucket: string,
    private readonly key: string,
    s3?: S3Client,
  ) {
    // Region/credentials come from the Lambda execution environment.
    this.s3 = s3 ?? new S3Client({});
  }

  async load(): Promise<Set<string>> {
    try {
      const res = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
      );
      const body = await res.Body?.transformToString();
      if (!body) return new Set();
      const parsed = JSON.parse(body) as StateFile;
      return new Set(Array.isArray(parsed.ids) ? parsed.ids : []);
    } catch (err) {
      if (isNotFound(err)) return new Set();
      throw err;
    }
  }

  async save(ids: Set<string>): Promise<void> {
    const payload: StateFile = {
      ids: [...ids].sort(),
      updatedAt: new Date().toISOString(),
    };
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
        Body: JSON.stringify(payload, null, 2),
        ContentType: "application/json",
      }),
    );
  }
}

/** True when the object simply doesn't exist yet (first run). */
export function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string; Code?: string })?.name;
  const code = (err as { Code?: string })?.Code;
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  return name === "NoSuchKey" || code === "NoSuchKey" || status === 404;
}
