#!/usr/bin/env node
/*
 * ledger/batch.js — the Sunday operator batch (SPEC §3.2 write path, last mile).
 *
 * 1. Load intents from the inbox (local dir via INTENT_INBOX_DIR, or Blob via
 *    BLOB_READ_WRITE_TOKEN).
 * 2. Re-validate each against the CURRENT replay state (first-come by received_at):
 *    balance, floor, one-side-per-member, already-processed. Rejects → rejections.jsonl
 *    with a reason (published with the export, SPEC §3.2).
 * 3. Append signed `lock` events to events.jsonl (hash chain + ed25519 operator sig).
 * 4. Export docs/data (R1) — git history is the public audit trail.
 *
 * Keys come from ~/.freedam-secrets/ledger.env (LEDGER_PRIV_KEY_B64). Never printed.
 * Usage: node ledger/batch.js [--inbox dir] [--dry-run]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { replay, validateEvent } = require('./lib/replay');
const { validateForBatch, IntentError } = require('./lib/intent');

const LEDGER_ENV = process.env.HOME + '/.freedam-secrets/ledger.env';
const LEDGER_DIR = process.env.LEDGER_DIR || __dirname; // LEDGER_DIR: sandbox/test hook; prod default = ledger/
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const DRY = process.argv.includes('--dry-run');

function loadOperatorKey() {
  if (!fs.existsSync(LEDGER_ENV)) {
    console.error('No operator key at ' + LEDGER_ENV + ' — run scripts/operator/gen-ledger-key.js first.');
    process.exit(1);
  }
  const env = Object.fromEntries(fs.readFileSync(LEDGER_ENV, 'utf8')
    .split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('=')));
  return require('crypto').createPrivateKey({ key: Buffer.from(env.LEDGER_PRIV_KEY_B64, 'base64'), format: 'der', type: 'pkcs8' });
}

function loadEvents(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map(JSON.parse);
}

function loadIntents() {
  const inbox = arg('--inbox') || process.env.INTENT_INBOX_DIR;
  if (inbox) {
    if (!fs.existsSync(inbox)) return [];
    return fs.readdirSync(inbox).filter(f => f.endsWith('.json'))
      .map(f => ({ _file: f, ...JSON.parse(fs.readFileSync(path.join(inbox, f), 'utf8')) }));
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    (async () => {
      const { list } = require('@vercel/blob');
      const out = [];
      for await (const b of list({ prefix: 'intents/' })) {
        const r = await fetch(b.url); out.push({ ...(await r.json()), _file: b.pathname });
      }
      return out;
    })();
  }
  console.error('No inbox: set INTENT_INBOX_DIR or BLOB_READ_WRITE_TOKEN.');
  process.exit(1);
}

// Main (intents load is sync for inbox; blob path handled via async wrapper)
const eventsFile = path.join(LEDGER_DIR, 'events.jsonl');
const events = loadEvents(eventsFile);
const state = replay(events);
const key = loadOperatorKey();

// first-come by timestamp: process in received_at order
const intents = loadIntents().sort((a, b) => (a.received_at || '').localeCompare(b.received_at || ''));
const processed = new Set(events.filter(e => e.type === 'lock').map(e => e.address + ':' + e.market));
const accepted = [], rejected = [];

for (const intent of intents) {
  try {
    validateForBatch(intent, state, processed);
    const ev = {
      seq: (events[events.length - 1]?.seq || 0) + 1,
      type: 'lock', address: intent.address, amount: intent.amount,
      market: intent.marketId, side: intent.side,
      ts: intent.received_at, note: `batch lock; intent deadline ${intent.deadline}`,
      prev_hash: state.lastHash
    };
    validateEvent(ev);
    ev.hash = '0x' + crypto.createHash('sha256').update(JSON.stringify({
      seq: ev.seq, type: ev.type, address: ev.address, amount: ev.amount,
      market: ev.market, side: ev.side, ts: ev.ts, note: ev.note ?? null
    })).digest('hex');
    ev.sig = '0x' + crypto.sign(null, Buffer.from(ev.hash.slice(2), 'hex'), key).toString('hex');
    events.push(ev);
    state.lastHash = ev.hash;
    processed.add(intent.address + ':' + intent.marketId);
    accepted.push(intent);
  } catch (err) {
    rejected.push({ intent: { ...intent, signature: undefined }, reason: err.code, detail: err.message, ts: new Date().toISOString() });
  }
}

if (!DRY) {
  fs.writeFileSync(eventsFile, events.map(e => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
  fs.appendFileSync(path.join(LEDGER_DIR, 'rejections.jsonl'),
    rejected.map(r => JSON.stringify(r)).join('\n') + (rejected.length ? '\n' : ''));
  if (!process.env.LEDGER_DIR) require('./export.js'); // sandbox runs skip the prod export
} else {
  console.log('dry run — nothing written');
}

console.log(`batch: ${accepted.length} locked, ${rejected.length} rejected`);
for (const r of rejected) console.log(`  REJECT ${r.intent.address?.slice(0, 10)}… ${r.intent.marketId}: ${r.reason} — ${r.detail}`);
