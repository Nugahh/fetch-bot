import type { Offer } from "../entities/Offer.js";

/**
 * Driven port: how the user is notified about new offers.
 *
 * The default adapter sends an email over SMTP, but this could just as well be
 * a Telegram/Slack/Discord adapter without touching the application core.
 */
export interface Notifier {
  /**
   * Notify the user about the given offers. Called only when `offers` is
   * non-empty, so implementations never need to handle the "nothing new" case.
   *
   * @param offers      the new offers to report
   * @param sourceName  label of the source the offers came from
   */
  notify(offers: Offer[], sourceName: string): Promise<void>;

  /**
   * Tell the user the bot itself failed (site unreachable, bad credentials…),
   * so an outage doesn't go unnoticed.
   *
   * @param message  the error message
   */
  notifyFailure(message: string): Promise<void>;
}
