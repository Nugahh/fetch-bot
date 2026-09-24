/**
 * Driven port: remembers which failure was last reported to the user.
 *
 * The bot runs every 15 minutes, so without this a persistent outage (site
 * down, bad credentials…) would send an error email on every run. A failure is
 * reported once; the same failure is only repeated as a reminder after a while.
 */
export interface FailureThrottle {
  /** True if this exact failure was already reported recently. */
  alreadyReported(signature: string): Promise<boolean>;

  /** Record that this failure was reported now. */
  markReported(signature: string): Promise<void>;

  /** Forget the last failure — called after a successful run. */
  reset(): Promise<void>;
}
