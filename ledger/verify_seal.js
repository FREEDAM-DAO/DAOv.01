#!/usr/bin/env node
/*
 * ledger/verify_seal.js — recompute the Merkle root from events.jsonl and check it
 * against a posted seal (SPEC §7 receipt: verify_seal output matching the on-chain tx).
 *
 * Usage:
 *   node ledger/verify_seal.js --tx 0x…          # fetch the tx, compare calldata to recomputed root
 *   node ledger/verify_seal.js --root 0x…        # compare against a known root (offline)
 *   node ledger/verify_seal.js --all             # check every seal in ledger/seals.jsonl against events@last_seq
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { rootForEvents } = require('./lib/merkle');

function arg(n) { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; }
function hasFlag(n) { return process.argv.includes(n); }
const LEDGER_DIR = process.env.LEDGER_DIR || __dirname; // LEDGER_DIR: sandbox/test hook
const eventsFile = arg('--events') || path.join(LEDGER_DIR, 'events.jsonl');
const RPC = arg('--rpc') || process.env.SEALE_RPC_URL || 'https://sepolia.optimism.io';

const allEvents = fs.existsSync(eventsFile)
  ? fs.readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
  : [];

function rootAtSeq(seq) {
  return rootForEvents(allEvents.filter(e => e.seq <= seq));
}

(async () => {
  let failures = 0;
  if (arg('--tx')) {
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(RPC);
    const tx = await provider.getTransaction(arg('--tx'));
    if (!tx) { console.error('tx not found'); process.exit(1); }
    const computed = rootForEvents(allEvents);
    const posted = tx.data;
    const ok = posted.toLowerCase() === computed.toLowerCase();
    console.log(`tx ${tx.hash}\n  posted calldata: ${posted}\n  recomputed root: ${computed}\n  events: ${allEvents.length}\n  ${ok ? 'MATCH ✓ seal verified' : 'MISMATCH ✗ events changed since seal'}`);
    process.exit(ok ? 0 : 1);
  }
  if (arg('--root')) {
    const computed = rootForEvents(allEvents);
    const ok = arg('--root').toLowerCase() === computed.toLowerCase();
    console.log(`recomputed: ${computed}\nexpected:   ${arg('--root')}\n${ok ? 'MATCH ✓' : 'MISMATCH ✗'}`);
    process.exit(ok ? 0 : 1);
  }
  if (hasFlag('--all')) {
    const sealsFile = path.join(LEDGER_DIR, 'seals.jsonl');
    const seals = fs.existsSync(sealsFile) ? fs.readFileSync(sealsFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
    for (const s of seals) {
      const computed = rootAtSeq(s.last_seq);
      const ok = computed.toLowerCase() === s.root.toLowerCase();
      if (!ok) failures++;
      console.log(`${s.month} events≤${s.last_seq}: ${ok ? 'MATCH ✓' : 'MISMATCH ✗'} (${s.tx_hash})`);
    }
    console.log(failures === 0 ? `all ${seals.length} seal(s) verify ✓` : `${failures} seal(s) FAILED`);
    process.exit(failures ? 1 : 0);
  }
  console.error('usage: --tx 0x… | --root 0x… | --all');
  process.exit(1);
})();
