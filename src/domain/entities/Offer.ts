/**
 * A housing offer, in a site-agnostic shape.
 *
 * This is the core domain entity. Every {@link OfferSource} adapter (al-in.fr,
 * or any other site added later) is responsible for mapping its own payload
 * into this structure. Nothing in the domain knows where an offer came from.
 */
export interface Offer {
  /** Stable, source-unique identifier. Used for deduplication. */
  id: string;
  /** Rent charges included, formatted for display, e.g. "375 €". */
  price: string;
  /** Rent excluding charges, if known, e.g. "229 € hors charge". */
  priceExcludingCharges?: string;
  /** Living area, e.g. "29 m²". */
  surface?: string;
  /** Typology, e.g. "T1". */
  typology?: string;
  /** Human-readable location, e.g. "Le Plessis-Trévise (94420)". */
  location?: string;
  /** Absolute URL of the main picture, if any. */
  imageUrl?: string;
  /** Absolute URL of the offer's detail page, if any. */
  detailUrl?: string;
  /** Whether the offer is already reserved. */
  reserved?: boolean;
}
