import { loadConfig } from "./config.js";
import { AlInOfferSource } from "./adapters/alin/AlInOfferSource.js";
import { SmtpNotifier } from "./adapters/email/SmtpNotifier.js";
import { S3SeenOffersStore } from "./adapters/storage/S3SeenOffersStore.js";
import { CheckOffersUseCase } from "./application/CheckOffersUseCase.js";

/**
 * AWS Lambda entry point, triggered by an EventBridge schedule.
 *
 * Same wiring as src/main.ts (the composition root), but the state store is
 * backed by S3 instead of a local file — that is the ONLY infrastructure
 * difference. The domain, application and other adapters are untouched.
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

  const result = await new CheckOffersUseCase(source, notifier, store).execute();

  return {
    statusCode: 200,
    fetched: result.fetched,
    newOffers: result.newOffers.length,
    notified: result.notified,
  };
};
