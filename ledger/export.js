#!/usr/bin/env node
/*
 * ledger/export.js — operator batch read path (SPEC §3.1, option R1).
 * Replays ledger/events.jsonl → writes static JSON to docs/data/ for the public site.
 * Git history of the export doubles as the public audit trail (D10).
 * Usage: node ledger/export.js [--events path] [--out docs/data]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { replay, LedgerError } = require('./lib/replay');

const ROOT = path.join(__dirname, '..');
const eventsPath = flag('--events') || path.join(__dirname, 'events.jsonl');
const outDir = flag('--out') || path.join(ROOT, 'docs', 'data');

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

const events = loadEvents(eventsPath);
const state = replay(events);

const asOf = new Date().toISOString();
const marketsJson = JSON.parse(fs.readFileSync(path.join(outDir, 'markets.json'), 'utf8'));

// Merge replayed totals into market records (no PII; addresses only on the ledger page).
for (const m of marketsJson.markets) {
  const mt = state.marketTotals.get(m.id);
  m.totals = mt
    ? { for_aura: mt.for_aura, against_aura: mt.against_aura, for_count: mt.for_count, against_count: mt.against_count }
    : m.totals;
  m.data_as_of = asOf;
}
marketsJson.data_as_of = asOf;

// Public ledger page data (D10): every event, redacted to short form + amounts.
const ledgerPublic = {
  data_as_of: asOf,
  event_count: events.length,
  totals: state.totals,
  balances: [...state.balances.entries()].map(([addr, aura]) => ({ address: addr, aura })),
  events: events.map(e => ({ seq: e.seq, type: e.type, address: e.address, amount: e.amount, market: e.market ?? null, side: e.side ?? null, ts: e.ts, note: e.note ?? null }))
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'markets.json'), JSON.stringify(marketsJson, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'ledger.json'), JSON.stringify(ledgerPublic, null, 2) + '\n');
console.log(`exported ${events.length} events → ${outDir}/markets.json, ledger.json (as of ${asOf})`);
