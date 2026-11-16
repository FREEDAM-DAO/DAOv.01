#!/usr/bin/env node
/*
 * ledger/seal.js — post the monthly Merkle root on OP Sepolia (SPEC §7, no new contract).
 * 0-ETH self-send from the dedicated seal key; calldata = 32-byte root. Tamper-evident
 * timestamp with zero contract risk. Gas is a few hundred wei of testnet ETH.
 *
 * Usage: node ledger/seal.js [--events path] [--rpc url] [--dry-run]
 * Writes the seal record (root, tx hash, month tag, event count) to ledger/seals.jsonl.
 * Private key lives in ~/.freedam-secrets/seal.env — never printed.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { rootForEvents } = require('./lib/merkle');

const DRY = process.argv.includes('--dry-run');
function arg(n) { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; }

const eventsFile = arg('--events') || path.join(__dirname, 'events.jsonl');
const RPC = arg('--rpc') || process.env.SEALE_RPC_URL || 'https://sepolia.optimism.io';
const SEAL_ENV = path.join(os.homedir(), '.freedam-secrets', 'seal.env');

const events = fs.existsSync(eventsFile)
  ? fs.readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
  : [];
if (events.length === 0) { console.error('no events to seal'); process.exit(1); }

const root = rootForEvents(events);
const month = new Date().toISOString().slice(0, 7);
console.log(`events: ${events.length}  month: ${month}  root: ${root}`);

if (DRY) { console.log('dry run — nothing posted'); process.exit(0); }

(async () => {
  const { ethers } = require('ethers');
  if (!fs.existsSync(SEAL_ENV)) {
    console.error('no seal key at ' + SEAL_ENV + ' — run scripts/operator/gen-seal-key.js and fund the address with OP Sepolia ETH first.');
    process.exit(1);
  }
  const env = Object.fromEntries(fs.readFileSync(SEAL_ENV, 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=')));
  const wallet = new ethers.Wallet(env.SEAL_PRIV_KEY, new ethers.JsonRpcProvider(RPC));

  // Idempotency: don't double-post the same root for the same month.
  const sealsFile = path.join(__dirname, 'seals.jsonl');
  const seals = fs.existsSync(sealsFile) ? fs.readFileSync(sealsFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
  if (seals.some(s => s.root === root && s.month === month)) {
    console.log('this root is already sealed for ' + month + ' — nothing to do');
    process.exit(0);
  }

  const fee = (await wallet.provider.getFeeData()).maxFeePerGas;
  const tx = await wallet.sendTransaction({ to: wallet.address, value: 0n, data: root, gasLimit: 30000n, maxFeePerGas: fee });
  console.log('tx sent: ' + tx.hash + ' — waiting for confirmation…');
  const receipt = await tx.wait();
  if (receipt.status !== 1) { console.error('seal tx FAILED on-chain'); process.exit(1); }

  fs.appendFileSync(sealsFile, JSON.stringify({ month, root, event_count: events.length, last_seq: events[events.length - 1].seq, tx_hash: receipt.hash, seal_address: wallet.address, ts: new Date().toISOString() }) + '\n');
  console.log(`sealed ✓ ${month} root=${root} tx=${receipt.hash} block=${receipt.blockNumber}`);
})().catch(e => { console.error('seal failed:', e.message); process.exit(1); });
