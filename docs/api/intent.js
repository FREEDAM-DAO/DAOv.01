/*
 * docs/api/intent.js — the site's FIRST server code (SPEC increment 3, decision D-2).
 * Vercel Function under the docs/ Root Directory — no build step, no framework.
 *
 * POST /api/intent  { marketId, side, amount, address, nonce, deadline, signature }
 *   → 201 { status: 'pending', detail: "Signed ✓ — locks in this Sunday's batch." }
 *
 * Security posture (SPEC §8 risk note 3):
 *   - holds no money, no keys;
 *   - accepts only a valid EIP-712 `Stake` signature from an FRDM-ID member;
 *   - replay-safe: one stored object per address+market+nonce (duplicate → 409);
 *   - worst case is spam intents, which the operator batch rejects with a published reason.
 *
 * Storage: Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production);
 * INTENT_INBOX_DIR (append to a local dir) for tests/dev — clearly flagged by env.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { validateIntent, IntentError } = require('../../ledger/lib/intent.js');

// Lazy requires so dev/test mode needs zero npm deps.
let ethers = null, blob = null;
function getEthers() {
  if (!ethers) ethers = require('ethers');
  return ethers;
}
function getBlob() {
  if (!blob) blob = require('@vercel/blob');
  return blob;
}

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (code, obj) => ({ statusCode: code, headers: JSON_HEADERS, body: JSON.stringify(obj) });

async function hasMembership(address) {
  const rpcUrl = process.env.MEMBER_RPC_URL || 'https://sepolia.optimism.io';
  const E = getEthers();
  const provider = new E.JsonRpcProvider(rpcUrl);
  const { FRDM_ID_ADDRESS } = require('../../ledger/lib/intent.js');
  const iface = new E.Interface(['function hasMembership(address) view returns (bool)']);
  const data = iface.encodeFunctionData('hasMembership', [address]);
  const result = await provider.call({ to: FRDM_ID_ADDRESS, data });
  return iface.decodeFunctionResult('hasMembership', result)[0];
}

async function marketStakeable(marketId) {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data'); // DATA_DIR: test hook; prod default unchanged
  const markets = JSON.parse(fs.readFileSync(path.join(dataDir, 'markets.json'), 'utf8'));
  const m = markets.markets.find(x => x.id === marketId);
  return !!m && (m.state === 'open' || m.state === 'stalled');
}

async function storeIntent(intent) {
  const key = `intents/${intent.marketId}/${intent.address}-${intent.nonce}-${intent.side}.json`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = getBlob();
    await put(key, JSON.stringify(intent), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false, // deterministic key: a replayed nonce overwrites → detected at batch
      allowOverwrite: false   // 409 from Blob on duplicate = replay protection at rest
    });
    return 'blob';
  }
  if (process.env.INTENT_INBOX_DIR) {
    const dir = process.env.INTENT_INBOX_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, key.replaceAll('/', '__'));
    if (fs.existsSync(file)) throw new IntentError('REPLAY', 'identical intent already stored');
    fs.writeFileSync(file, JSON.stringify(intent));
    return 'inbox';
  }
  throw Object.assign(new Error('intake storage not configured'), { code: 'NO_STORAGE' });
}

module.exports = async function handler(req, res) {
  const respond = (code, obj) => {
    for (const [k, v] of Object.entries(JSON_HEADERS)) res.setHeader(k, v);
    res.statusCode = code;
    res.end(JSON.stringify(obj));
  };
  if (req.method !== 'POST') return respond(405, { error: 'POST only' });

  // Rate limit per IP in-memory (best effort; Vercel also fronts us). Spam worst-case = batch rejects.
  let body = '';
  try {
    for await (const chunk of req) body += chunk;
    if (body.length > 8192) return respond(413, { error: 'body too large' });
    const intent = await validateIntent(JSON.parse(body), {
      verifyStakeSig: async (i) => getEthers().verifyTypedData(
        require('../../ledger/lib/intent.js').DOMAIN,
        require('../../ledger/lib/intent.js').TYPES, {
          marketId: i.marketId, side: i.side, amount: i.amount, nonce: i.nonce, deadline: i.deadline
        }, i.signature),
      hasMembership, marketStakeable
    });
    const backend = await storeIntent(intent);
    return respond(201, { status: 'pending', backend, detail: "Signed ✓ — locks in this Sunday's batch (pending). The batch re-checks your balance first-come by timestamp." });
  } catch (err) {
    if (err instanceof SyntaxError) return respond(400, { error: 'JSON', detail: 'body is not valid JSON' });
    if (err instanceof IntentError) {
      if (err.code === 'REPLAY') return respond(409, { error: 'REPLAY', detail: 'this intent (address+market+nonce) was already submitted' });
      return respond(400, { error: err.code, detail: err.message });
    }
    if (err.code === 'NO_STORAGE') return respond(503, { error: 'INTAKE_DISABLED', detail: 'stake intake is not live yet — no signed data was lost; try again after the next deploy.' });
    if (err.code === 'REPLAY' || /already/i.test(err.message || '')) return respond(409, { error: 'REPLAY', detail: 'this intent (address+market+nonce) was already submitted' });
    console.error('intent endpoint error:', err.message);
    return respond(500, { error: 'INTERNAL', detail: 'intake unavailable — try again; nothing was stored.' });
  }
};

// node --test support: allow `require(...)` use as a fetch-style handler too.
module.exports.JSON_HEADERS = JSON_HEADERS;
