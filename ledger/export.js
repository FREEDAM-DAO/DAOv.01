#!/usr/bin/env node
/*
 * ledger/export.js — operator batch read path (SPEC §3.1, option R1).
 * Replays ledger/events.jsonl → writes static JSON to docs/data/ for the public site.
 * Git history of the export doubles as the public audit trail (D10).
 * Usage: node ledger/export.js [--events path] [--out docs/data]
 *   MEMBER_RPC_URL — optional; when set, leaderboards show on-chain member numbers.
 *   COI_FLAGS — optional JSON array of {address, kind} (operator-published conflict flags).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { replay, LedgerError } = require('./lib/replay');
const { buildLeaderboard } = require('./lib/leaderboard');

const ROOT = path.join(__dirname, '..');
const eventsPath = flag('--events') || path.join(__dirname, 'events.jsonl');
const outDir = flag('--out') || path.join(ROOT, 'docs', 'data');
const DATA_DIR = process.env.DATA_DIR || outDir; // DATA_DIR: sandbox/test hook

function flag(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
}

function loadEvents(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n')
    .filter(l => l.trim())
    .map((l, i) => {
      try { return JSON.parse(l); }
      catch (e) { throw new LedgerError('JSONL', `line ${i + 1} is not valid JSON`); }
    });
}

function operatorPubKey() {
  const envFile = path.join(require('os').homedir(), '.freedam-secrets', 'ledger.env');
  if (!fs.existsSync(envFile)) return null;
  const m = /LEDGER_PUB_KEY=([0-9a-f]+)/.exec(fs.readFileSync(envFile, 'utf8'));
  return m ? '0x' + m[1] : null;
}

const events = loadEvents(eventsPath);
const state = replay(events);

const asOf = new Date().toISOString();
const marketsJson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'markets.json'), 'utf8'));

// Merge replayed totals into market records (no PII; addresses only on the ledger page).
for (const m of marketsJson.markets) {
  const mt = state.marketTotals.get(m.id);
  m.totals = mt
    ? { for_aura: mt.for_aura, against_aura: mt.against_aura, for_count: mt.for_count, against_count: mt.against_count }
    : m.totals;
  m.data_as_of = asOf;
}
marketsJson.data_as_of = asOf;

// Leaderboard: "our members called it" (ranked by correct calls, never Aura)
async function memberNumbers(addresses) {
  const numbers = new Map();
  if (!process.env.MEMBER_RPC_URL) return numbers;
  try {
    const { JsonRpcProvider, Interface } = require('ethers');
    const provider = new JsonRpcProvider(process.env.MEMBER_RPC_URL);
    const iface = new Interface(['function getMemberNumber(address) view returns (uint256)']);
    const { FRDM_ID_ADDRESS } = require('./lib/intent');
    await Promise.all(addresses.map(async (address) => {
      try {
        const r = await provider.call({ to: FRDM_ID_ADDRESS, data: iface.encodeFunctionData('getMemberNumber', [address]) });
        const n = iface.decodeFunctionResult('getMemberNumber', r)[0];
        if (n > 0) numbers.set(address.toLowerCase(), Number(n));
      } catch { /* address has no FRDM-ID number; shown without */ }
    }));
  } catch { /* RPC down: leaderboard ships without numbers */ }
  return numbers;
}

(async () => {
  const coiFlags = new Set((JSON.parse(process.env.COI_FLAGS || '[]')).map(f => String(f.address).toLowerCase()));
  const walletAddrs = [...state.balances.keys()].filter(a => /^0x[0-9a-fA-F]{40}$/.test(a));
  const numbers = await memberNumbers(walletAddrs);
  const leaderboard = buildLeaderboard(events, { coiFlags, memberNumbers: numbers });

  // Public ledger page data (D10): every event, full history visible; balances per member.
  const ledgerPublic = {
    data_as_of: asOf,
    operator_pub_key: operatorPubKey(),
    event_count: events.length,
    totals: state.totals,
    balances: [...state.balances.entries()].map(([addr, aura]) => ({ address: addr, aura })),
    leaderboard,
    events: events.map(e => ({ seq: e.seq, type: e.type, address: e.address, amount: e.amount, market: e.market ?? null, side: e.side ?? null, ts: e.ts, note: e.note ?? null }))
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'markets.json'), JSON.stringify(marketsJson, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'ledger.json'), JSON.stringify(ledgerPublic, null, 2) + '\n');
  console.log(`exported ${events.length} events → ${outDir}/markets.json, ledger.json (as of ${asOf})`);
})();
