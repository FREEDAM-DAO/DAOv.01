/*
 * Payout math — locked 75/20/5 (SPEC §2.3), deterministic integer allocation.
 * Largest-remainder method; ties broken by earliest lock seq (D-8 bookkeeping).
 * Found decisions applied: dead market → full refund (D-6); no winners → 75% share burns (D-7);
 * one side per member per market (D-8).
 */
'use strict';

const RATES = Object.freeze({ winners: 0.75, treasury: 0.20 }); // burn ≈ 5% + rounding dust

/**
 * Split the losing pool L for a market resolving to side W.
 * @param {Array<{address, stake, seq}>} winners  — locked stakes on the winning side
 * @param {number} losingPool — total Aura locked on the losing side
 * @param {string} treasuryAddress — where the 20% treasury share goes (stays Aura, stays Aura)
 * @returns {{principal: number, winners_share: number, treasury: number, burn: number,
 *            allocations: Array<{address, share, seq}>, treasuryTo: string}}
 */
function splitPool(winners, losingPool, treasuryAddress) {
  const principal = winners.reduce((s, w) => s + w.stake, 0);
  const winners_share = Math.floor(losingPool * RATES.winners);
  const treasury = Math.floor(losingPool * RATES.treasury);
  const burn = losingPool - winners_share - treasury; // ≈5% + all rounding dust

  const allocations = allocateProRata(winners, winners_share);

  return { principal, winners_share, treasury, burn, allocations, treasuryTo: treasuryAddress };
}

/** Largest-remainder integer allocation, deterministic. Ties → earliest lock seq first. */
function allocateProRata(entries, total) {
  if (total <= 0 || entries.length === 0) return [];
  const sum = entries.reduce((s, e) => s + e.stake, 0);
  const ordered = [...entries].sort((a, b) => a.seq - b.seq); // earliest lock seq breaks ties
  const raw = ordered.map(e => (e.stake / sum) * total);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((s, f) => s + f, 0);
  // Hand out leftover units by largest fractional part; equal fractions → earlier seq (already ordered).
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < remainder; k++) floors[order[k].i] += 1;
  return ordered.map((e, i) => ({ address: e.address, share: floors[i], seq: e.seq }));
}

module.exports = { RATES, splitPool, allocateProRata };
