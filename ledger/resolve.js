#!/usr/bin/env node
/*
 * ledger/resolve.js — market resolution → payout events (SPEC increment 4, §2.3 locked 75/20/5).
 *
 * Reads the current replay state, applies the locked payout math to every locked stake
 * in the resolved market, appends operator-signed events, updates docs/data/markets.json.
 *
 * Usage:
 *   node ledger/resolve.js PM-001 --outcome yes|no|unresolved --source <url> [--vote-ref <id>]
 *   [--treasury 0x…] (default: the deploy-key wallet = DAO ops treasury, documented in the export)
 *   LEDGER_DIR env overrides the ledger directory (sandbox tests); prod default is ledger/.
 *
 * Outcome semantics (founder decisions D-6/D-7/D-8):
 *   yes|no       → winners get principal + 75%-share (resolve_win), losers slashed (resolve_lose),
 *                  treasury 20% as a mint to the treasury address, ≈5% + dust stays unallocated
 *                  (implicit burn, tracked as totals.slashed). No winners → the whole 75% share
 *                  is unallocated too (deflationary; nothing is minted to anyone).
 *   unresolved   → full refund to every staker (D-6), market marked unresolved.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { replay, validateEvent } = require('./lib/replay');
const { splitPool } = require('./lib/payout');

const LEDGER_ENV = process.env.HOME + '/.freedam-secrets/ledger.env';
const LEDGER_DIR = process.env.LEDGER_DIR || __dirname;

function arg(name) { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; }

function loadOperatorKey() {
  const env = Object.fromEntries(fs.readFileSync(LEDGER_ENV, 'utf8')
    .split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('=')));
  return {
    key: crypto.createPrivateKey({ key: Buffer.from(env.LEDGER_PRIV_KEY_B64, 'base64'), format: 'der', type: 'pkcs8' }),
    pub: env.LEDGER_PUB_KEY,
    treasury: env.LEDGER_TREASURY || null
  };
}

const [marketId] = process.argv.slice(2);
const outcome = arg('--outcome');
const source = arg('--source');
const voteRef = arg('--vote-ref');
if (!/^PM-[0-9]{3}$/.test(marketId || '') || !['yes', 'no', 'unresolved'].includes(outcome) || !source) {
  console.error('usage: node ledger/resolve.js PM-### --outcome yes|no|unresolved --source <url> [--vote-ref id]');
  process.exit(1);
}

const eventsFile = path.join(LEDGER_DIR, 'events.jsonl');
const events = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
const state = replay(events);
const { key, treasury: envTreasury } = loadOperatorKey();
const treasury = arg('--treasury') || envTreasury;

function appendEvent(e) {
  validateEvent(e);
  e.hash = '0x' + crypto.createHash('sha256').update(JSON.stringify({
    seq: e.seq, type: e.type, address: e.address, amount: e.amount,
    market: e.market, side: e.side, ts: e.ts, note: e.note ?? null
  })).digest('hex');
  e.sig = '0x' + crypto.sign(null, Buffer.from(e.hash.slice(2), 'hex'), key).toString('hex');
  events.push(e);
  return e;
}

// Collect locked stakes for this market from the replay state
const stakers = [];
for (const [addr, perMarket] of state.locked) {
  const s = perMarket[marketId];
  if (s) stakers.push({ address: addr, side: s.side, amount: s.amount, seq: s.seq });
}
if (stakers.length === 0) {
  console.error(`no locked stakes on ${marketId} — nothing to resolve`);
  process.exit(1);
}

const now = new Date().toISOString();
const market = outcome === 'yes' ? 'for' : outcome === 'no' ? 'against' : null;
const losingPool = stakers.filter(s => s.side !== market).reduce((t, s) => t + s.amount, 0);
const winners = market ? stakers.filter(s => s.side === market) : [];

// re-fetch locks after each event (state mutations) — work on a mutable copy
let seq = events[events.length - 1]?.seq || 0;
let prevHash = state.lastHash;
const written = [];

function push(e) {
  e.seq = ++seq;
  e.prev_hash = prevHash;
  const saved = appendEvent(e);
  prevHash = saved.hash;
  written.push(saved);
}

if (market) {
  const split = splitPool(winners.map(w => ({ address: w.address, stake: w.amount, seq: w.seq })), losingPool, treasury || 'unallocated');
  const shareByAddr = new Map(split.allocations.map(a => [a.address, a.share]));
  // winners first (earliest lock seq first, matching the allocation order)
  for (const w of winners.sort((a, b) => a.seq - b.seq)) {
    const share = shareByAddr.get(w.address) || 0;
    push({ type: 'resolve_win', address: w.address, amount: w.amount + share, market: marketId, side: w.side, ts: now, note: `outcome ${outcome}; principal ${w.amount} + share ${share}; source ${source}` });
  }
  for (const l of stakers.filter(s => s.side !== market).sort((a, b) => a.seq - b.seq)) {
    push({ type: 'resolve_lose', address: l.address, amount: 0, market: marketId, side: l.side, ts: now, note: `outcome ${outcome}; stake ${l.amount} slashed to 75/20/5; source ${source}` });
  }
  if (treasury && split.treasury > 0) {
    push({ type: 'mint', address: treasury, amount: split.treasury, ts: now, note: `${marketId} treasury share (20% of losing pool ${losingPool})` });
  }
  console.log(`${marketId} → ${outcome.toUpperCase()}: winners ${winners.length} (share pool ${split.winners_share}), losers ${losingPool - split.winners_share - split.treasury > 0 ? '' : ''}${stakers.length - winners.length}, treasury ${split.treasury}, implicit burn ${split.burn}`);
} else {
  for (const s of stakers.sort((a, b) => a.seq - b.seq)) {
    push({ type: 'refund', address: s.address, amount: 0, market: marketId, side: s.side, ts: now, note: `market unresolved (dead); full refund of ${s.amount}; source ${source}` });
  }
  console.log(`${marketId} → UNRESOLVED: ${stakers.length} stake(s) fully refunded (D-6)`);
}

if (!process.env.LEDGER_DIR) {
  fs.writeFileSync(eventsFile, events.map(e => JSON.stringify(e)).join('\n') + '\n');
  // record the resolution on the public market record
  const marketsPath = path.join(__dirname, '..', 'docs', 'data', 'markets.json');
  const marketsJson = JSON.parse(fs.readFileSync(marketsPath, 'utf8'));
  const m = marketsJson.markets.find(x => x.id === marketId);
  if (m) {
    m.state = outcome === 'yes' ? 'resolved_yes' : outcome === 'no' ? 'resolved_no' : 'unresolved';
    m.resolution = {
      outcome: outcome === 'yes' ? 'resolved_yes' : outcome === 'no' ? 'resolved_no' : 'unresolved',
      source_url: source,
      vote_ref: voteRef ?? null,
      appeal_ends: null,
      resolved_at: now,
      event_seq: written[0].seq
    };
    m.data_as_of = now;
    marketsJson.data_as_of = now;
    fs.writeFileSync(marketsPath, JSON.stringify(marketsJson, null, 2) + '\n');
  }
  require('./export.js');
} else {
  fs.writeFileSync(eventsFile, events.map(e => JSON.stringify(e)).join('\n') + '\n');
  console.log('sandbox: export skipped (LEDGER_DIR set)');
}
