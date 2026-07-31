import type { AlInCredentials, AlInSearchOptions } from "./adapters/alin/AlInOfferSource.js";
import type { SmtpConfig } from "./adapters/email/SmtpNotifier.js";

export interface AppConfig {
  alinCredentials: AlInCredentials;
  alinSearch: AlInSearchOptions;
  smtp: SmtpConfig;
  stateFile: string;
}

/** Read + validate configuration from environment variables. Throws on missing required values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    alinCredentials: {
      login: required(env, "ALIN_LOGIN"),
      password: required(env, "ALIN_PASSWORD"),
    },
    alinSearch: {
      postalCodes: list(env.ALIN_POSTAL_CODES),
      departments: list(env.ALIN_DEPARTMENTS),
      minRent: numberOrUndefined(env.ALIN_MIN_RENT),
      maxRent: numberOrUndefined(env.ALIN_MAX_RENT),
      kind: kindOrUndefined(env.ALIN_KIND),
      perPage: numberOrUndefined(env.ALIN_PER_PAGE) ?? 100,
    },
    smtp: {
      host: env.SMTP_HOST ?? "smtp.gmail.com",
      port: numberOrUndefined(env.SMTP_PORT) ?? 465,
      secure: (env.SMTP_SECURE ?? "true").toLowerCase() !== "false",
      user: required(env, "SMTP_USER"),
      pass: required(env, "SMTP_PASS"),
      from: env.MAIL_FROM ?? required(env, "SMTP_USER"),
      to: required(env, "MAIL_TO"),
    },
    stateFile: env.STATE_FILE ?? "data/seen-offers.json",
  };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return v.trim();
}
function list(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter((s) => s !== "");
}
function numberOrUndefined(v: string | undefined): number | undefined {
  if (!v || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function kindOrUndefined(v: string | undefined): "APT" | "MIN" | undefined {
  const up = v?.trim().toUpperCase();
  return up === "APT" || up === "MIN" ? up : undefined;
}
