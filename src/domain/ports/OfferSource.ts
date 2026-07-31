import type { Offer } from "../entities/Offer.js";

/**
 * Driven port: a source of housing offers.
 *
 * Implement this once per site you want to watch. The application core depends
 * only on this interface, so swapping al-in.fr for another provider is just a
 * matter of writing another adapter — no change to the use case.
 */
export interface OfferSource {
  /** A short label used in logs and the email subject, e.g. "AL'in". */
  readonly name: string;

  /**
   * Authenticate (if needed) and return the offers currently available for the
   * configured search. Should return an empty array when there are none, and
   * throw on unexpected failures (auth, network, …).
   */
  fetchOffers(): Promise<Offer[]>;
}
