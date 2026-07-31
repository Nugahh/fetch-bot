import "dotenv/config";
import { AlInOfferSource } from "../adapters/alin/AlInOfferSource.js";

/**
 * Standalone test harness for the extraction only.
 *
 * Runs the al-in.fr login + offer fetch + mapping, then prints the result.
 * Sends NO email and writes NO state, and needs only ALIN_LOGIN / ALIN_PASSWORD.
 * Run with `npm run preview` (add DEBUG_OFFERS=1 to dump raw attributes).
 */
async function main(): Promise<void> {
  const login = process.env.ALIN_LOGIN;
  const password = process.env.ALIN_PASSWORD;
  if (!login || !password) {
    throw new Error("Set ALIN_LOGIN and ALIN_PASSWORD in .env first.");
  }

  const source = new AlInOfferSource({ login, password });
  console.log("Connexion à AL'in et récupération des offres…\n");

  const offers = await source.fetchOffers();
  console.log(`✅ ${offers.length} offre(s) récupérée(s).\n`);

  offers.forEach((o, i) => {
    console.log(`── Offre ${i + 1} ──────────────────────────────`);
    console.log(`  id        : ${o.id}`);
    console.log(`  prix      : ${o.price}${o.priceExcludingCharges ? `  (${o.priceExcludingCharges})` : ""}`);
    console.log(`  surface   : ${o.surface ?? "—"}`);
    console.log(`  typologie : ${o.typology ?? "—"}`);
    console.log(`  lieu      : ${o.location ?? "—"}`);
    console.log(`  réservé   : ${o.reserved ? "oui" : "non"}`);
    console.log(`  image     : ${o.imageUrl ?? "—"}`);
    console.log(`  lien      : ${o.detailUrl ?? "—"}`);
  });

  if (offers.length === 0) {
    console.log("(Aucune offre publiée en ce moment — c'est normal, pas une erreur.)");
  }
}

main().catch((err) => {
  console.error("\n❌ Échec :", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
