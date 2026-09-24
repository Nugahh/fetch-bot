import { loadConfig } from "./config.js";
import { AlInOfferSource } from "./adapters/alin/AlInOfferSource.js";
import { SmtpNotifier } from "./adapters/email/SmtpNotifier.js";
import { S3SeenOffersStore } from "./adapters/storage/S3SeenOffersStore.js";
import { S3FailureThrottle } from "./adapters/storage/S3FailureThrottle.js";
import { CheckOffersUseCase } from "./application/CheckOffersUseCase.js";
import type { Notifier } from "./domain/ports/Notifier.js";
import type { FailureThrottle } from "./domain/ports/FailureThrottle.js";

/**
 * AWS Lambda entry point, triggered by an EventBridge schedule.
 *
 * Same wiring as src/main.ts (the composition root), but the state store is
 * backed by S3 instead of a local file. On top of that, a failed run emails the
 * user (once per distinct failure) so an outage doesn't go unnoticed — a Lambda
 * has no "failed workflow" notification like GitHub Actions does.
 */
export const handler = async (): Promise<{
  statusCode: number;
  fetched: number;
  newOffers: number;
  notified: boolean;
}> => {
  const config = loadConfig();

  const bucket = process.env.STATE_BUCKET;
  if (!bucket) throw new Error("Missing required environment variable: STATE_BUCKET");
  const key = process.env.STATE_KEY ?? "seen-offers.json";

  const source = new AlInOfferSource(config.alinCredentials, config.alinSearch);
  const notifier = new SmtpNotifier(config.smtp);
  const store = new S3SeenOffersStore(bucket, key);
  const throttle = new S3FailureThrottle(bucket, "last-failure.json");

  try {
    const result = await new CheckOffersUseCase(source, notifier, store).execute();

    // A good run closes the incident: the next failure is reported afresh.
    await throttle.reset().catch((err) => console.warn("Could not reset failure state:", err));

    return {
      statusCode: 200,
      fetched: result.fetched,
      newOffers: result.newOffers.length,
      notified: result.notified,
    };
  } catch (err) {
    await reportFailure(err, notifier, throttle);
    throw err; // still fail the invocation: keeps the CloudWatch logs and alarm accurate
  }
};

/** Emails the failure unless it was already reported recently. Never throws. */
async function reportFailure(
  err: unknown,
  notifier: Notifier,
  throttle: FailureThrottle,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const signature = message.split("\n")[0].slice(0, 200);
  try {
    if (await throttle.alreadyReported(signature)) {
      console.info("Same failure already reported recently — no email sent.");
      return;
    }
    await notifier.notifyFailure(message);
    await throttle.markReported(signature);
    console.info("Failure email sent.");
  } catch (reportErr) {
    // Don't mask the original error — e.g. SMTP itself may be what is down.
    console.error("Could not send failure email:", reportErr);
  }
}
