import "dotenv/config";
import { loadConfig } from "./config.js";
import { AlInOfferSource } from "./adapters/alin/AlInOfferSource.js";
import { SmtpNotifier } from "./adapters/email/SmtpNotifier.js";
import { FileSeenOffersStore } from "./adapters/storage/FileSeenOffersStore.js";
import { CheckOffersUseCase } from "./application/CheckOffersUseCase.js";

/**
 * Composition root: this is the ONLY place that knows which concrete adapters
 * are used. Point `source` at a different OfferSource to watch another site.
 */
async function run(): Promise<void> {
  const config = loadConfig();

  const source = new AlInOfferSource(config.alinCredentials, config.alinSearch);
  const notifier = new SmtpNotifier(config.smtp);
  const store = new FileSeenOffersStore(config.stateFile);

  const useCase = new CheckOffersUseCase(source, notifier, store);
  const result = await useCase.execute();

  console.log(
    `Done. fetched=${result.fetched}, new=${result.newOffers.length}, emailSent=${result.notified}`,
  );
}

run().catch((err) => {
  console.error("fetch-bot failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
