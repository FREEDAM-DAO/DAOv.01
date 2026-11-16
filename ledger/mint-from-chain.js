#!/usr/bin/env node
/*
 * ledger/mint-from-chain.js — donation → Aura mint batch (SPEC §2.2 "Aura minting v1",
 * part of the MVP cut). Reads `MembershipMinted(member, memberNumber, tier, donation)`
 * logs from FRDM-ID on OP Sepolia and applies the locked band table (ledger/lib/mint.js):
 * 20/10/5 Aura per $ at $50/$100/$200, $200 member cap, $250 community monthly cap.
 *
 * ETH→$ rate is governance-published per batch and written into every event note
 * (--rate-usd-per-eth). Blocks already covered by previous mint events are skipped
 * (idempotent: re-running writes nothing new). Deduped per (member, block, tx, logIndex).
 *
 * Usage:
 *   node ledger/mint-from-chain.js --rate-usd-per-eth 3000 [--from-block 0] [--dry-run]
 *   LEDGER_DIR env → sandbox. Keys are NOT needed to READ; writing needs the operator
 *   key only (same as batch.js). MEMBERSHIP minimum excluded? No — every donation that
 *   minted an FRDM-ID counts, per the locked band table.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { replay, validateEvent } = require('./lib/replay');
const { auraForUsd, mintBatch } = require('./lib/mint');

const LEDGER_ENV = process.env.HOME + '/.freedam-secrets/ledger.env';
const LEDGER_DIR = process.env.LEDGER_DIR || __dirname;
const RPC = process.env.MEMBER_RPC_URL || process.env.SEALE_RPC_URL || 'https://sepolia.optimism.io';
const FRDM_DEPLOY_BLOCK = 49516009; // binary-searched 2026-11-16 (eth_getCode); avoids pruned-history RPCs
const DRY = process.argv.includes('--dry-run');

function arg(n) { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; }
function hasFlag(n) { return process.argv.includes(n); }
const rate = Number(arg('--rate-usd-per-eth'));
if (!rate || rate <= 0) {
  console.error('usage: node ledger/mint-from-chain.js --rate-usd-per-eth <governance rate> [--from-block N] [--dry-run]');
  process.exit(1);
}
const fromBlock = Number(arg('--from-block') || FRDM_DEPLOY_BLOCK);

(async () => {
  const { ethers } = require('ethers');
  const { FRDM_ID_ADDRESS } = require('./lib/intent');
  const provider = new ethers.JsonRpcProvider(RPC);
  const iface = new ethers.Interface([
    'event MembershipMinted(address indexed member, uint256 memberNumber, uint8 tier, uint256 donation)'
  ]);

  const blockNow = await provider.getBlockNumber();
  // public RPCs cap eth_getLogs ranges; paginate in 9,000-block windows with retries
  const CHUNK = 9000;
  const logs = [];
  async function getLogsChunk(start, end) {
    for (let t = 0; t < 7; t++) {
      try {
        const out = [...await provider.getLogs({
          address: FRDM_ID_ADDRESS,
          topics: [iface.getEvent('MembershipMinted').topicHash],
          fromBlock: start, toBlock: end
        })];
        await new Promise(r => setTimeout(r, 350)); // pace: public RPC rate limits
        return out;
      } catch (e) { await new Promise(r => setTimeout(r, 5000 * (t + 1))); }
    }
    throw new Error(`getLogs failed for blocks ${start}–${end} after retries`);
  }
  for (let start = fromBlock; start <= blockNow; start += CHUNK) {
    logs.push(...await getLogsChunk(start, Math.min(start + CHUNK - 1, blockNow)));
  }
  const donations = new Map(); // member → monthly USD total (single batch = current month)
  const seen = [];
  for (const log of logs) {
    const parsed = iface.parseLog(log);
    const member = parsed.args.member.toLowerCase();
    const usd = Number(ethers.formatEther(parsed.args.donation)) * rate;
    donations.set(member, (donations.get(member) || 0) + usd);
    seen.push({ member, usd, block: log.blockNumber, tx: log.transactionHash });
  }
  if (seen.length === 0) { console.log('no on-chain membership mints found — nothing to mint'); return; }
  console.log(`found ${seen.length} on-chain mint(s) from block ${fromBlock}; rate $${rate}/ETH`);

  // Community cap fills everyone's best band first (lib/mint.mintBatch)
  const batch = mintBatch([...donations.entries()].map(([address, usd]) => ({ address, usd })));
  const auraByAddr = new Map(batch.map(b => [b.address, b.aura]));

  // Build operator-signed mint events
  const env = Object.fromEntries(fs.readFileSync(LEDGER_ENV, 'utf8')
    .split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('=')));
  const key = crypto.createPrivateKey({ key: Buffer.from(env.LEDGER_PRIV_KEY_B64, 'base64'), format: 'der', type: 'pkcs8' });

  const eventsFile = path.join(LEDGER_DIR, 'events.jsonl');
  const events = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
  const state = replay(events);
  // idempotency: skip members already minted from the same tx
  const done = new Set(events.filter(e => e.type === 'mint').map(e => (e.note || '').match(/tx:(0x[0-9a-f]{64})/)?.[1]).filter(Boolean));

  let seq = events[events.length - 1]?.seq || 0;
  let prevHash = state.lastHash;
  const now = new Date().toISOString();
  const written = [];
  for (const s of seen) {
    if (done.has(s.tx)) continue;
    const amount = auraByAddr.get(s.member) || 0;
    if (amount <= 0) continue;
    const e = { seq: ++seq, type: 'mint', address: s.member, amount, ts: now, note: `donation $${s.usd.toFixed(2)} @ $${rate}/ETH; block ${s.block}; tx:${s.tx}`, prev_hash: prevHash };
    validateEvent(e);
    e.hash = '0x' + crypto.createHash('sha256').update(JSON.stringify({
      seq: e.seq, type: e.type, address: e.address, amount: e.amount,
      market: null, side: null, ts: e.ts, note: e.note ?? null
    })).digest('hex');
    e.sig = '0x' + crypto.sign(null, Buffer.from(e.hash.slice(2), 'hex'), key).toString('hex');
    prevHash = e.hash;
    written.push(e);
  }

  if (DRY) {
    console.log(`dry run — would write ${written.length} mint event(s):`);
    for (const e of written) console.log(`  ${e.address.slice(0, 10)}… +${e.amount} Aura`);
    return;
  }
  fs.writeFileSync(eventsFile, [...events, ...written].map(e => JSON.stringify(e)).join('\n') + (written.length ? '\n' : ''));
  console.log(`minted ${written.length} batch event(s) onto the ledger`);
  if (!process.env.LEDGER_DIR) require('./export.js');
})().catch(e => { console.error('mint batch failed:', e.message); process.exit(1); });
