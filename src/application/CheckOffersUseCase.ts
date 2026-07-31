import type { Offer } from "../domain/entities/Offer.js";
import type { OfferSource } from "../domain/ports/OfferSource.js";
import type { Notifier } from "../domain/ports/Notifier.js";
import type { SeenOffersStore } from "../domain/ports/SeenOffersStore.js";

export interface CheckOffersResult {
  fetched: number;
  newOffers: Offer[];
  notified: boolean;
}

/**
 * Core use case, wired purely from ports. It:
 *   1. fetches the current offers from the source,
 *   2. keeps only those never seen before,
 *   3. notifies the user if (and only if) there are new ones,
 *   4. records every currently-available offer as "seen".
 *
 * Note on step 4: we persist the IDs of *all* offers currently online, not just
 * the new ones. This lets an offer that disappears and reappears re-notify, and
 * keeps the state from growing unbounded with stale IDs.
 */
export class CheckOffersUseCase {
  constructor(
    private readonly source: OfferSource,
    private readonly notifier: Notifier,
    private readonly store: SeenOffersStore,
    private readonly logger: { info: (m: string) => void } = console,
  ) {}

  async execute(): Promise<CheckOffersResult> {
    const offers = await this.source.fetchOffers();
    this.logger.info(`[${this.source.name}] ${offers.length} offer(s) available.`);

    const seen = await this.store.load();
    const newOffers = offers.filter((o) => !seen.has(o.id));

    if (newOffers.length === 0) {
      this.logger.info(`[${this.source.name}] No new offer — no email sent.`);
      // Still persist the current set so IDs of gone offers get pruned.
      await this.store.save(new Set(offers.map((o) => o.id)));
      return { fetched: offers.length, newOffers, notified: false };
    }

    this.logger.info(`[${this.source.name}] ${newOffers.length} new offer(s) — sending email.`);
    await this.notifier.notify(newOffers, this.source.name);

    await this.store.save(new Set(offers.map((o) => o.id)));
    return { fetched: offers.length, newOffers, notified: true };
  }
}
