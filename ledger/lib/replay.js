/*
 * FREEDAM Aura Ledger — core event validation + deterministic replay.
 * Implements TICKET_PM_AURA_LEDGER D1–D10 as locked (SQLite skipped in v1 per SPEC ⚑ flag:
 * in-memory replay is the rebuildable cache; add SQLite only when a query needs it).
 *
 * One-way valve: the event vocabulary is CLOSED (D3). No withdraw/redeem/convert event
 * can be written or replayed, so Aura→money conversion is inexpressible by construction.
 *
 * Balance model (per the locked event table): `lock` debits the member; `resolve_win`
 * credits principal + winning share; `resolve_lose` credits nothing (the stake is
 * "slashed to the 75/20/5 split" — the winners' share, treasury mint and implicit dust
 * burn are the disposition of the losers' never-returned stakes); `refund` credits the
 * full stake back (dead market, D-6). `mint` to the treasury address carries the 20%
 * share with the market id in the note (Aura stays Aura).
 */
'use strict';

const crypto = require('crypto');

const EVENT_TYPES = Object.freeze([
  'mint', 'lock', 'resolve_win', 'resolve_lose', 'refund', 'burn', 'expire'
]);
const ZERO_HASH = '0x' + '0'.repeat(64);
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const MARKET_RE = /^PM-[0-9]{3}$/;
const MARKET_EVENTS = new Set(['lock', 'resolve_win', 'resolve_lose', 'refund']);

class LedgerError extends Error {
  constructor(code, message) { super(`[${code}] ${message}`); this.code = code; }
}

/** Canonical hash of an event (everything except prev_hash/sig, which chain it). */
function eventHash(ev) {
  const core = {
    seq: ev.seq, type: ev.type, address: ev.address, amount: ev.amount,
    market: ev.market ?? null, side: ev.side ?? null, ts: ev.ts, note: ev.note ?? null
  };
  return '0x' + crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex');
}

/** Validate one event's shape + closed vocabulary. Throws LedgerError on any violation. */
function validateEvent(ev) {
  if (!Number.isInteger(ev.seq) || ev.seq < 1) throw new LedgerError('SEQ', 'seq must be a positive integer');
  if (!EVENT_TYPES.includes(ev.type)) {
    throw new LedgerError('VOCAB', `unknown event type "${ev.type}" — vocabulary is closed: ${EVENT_TYPES.join(', ')}`);
  }
  if (!ADDR_RE.test(ev.address || '')) throw new LedgerError('ADDR', 'address must be a 20-byte hex wallet');
  if (!Number.isInteger(ev.amount) || ev.amount < 0) throw new LedgerError('AMOUNT', 'amount must be a non-negative integer (Aura, no floats)');
  if (MARKET_EVENTS.has(ev.type)) {
    if (!MARKET_RE.test(ev.market || '')) throw new LedgerError('MARKET', `${ev.type} requires a PM-### market id`);
    if (ev.type !== 'refund' && ev.side !== 'for' && ev.side !== 'against') {
      throw new LedgerError('SIDE', `${ev.type} requires side for|against`);
    }
  } else {
    if (ev.market != null) throw new LedgerError('MARKET', `${ev.type} must not carry a market`);
    if (ev.side != null) throw new LedgerError('SIDE', `${ev.type} must not carry a side`);
  }
  if (isNaN(Date.parse(ev.ts))) throw new LedgerError('TS', 'ts must be an ISO date-time');
  if (ev.note != null && (typeof ev.note !== 'string' || ev.note.length > 500)) throw new LedgerError('NOTE', 'note must be ≤500 chars');
}

/** Build a chain-linked event (caller supplies its own signing via the writer CLI). */
function makeEvent(state, fields, sign) {
  const prev = state.events[state.events.length - 1];
  const ev = { seq: (prev ? prev.seq : 0) + 1, ...fields, prev_hash: prev ? prev.hash : ZERO_HASH };
  validateEvent(ev);
  ev.hash = eventHash(ev);
  ev.sig = sign(ev.hash, ev);
  return ev;
}

/**
 * Deterministic replay (fold) over a chain. Same events → same balances, always.
 * Verifies seq continuity + hash-chain (silent deletion/tamper detection, D4).
 * Returns { balances, locked, marketTotals, totals, events, lastHash }.
 */
function replay(events) {
  let prevHash = ZERO_HASH;
  events.forEach((ev, i) => {
    if (ev.seq !== i + 1) throw new LedgerError('CHAIN', `seq gap: expected ${i + 1}, got ${ev.seq}`);
    if (ev.prev_hash !== prevHash) throw new LedgerError('CHAIN', `hash-chain break at seq ${ev.seq}: silent deletion or edit detected`);
    validateEvent(ev);
    const h = eventHash(ev);
    if (ev.hash && ev.hash !== h) throw new LedgerError('CHAIN', `hash mismatch at seq ${ev.seq}`);
    prevHash = h;
  });

  const balances = new Map();     // address → spendable Aura
  const locked = new Map();       // address → { market: {side, amount, seq, ts} }
  const marketTotals = new Map(); // market → { for_aura, against_aura, for_count, against_count }
  const totals = { minted: 0, locked_aura: 0, burned: 0, slashed: 0 };
  const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);

  function credit(addr, amt) { balances.set(addr, (balances.get(addr) || 0) + amt); }
  function debit(addr, amt, seq) {
    const bal = balances.get(addr) || 0;
    if (amt > bal) throw new LedgerError('OVERDRAW', `seq ${seq}: ${short(addr)} overdraws (${amt} > ${bal})`);
    balances.set(addr, bal - amt);
  }
  function decMarket(market, side, amount) {
    const mt = marketTotals.get(market);
    if (mt) mt[side + '_aura'] -= amount;
  }
  function popLock(addr, market, seq) {
    const perMarket = locked.get(addr) || {};
    const stake = perMarket[market];
    if (!stake) throw new LedgerError('RESOLVE', `seq ${seq}: ${short(addr)} has no lock on ${market}`);
    delete perMarket[market];
    return stake;
  }

  for (const ev of events) {
    switch (ev.type) {
      case 'mint':
        credit(ev.address, ev.amount);
        totals.minted += ev.amount;
        break;
      case 'lock': {
        if (ev.amount < 10) throw new LedgerError('FLOOR', `seq ${ev.seq}: stake below 10-Aura floor (D9)`);
        const perMarket = locked.get(ev.address) || {};
        if (perMarket[ev.market]) throw new LedgerError('SIDE_DUP', `seq ${ev.seq}: ${short(ev.address)} already staked ${ev.market} — one side per member per market (D-8)`);
        debit(ev.address, ev.amount, ev.seq);
        perMarket[ev.market] = { side: ev.side, amount: ev.amount, seq: ev.seq, ts: ev.ts };
        locked.set(ev.address, perMarket);
        const mt = marketTotals.get(ev.market) || { for_aura: 0, against_aura: 0, for_count: 0, against_count: 0 };
        mt[ev.side + '_aura'] += ev.amount;
        mt[ev.side + '_count'] += 1;
        marketTotals.set(ev.market, mt);
        totals.locked_aura += ev.amount;
        break;
      }
      case 'resolve_win': {
        const stake = popLock(ev.address, ev.market, ev.seq);
        if (ev.amount < stake.amount) throw new LedgerError('RESOLVE', `seq ${ev.seq}: win payout ${ev.amount} < principal ${stake.amount}`);
        credit(ev.address, ev.amount);
        totals.locked_aura -= stake.amount;
        decMarket(ev.market, stake.side, stake.amount);
        break;
      }
      case 'resolve_lose': {
        const stake = popLock(ev.address, ev.market, ev.seq);
        if (ev.amount !== 0) throw new LedgerError('LOSE', 'resolve_lose amount must be 0 — the stake is slashed to the 75/20/5 split (never returned)');
        totals.locked_aura -= stake.amount;
        totals.slashed += stake.amount;
        decMarket(ev.market, stake.side, stake.amount);
        break;
      }
      case 'refund': { // dead market (D-6): full refund of the locked stake
        const stake = popLock(ev.address, ev.market, ev.seq);
        credit(ev.address, stake.amount);
        totals.locked_aura -= stake.amount;
        decMarket(ev.market, stake.side, stake.amount);
        break;
      }
      case 'burn':
        debit(ev.address, ev.amount, ev.seq);
        totals.burned += ev.amount;
        break;
      case 'expire': // D6 inactivity forfeit — burns from the member's balance
        debit(ev.address, ev.amount, ev.seq);
        totals.burned += ev.amount;
        break;
      default:
        throw new LedgerError('VOCAB', `unreachable: ${ev.type}`); // closed vocabulary guarantees this
    }
  }
  return { balances, locked, marketTotals, totals, events, lastHash: prevHash };
}

module.exports = { EVENT_TYPES, ZERO_HASH, LedgerError, eventHash, validateEvent, makeEvent, replay };
