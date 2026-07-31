import type { Offer } from "../../domain/entities/Offer.js";
import type { OfferSource } from "../../domain/ports/OfferSource.js";

/**
 * al-in.fr (AL'in / Action Logement) offer source.
 *
 * al-in.fr is an Angular SPA backed by a JSON:API. This adapter talks to that
 * API directly (no browser), reproducing the site's own two-step auth:
 *
 *   1. POST {AUTH_BASE}/accounts/authenticate  (+ X-GeXRT-API-Key)  -> access_token
 *   2. POST {API_BASE}/token_exchange/als_hermes_salarie           -> jwt_token
 *   3. GET  {API_BASE}/dmo/housing_offers?...  (Bearer jwt_token)
 *
 * The constants below (base URLs + gexrt key) are public app configuration,
 * discovered from the site's runtime config (https://al-in.fr/info). They are
 * not secrets — only ALIN_LOGIN / ALIN_PASSWORD are.
 */

const AUTH_BASE = "https://api.be-ys.com/als-back/v1";
const API_BASE = "https://api.al-in.fr/api";
const GEXRT_API_KEY = "7d6bfa55-4632-41ed-bddd-597866ebbfb5";
/** Base used to resolve relative picture paths and build offer detail links. */
const SITE_BASE = "https://al-in.fr";
const PICTURE_BASE = "https://api.al-in.fr";

export interface AlInCredentials {
  login: string;
  password: string;
}

export interface AlInSearchOptions {
  /** Restrict to these postal codes (e.g. ["94420"]). */
  postalCodes?: string[];
  /** Restrict to these department codes (e.g. ["94"]). */
  departments?: string[];
  /** Minimum rent, charges included (euros). */
  minRent?: number;
  /** Maximum rent, charges included (euros). */
  maxRent?: number;
  /** "APT" (apartment) or "MIN" (house). Omit for both. */
  kind?: "APT" | "MIN";
  /** Page size (max offers requested per page). Defaults to 100. */
  perPage?: number;
}

interface Logger {
  info: (m: string) => void;
  warn: (m: string) => void;
}

/** Raw JSON:API resource as returned by /dmo/housing_offers. */
interface OfferResource {
  id: string | number;
  type?: string;
  attributes?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Both JSON:API and Feathers-style envelopes are tolerated. */
interface OffersResponse {
  data?: OfferResource[];
  total?: number;
  meta?: { total?: number };
}

export class AlInOfferSource implements OfferSource {
  readonly name = "AL'in";

  constructor(
    private readonly credentials: AlInCredentials,
    private readonly search: AlInSearchOptions = {},
    private readonly logger: Logger = console,
  ) {}

  async fetchOffers(): Promise<Offer[]> {
    const accessToken = await this.authenticate();
    const jwt = await this.exchangeToken(accessToken);
    const resources = await this.fetchAllPages(jwt);
    return resources.map((r) => this.toOffer(r));
  }

  // ── Step 1: login ──────────────────────────────────────────────────────
  private async authenticate(): Promise<string> {
    const res = await fetch(`${AUTH_BASE}/accounts/authenticate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GeXRT-API-Key": GEXRT_API_KEY,
      },
      body: JSON.stringify({
        login: this.credentials.login,
        password: this.credentials.password,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `AL'in authenticate failed (HTTP ${res.status}). ` +
          `Check ALIN_LOGIN / ALIN_PASSWORD. Body: ${await safeBody(res)}`,
      );
    }
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) {
      throw new Error("AL'in authenticate returned no access_token.");
    }
    return json.access_token;
  }

  // ── Step 2: exchange for the API JWT ───────────────────────────────────
  private async exchangeToken(accessToken: string): Promise<string> {
    const res = await fetch(`${API_BASE}/token_exchange/als_hermes_salarie`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    });
    if (!res.ok) {
      throw new Error(
        `AL'in token exchange failed (HTTP ${res.status}). Body: ${await safeBody(res)}`,
      );
    }
    const json = (await res.json()) as { jwt_token?: string };
    if (!json.jwt_token) {
      throw new Error("AL'in token exchange returned no jwt_token.");
    }
    return json.jwt_token;
  }

  // ── Step 3: list offers (paginated) ────────────────────────────────────
  private async fetchAllPages(jwt: string): Promise<OfferResource[]> {
    const perPage = this.search.perPage ?? 100;
    const all: OfferResource[] = [];
    const MAX_PAGES = 20; // safety cap

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${API_BASE}/dmo/housing_offers?${this.buildQuery(perPage, page)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
      if (!res.ok) {
        throw new Error(
          `AL'in housing_offers failed (HTTP ${res.status}). Body: ${await safeBody(res)}`,
        );
      }
      const json = (await res.json()) as OffersResponse;
      const batch = json.data ?? [];

      if (page === 1 && process.env.DEBUG_OFFERS && batch[0]) {
        this.logger.info(
          `[AL'in] DEBUG first offer attributes: ${JSON.stringify(batch[0].attributes ?? batch[0])}`,
        );
      }

      all.push(...batch);
      if (batch.length < perPage) break; // last page reached
    }
    return all;
  }

  /** Build the Feathers-style query string used by the site's offer search. */
  private buildQuery(perPage: number, page: number): string {
    const p = new URLSearchParams();
    for (const code of this.search.postalCodes ?? []) p.append("postal_code[$in][]", code);
    for (const dep of this.search.departments ?? []) p.append("department[$in][]", dep);
    p.set("per_page", String(perPage));
    p.set("page", String(page));
    if (this.search.kind) p.set("kind", this.search.kind);
    if (this.search.minRent != null) p.append("rent_with_charges[$gte]", String(this.search.minRent));
    if (this.search.maxRent != null) p.append("rent_with_charges[$lte]", String(this.search.maxRent));
    // Only currently-published offers (matches the site's own defaults).
    p.append("publication_end_date[$gte]", ymd(daysFromNow(-1)));
    p.append("date_publication_start[$lte]", ymd(new Date()));
    return p.toString();
  }

  // ── Mapping: raw resource -> domain Offer ──────────────────────────────
  private toOffer(resource: OfferResource): Offer {
    const a = (resource.attributes ?? resource) as Record<string, unknown>;
    const id = String(resource.id ?? a.id ?? a.reference ?? cryptoRandom());

    const rentWith = num(a.rent_with_charges);
    const rentWithout = num(a.rent_amount ?? a.rent_without_charges);
    const surface = num(a.surface ?? a.area ?? a.living_area);
    const typology = str(a.typology ?? a.typology_range);
    const city = str(a.district ?? a.city ?? a.town);
    const postal = str(a.postal_code);

    const offer: Offer = {
      id,
      price: rentWith != null ? `${formatEuro(Math.round(rentWith))} €` : str(a.price) ?? "Prix N/C",
      priceExcludingCharges:
        rentWithout != null ? `${formatEuro(Math.round(rentWithout))} € hors charges` : undefined,
      surface: surface != null ? `${surface} m²` : undefined,
      typology,
      location: city ? (postal ? `${city} (${postal})` : city) : postal,
      imageUrl: this.resolvePicture(a),
      detailUrl: `${SITE_BASE}/#/fiche-logement/${id}`,
      reserved: Boolean(a.reserved ?? a.reserving_business_name),
    };
    return offer;
  }

  /** Pull the best picture URL out of the many possible attribute shapes. */
  private resolvePicture(a: Record<string, unknown>): string | undefined {
    const pics = Array.isArray(a.pictures) ? a.pictures : [];
    const candidate =
      str(a.main_picture_url) ??
      pictureFromObject(a.main_picture) ??
      pictureFromObject(pics[0]) ??
      firstPicture(a.photos) ??
      firstPicture(a.photographies);
    if (!candidate) return undefined;
    if (/^https?:\/\//i.test(candidate)) return candidate;
    return candidate.startsWith("/") ? `${PICTURE_BASE}${candidate}` : `${PICTURE_BASE}/${candidate}`;
  }
}

// ── small helpers ────────────────────────────────────────────────────────
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}
function firstPicture(v: unknown): string | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const first = v[0];
  if (typeof first === "string") return first;
  return pictureFromObject(first);
}
/** Extract a URL from an al-in picture object, preferring absolute thumbnails. */
function pictureFromObject(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  return (
    str(o.thumb1000_absolute) ??
    str(o.full_size_absolute) ??
    str(o.thumb240_absolute) ??
    str(o.url) ??
    str(o.full_size) ??
    str(o.thumb1000) ??
    str(o.src) ??
    str(o.path)
  );
}
function formatEuro(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
function cryptoRandom(): string {
  return Math.random().toString(36).slice(2);
}
async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<unreadable>";
  }
}
