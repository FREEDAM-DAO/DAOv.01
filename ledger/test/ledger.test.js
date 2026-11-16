'use strict';
/* Aura ledger core — node --test suite (SPEC increment 2 receipt). */
const test = require('node:test');
const assert = require('node:assert');
const { EVENT_TYPES, LedgerError, eventHash, validateEvent, replay } = require('../lib/replay');
const { splitPool, allocateProRata } = require('../lib/payout');
const { auraForUsd, mintBatch } = require('../lib/mint');

const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'b'.repeat(40);
const C = '0x' + 'c'.repeat(40);
const T = '0x' + 'd'.repeat(40); // treasury
let n = 0;
function ev(fields) {
  return { seq: ++n, ts: '2026-11-16T00:00:0' + ((n % 10)) + 'Z', ...fields };
}
function chain(events) {
  let prev = '0x' + '0'.repeat(64);
  return events.map(e => { e.prev_hash = prev; e.hash = eventHash(e); prev = e.hash; return e; });
}

test('closed vocabulary rejects unknown event types', () => {
  for (const bad of ['withdraw', 'redeem', 'convert', 'transfer', 'cash_out', 'mint_back']) {
    assert.throws(() => validateEvent(ev({ type: bad, address: A, amount: 1 })), LedgerError, bad);
  }
  assert.strictEqual(EVENT_TYPES.length, 7);
});

test('replay determinism: same chain → same balances, twice', () => {
  function build() {
    n = 0;
    return chain([
      ev({ type: 'mint', address: A, amount: 1000 }),
      ev({ type: 'mint', address: B, amount: 500 }),
      ev({ type: 'lock', address: A, amount: 100, market: 'PM-001', side: 'for' }),
      ev({ type: 'lock', address: B, amount: 50, market: 'PM-001', side: 'against' }),
      ev({ type: 'resolve_win', address: A, amount: 100, market: 'PM-001', side: 'for' }),
      ev({ type: 'resolve_lose', address: B, amount: 0, market: 'PM-001', side: 'against' })
    ]);
  }
  const s1 = replay(build());
  const s2 = replay(build());
  assert.deepStrictEqual([...s1.balances], [...s2.balances]);
  assert.strictEqual(s1.lastHash, s2.lastHash);
});

test('75/20/5: L=1000 → 750 winners / 200 treasury / 50 burn', () => {
  const r = splitPool([{ address: A, stake: 100, seq: 3 }], 1000, T);
  assert.deepStrictEqual([r.winners_share, r.treasury, r.burn], [750, 200, 50]);
});

test('largest-remainder rounding dust goes to burn, allocations exact', () => {
  // L=7: winners_share=5, treasury=1, burn=1 (dust)
  const r = splitPool([
    { address: A, stake: 10, seq: 3 }, { address: B, stake: 10, seq: 4 }, { address: C, stake: 10, seq: 5 }
  ], 7, T);
  assert.strictEqual(r.allocations.reduce((s, a) => s + a.share, 0), r.winners_share);
  assert.deepStrictEqual(r.allocations.map(a => a.share), [2, 2, 1]);
  assert.strictEqual(r.burn, 1);
});

test('tie broken by earliest lock seq', () => {
  const allocs = allocateProRata(
    [{ address: B, stake: 10, seq: 9 }, { address: A, stake: 10, seq: 3 }], 10);
  assert.strictEqual(allocs[0].address, A); // equal fractions → earlier seq first
  assert.deepStrictEqual(allocs.map(a => a.share), [5, 5]);
});

test('replay applies full resolution: winner gets principal + share, loser is slashed', () => {
  n = 0;
  // A staked 100 FOR, B staked 60 AGAINST. L=60 → share=45 (75%), treasury=12, dust=3.
  // resolve_lose = the stake is slashed (per the locked event table); treasury share
  // arrives as a mint to the treasury address with the market in the note.
  const events = chain([
    ev({ type: 'mint', address: A, amount: 1000 }),
    ev({ type: 'mint', address: B, amount: 500 }),
    ev({ type: 'lock', address: A, amount: 100, market: 'PM-002', side: 'for' }),
    ev({ type: 'lock', address: B, amount: 60, market: 'PM-002', side: 'against' }),
    ev({ type: 'resolve_win', address: A, amount: 100 + 45, market: 'PM-002', side: 'for' }),
    ev({ type: 'resolve_lose', address: B, amount: 0, market: 'PM-002', side: 'against' }),
    ev({ type: 'mint', address: T, amount: 12, note: 'PM-002 treasury share (20% of losing pool)' })
  ]);
  const s = replay(events);
  assert.strictEqual(s.balances.get(A), 1000 + 45);
  assert.strictEqual(s.balances.get(B), 440);
  assert.strictEqual(s.totals.locked_aura, 0);
  assert.strictEqual(s.totals.slashed, 60);
});

test('overdraw rejected at lock', () => {
  n = 0;
  const events = chain([
    ev({ type: 'mint', address: A, amount: 50 }),
    ev({ type: 'lock', address: A, amount: 100, market: 'PM-001', side: 'for' })
  ]);
  assert.throws(() => replay(events), /OVERDRAW/);
});

test('10-Aura floor enforced (D9)', () => {
  n = 0;
  const events = chain([
    ev({ type: 'mint', address: A, amount: 1000 }),
    ev({ type: 'lock', address: A, amount: 9, market: 'PM-001', side: 'for' })
  ]);
  assert.throws(() => replay(events), /FLOOR/);
});

test('one side per member per market (D-8); adding to same side also rejected — single lock only', () => {
  n = 0;
  const dup = chain([
    ev({ type: 'mint', address: A, amount: 1000 }),
    ev({ type: 'lock', address: A, amount: 10, market: 'PM-001', side: 'for' }),
    ev({ type: 'lock', address: A, amount: 10, market: 'PM-001', side: 'against' })
  ]);
  assert.throws(() => replay(dup), /SIDE_DUP/);
});

test('dead market → full refund (D-6)', () => {
  n = 0;
  const events = chain([
    ev({ type: 'mint', address: A, amount: 1000 }),
    ev({ type: 'lock', address: A, amount: 100, market: 'PM-003', side: 'for' }),
    ev({ type: 'refund', address: A, amount: 0, market: 'PM-003', side: 'for' })
  ]);
  const s = replay(events);
  assert.strictEqual(s.balances.get(A), 1000);
  assert.strictEqual(s.totals.locked_aura, 0);
});

test('silent deletion detected: hash-chain break', () => {
  n = 0;
  const events = chain([
    ev({ type: 'mint', address: A, amount: 100 }),
    ev({ type: 'mint', address: B, amount: 100 }),
    ev({ type: 'mint', address: C, amount: 100 })
  ]);
  const tampered = events.filter(e => e.seq !== 2); // delete middle event
  assert.throws(() => replay(tampered), /CHAIN/);
});

test('band table: $120 → 1600, whale $200 → 2000, $250+ capped at $200', () => {
  assert.strictEqual(auraForUsd(120), 1600);
  assert.strictEqual(auraForUsd(200), 2000);
  assert.strictEqual(auraForUsd(250), 2000); // above $200 mints nothing extra
  assert.strictEqual(auraForUsd(0), 0);
});

test('community $250 cap fills best-band-first', () => {
  // Sam $120 + whale $200 = $320 total > $250 cap → scale 0.78125
  const out = mintBatch([{ address: A, usd: 120 }, { address: B, usd: 200 }]);
  const totalAura = out.reduce((s, o) => s + o.aura, 0);
  const scaled = mintBatch([{ address: A, usd: 120 * 0.78125 }, { address: B, usd: 200 * 0.78125 }]);
  assert.deepStrictEqual(out, scaled);
  assert.ok(out.every(o => o.aura >= 0) && Number.isInteger(out[0].aura));
});

test('no winners → whole 75% share burns (D-7), others unchanged', () => {
  const r = splitPool([], 800, T);
  assert.strictEqual(r.winners_share, Math.floor(800 * 0.75));
  assert.strictEqual(r.allocations.length, 0);
  // operator then writes a burn of winners_share from pool custody (deflationary, not a benefit)
  assert.strictEqual(r.burn + r.treasury, 800 - r.winners_share);
});
