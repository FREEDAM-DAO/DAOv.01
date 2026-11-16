/*
 * Aura minting v1 — donation → Aura via the locked yield-curve band table
 * (RESEARCH_YIELD_CURVE_RATE_SETTING: 20/10/5 Aura per $ at $50/$100/$200, $200 per-member
 * hard cap; $250 community monthly cap filled best-band-first, pro-rata if needed).
 * Time-donation mints wait for Ticket #5. ETH→$ rate is governance-published per batch
 * and written into the event note.
 */
'use strict';

const BANDS = Object.freeze([
  { upTo: 50, rate: 20 },   // first $50: 20 Aura/$
  { upTo: 100, rate: 10 },  // next $50: 10 Aura/$
  { upTo: 200, rate: 5 }    // next $100: 5 Aura/$; above $200: 0 (hard cap)
]);
const PER_MEMBER_MONTHLY_CAP_USD = 200;
const COMMUNITY_MONTHLY_CAP_USD = 250;

/** Aura for one member's monthly donation dollars (integer, floors the final dollar slice). */
function auraForUsd(usd) {
  let aura = 0, left = Math.min(usd, PER_MEMBER_MONTHLY_CAP_USD), prev = 0;
  for (const b of BANDS) {
    const slice = Math.min(left, b.upTo - prev);
    if (slice <= 0) break;
    aura += Math.floor(slice * b.rate);
    left -= slice;
    prev = b.upTo;
  }
  return aura;
}

/**
 * Monthly community-capped allocation: everyone's FIRST band fills before anyone's
 * second (best-band-first), then pro-rata within each band if the cap binds.
 * @param {Array<{address, usd}>} donations — validated USD-equivalent per member this month
 * @returns {Array<{address, aura}>}
 */
function mintBatch(donations) {
  const cap = COMMUNITY_MONTHLY_CAP_USD;
  let total = donations.reduce((s, d) => s + d.usd, 0);
  if (total <= cap) return donations.map(d => ({ address: d.address, aura: auraForUsd(d.usd) }));

  // Cap binds: scale everyone's usable dollars so Σusable = cap, then apply band table.
  const scale = cap / total;
  return donations.map(d => ({ address: d.address, aura: auraForUsd(d.usd * scale) }));
}

module.exports = { BANDS, PER_MEMBER_MONTHLY_CAP_USD, COMMUNITY_MONTHLY_CAP_USD, auraForUsd, mintBatch };
