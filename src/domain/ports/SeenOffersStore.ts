/**
 * Driven port: persistence of already-notified offer IDs.
 *
 * This is what makes the bot alert on *new* offers only. The default adapter
 * stores IDs in a JSON file (persisted between GitHub Actions runs via cache or
 * a commit), but any key/value store would do.
 */
export interface SeenOffersStore {
  /** Return the set of offer IDs already notified in previous runs. */
  load(): Promise<Set<string>>;

  /** Persist the full set of offer IDs known so far. */
  save(ids: Set<string>): Promise<void>;
}
