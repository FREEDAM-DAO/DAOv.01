/*
 * Leaderboard — "our members called it" (SPEC §2.4).
 * Ranked by CORRECT CALLS, not Aura won (plutocracy guard). Tie-break: accuracy %
 * (shown only after ≥3 resolved markets with participation), then earliest first
 * correct call. Display = wallet short form + member number (on-chain getMemberNumber).
 * COI-flagged stakes are marked on the board.
 */
'use strict';

/**
 * @param {Array} events — replay-validated event chain
 * @param {Map} marketTotals — from replay
 * @param {Object} opts — { coiFlags: Set<addressLower>, memberNumbers: Map<addrLower, number> }
 */
function buildLeaderboard(events, opts = {}) {
  const coi = opts.coiFlags || new Set();
  const numbers = opts.memberNumbers || new Map();
  // a "call" = a lock on a market that later resolved (resolve_win / resolve_lose exists)
  const resolvedMarkets = new Set(events.filter(e => e.type === 'resolve_win' || e.type === 'resolve_lose').map(e => e.market));
  const stats = new Map(); // addr → { calls, correct, aura_won, first_correct }
  for (const ev of events) {
    if (ev.type !== 'lock' || !resolvedMarkets.has(ev.market)) continue;
    const a = ev.address.toLowerCase();
    const s = stats.get(a) || { calls: 0, correct: 0, aura_won: 0, first_correct: null };
    s.calls += 1;
    stats.set(a, s);
  }
  for (const ev of events) {
    if (ev.type !== 'resolve_win') continue;
    const a = ev.address.toLowerCase();
    const s = stats.get(a);
    if (!s) continue; // resolve_win for a member without a counted lock shouldn't happen; skip
    s.correct += 1;
    s.aura_won += ev.amount;
    if (!s.first_correct || ev.ts < s.first_correct) s.first_correct = ev.ts;
  }
  const rows = [...stats.entries()]
    .filter(([, s]) => s.correct > 0 || s.calls > 0)
    .map(([address, s]) => {
      const accuracy = s.calls > 0 ? s.correct / s.calls : 0;
      return {
        address,
        short: address.slice(0, 6) + '…' + address.slice(-4),
        member_number: numbers.get(address) ?? null,
        correct_calls: s.correct,
        calls: s.calls,
        // accuracy displayed only after ≥3 resolved markets (per spec)
        accuracy: s.calls >= 3 ? accuracy : null,
        first_correct: s.first_correct,
        coi_flagged: coi.has(address)
      };
    })
    .sort((a, b) =>
      b.correct_calls - a.correct_calls ||                                  // primary: correct calls
      (b.accuracy ?? -1) - (a.accuracy ?? -1) ||                            // tie: accuracy (hidden <3 calls)
      String(a.first_correct || '9999').localeCompare(String(b.first_correct || '9999')) // tie: earliest first correct call
    );
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

module.exports = { buildLeaderboard };
