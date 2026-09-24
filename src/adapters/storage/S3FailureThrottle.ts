import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { FailureThrottle } from "../../domain/ports/FailureThrottle.js";
import { isNotFound } from "./S3SeenOffersStore.js";

interface FailureRecord {
  signature: string;
  reportedAt: string;
}

/**
 * Keeps the last reported failure as a small JSON object in S3 (a Lambda's local
 * filesystem is ephemeral). The same failure is not reported again until
 * `repeatAfterMs` has passed; a different failure is always reported.
 */
export class S3FailureThrottle implements FailureThrottle {
  private readonly s3: S3Client;

  constructor(
    private readonly bucket: string,
    private readonly key: string,
    private readonly repeatAfterMs: number = 6 * 60 * 60 * 1000,
    s3?: S3Client,
  ) {
    this.s3 = s3 ?? new S3Client({});
  }

  async alreadyReported(signature: string): Promise<boolean> {
    const record = await this.load();
    if (!record || record.signature !== signature) return false;
    return Date.now() - Date.parse(record.reportedAt) < this.repeatAfterMs;
  }

  async markReported(signature: string): Promise<void> {
    const record: FailureRecord = { signature, reportedAt: new Date().toISOString() };
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
        Body: JSON.stringify(record),
        ContentType: "application/json",
      }),
    );
  }

  async reset(): Promise<void> {
    // Deleting a missing object succeeds, so no need to check it exists first.
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key }));
  }

  private async load(): Promise<FailureRecord | undefined> {
    try {
      const res = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
      );
      const body = await res.Body?.transformToString();
      return body ? (JSON.parse(body) as FailureRecord) : undefined;
    } catch (err) {
      if (isNotFound(err)) return undefined;
      throw err;
    }
  }
}
