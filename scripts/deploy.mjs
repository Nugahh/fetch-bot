import "dotenv/config";
import { spawnSync } from "node:child_process";

/**
 * Deploys the already-built `dist/` to AWS with `sam deploy`, feeding the
 * template parameters from `.env` (same variable names as the local run).
 *
 * Usage:  npm run deploy -- <stack-name>      (or set STACK_NAME in .env)
 *
 * Every parameter is passed explicitly, so `.env` is the single source of
 * truth: clearing a filter there clears it on the Lambda too.
 */
const env = process.env;

function need(key) {
  const v = env[key]?.trim();
  if (!v) {
    console.error(`❌ ${key} manquant dans .env`);
    process.exit(1);
  }
  return v;
}

const stackName = process.argv[2] ?? env.STACK_NAME;
if (!stackName) {
  console.error("❌ Nom de stack manquant : `npm run deploy -- <stack-name>` ou STACK_NAME dans .env");
  process.exit(1);
}
const region = env.AWS_REGION ?? "eu-west-3";

const smtpUser = need("SMTP_USER");
const params = {
  AlinLogin: need("ALIN_LOGIN"),
  AlinPassword: need("ALIN_PASSWORD"),
  SmtpUser: smtpUser,
  SmtpPass: need("SMTP_PASS"),
  MailFrom: env.MAIL_FROM?.trim() || smtpUser, // same fallback as src/config.ts
  MailTo: need("MAIL_TO"),
  SmtpHost: env.SMTP_HOST?.trim() || "smtp.gmail.com",
  SmtpPort: env.SMTP_PORT?.trim() || "465",
  AlinPostalCodes: env.ALIN_POSTAL_CODES?.trim() ?? "",
  AlinDepartments: env.ALIN_DEPARTMENTS?.trim() ?? "",
  AlinMinRent: env.ALIN_MIN_RENT?.trim() ?? "",
  AlinMaxRent: env.ALIN_MAX_RENT?.trim() ?? "",
  AlinKind: (env.ALIN_KIND ?? "").trim().toUpperCase(),
  Schedule: env.SCHEDULE?.trim() || "rate(15 minutes)",
  AlertEmail: env.ALERT_EMAIL?.trim() || env.MAIL_TO.trim(), // failure alerts go to MAIL_TO by default
};

// SAM splits overrides on whitespace, so each value is wrapped in double quotes.
const quote = (v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const overrides = Object.entries(params).map(([k, v]) => `${k}=${quote(v)}`);

console.log(`🚀 sam deploy → stack "${stackName}" (${region})`);

const result = spawnSync(
  "sam",
  [
    "deploy",
    "--stack-name", stackName,
    "--region", region,
    "--capabilities", "CAPABILITY_IAM",
    "--resolve-s3",
    "--confirm-changeset", // shows what will change and asks before applying
    "--parameter-overrides", ...overrides,
  ],
  { stdio: "inherit" },
);

if (result.error) {
  console.error("❌ Impossible de lancer `sam` — est-il installé ? (brew install aws-sam-cli)");
  process.exit(1);
}
process.exit(result.status ?? 1);
