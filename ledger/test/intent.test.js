'use strict';
/* Increment 3 receipt — stake intent validation, endpoint handler, operator batch. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Wallet, verifyTypedData } = require('ethers');
const { DOMAIN, TYPES, MIN_STAKE, IntentError, validateIntentShape, validateIntent, validateForBatch } = require('../lib/intent');
const { replay, eventHash, validateEvent } = require('../lib/replay');

const WALLET = new Wallet('0x' + '11'.repeat(32)); // throwaway test key, no funds, not an operator key
const MEMBER_CTX = {
  verifyStakeSig: async (i) => verifyTypedData(DOMAIN, TYPES,
    { marketId: i.marketId, side: i.side, amount: i.amount, nonce: i.nonce, deadline: i.deadline }, i.signature),
  hasMembership: async () => true,
  marketStakeable: async () => true
};
async function signedIntent(overrides = {}, signer = WALLET) {
  const base = { marketId: 'PM-001', side: 'for', amount: 50, nonce: 1, deadline: Math.floor(Date.now() / 1000) + 3600 };
  const i = { ...base, ...overrides };
  i.signature = await signer.signTypedData(DOMAIN, TYPES, { marketId: i.marketId, side: i.side, amount: i.amount, nonce: i.nonce, deadline: i.deadline });
  i.address = signer.address;
  return i;
}

test('valid signed intent passes full validation', async () => {
  const out = await validateIntent(await signedIntent(), MEMBER_CTX);
  assert.strictEqual(out.address, WALLET.address.toLowerCase());
  assert.ok(out.received_at);
});

test('bad signature rejected (SIG_MISMATCH)', async () => {
  const i = await signedIntent();
  const forged = await signedIntent({}, new Wallet('0x' + '22'.repeat(32)));
  i.signature = forged.signature;
  await assert.rejects(() => validateIntent(i, MEMBER_CTX), /SIG_MISMATCH/);
});

test('non-member rejected (NOT_MEMBER)', async () => {
  const i = await signedIntent();
  await assert.rejects(() => validateIntent(i, { ...MEMBER_CTX, hasMembership: async () => false }), /NOT_MEMBER/);
});

function signedIntentSync(overrides = {}, signer = WALLET) {
  const base = { marketId: 'PM-001', side: 'for', amount: 50, nonce: 1, deadline: Math.floor(Date.now() / 1000) + 3600 };
  return { ...base, ...overrides, address: signer.address, signature: '0x' + 'ab'.repeat(65) };
}

test('below 10-Aura floor rejected at shape check (D9)', () => {
  assert.throws(() => validateIntentShape(signedIntentSync({ amount: 9 })), /FLOOR/);
  assert.strictEqual(MIN_STAKE, 10);
});

test('stale deadline rejected (DEADLINE)', () => {
  assert.throws(() => validateIntentShape(signedIntentSync({ deadline: Math.floor(Date.now() / 1000) - 10 })), /DEADLINE/);
});

test('closed market rejected (MARKET_CLOSED)', async () => {
  const iM = await signedIntent();
  await assert.rejects(() => validateIntent(iM, { ...MEMBER_CTX, marketStakeable: async () => false }), /MARKET_CLOSED/);
});

test('batch re-validation: overdraw / replay / side-dup', () => {
  // minimal state: WALLET minted 100 Aura
  const events = [{ seq: 1, type: 'mint', address: WALLET.address, amount: 100, ts: '2026-11-16T00:00:00Z', note: null, prev_hash: '0x' + '0'.repeat(64), hash: eventHash({ seq: 1, type: 'mint', address: WALLET.address, amount: 100, ts: '2026-11-16T00:00:00Z' }) }];
  const state = replay(events);
  const processed = new Set();
  const firstKey = WALLET.address.toLowerCase() + ':PM-001';
  assert.doesNotThrow(() => validateForBatch({ address: WALLET.address.toLowerCase(), marketId: 'PM-001', amount: 50, side: 'for' }, state, processed));
  processed.add(firstKey); // the batch adds accepted keys after writing the lock event
  // replay: same address+market again
  assert.throws(() => validateForBatch({ address: WALLET.address.toLowerCase(), marketId: 'PM-001', amount: 10, side: 'for' }, state, processed), /REPLAY/);
  // side-dup: other market already locked
  const state2 = replay([...events, { seq: 2, type: 'lock', address: WALLET.address, amount: 10, market: 'PM-002', side: 'for', ts: '2026-11-16T00:01:00Z', note: null, prev_hash: events[0].hash, hash: eventHash({ seq: 2, type: 'lock', address: WALLET.address, amount: 10, market: 'PM-002', side: 'for', ts: '2026-11-16T00:01:00Z' }) }]);
  assert.throws(() => validateForBatch({ address: WALLET.address.toLowerCase(), marketId: 'PM-002', amount: 10, side: 'for' }, state2, new Set()), /SIDE_DUP/);
  // overdraw: 101 > 100
  assert.throws(() => validateForBatch({ address: WALLET.address.toLowerCase(), marketId: 'PM-003', amount: 101, side: 'for' }, state, new Set()), /OVERDRAW/);
});

test('operator key round-trip: batch lock event signature verifies (ed25519)', () => {
  // simulate what batch.js does, with a throwaway key (NOT the real operator key)
  const { generateKeyPairSync, sign: edSign, verify: edVerify, createPublicKey } = require('crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const ev = { seq: 1, type: 'lock', address: WALLET.address, amount: 50, market: 'PM-001', side: 'for', ts: '2026-11-16T00:00:00Z', note: 'batch lock', prev_hash: '0x' + '0'.repeat(64) };
  validateEvent(ev);
  ev.hash = eventHash(ev);
  ev.sig = '0x' + edSign(null, Buffer.from(ev.hash.slice(2), 'hex'), privateKey).toString('hex');
  const ok = edVerify(null, Buffer.from(ev.hash.slice(2), 'hex'), publicKey, Buffer.from(ev.sig.slice(2), 'hex'));
  assert.strictEqual(ok, true);
});

test('endpoint handler e2e (local inbox + mock RPC): 405 / bad JSON / floor 400 / 201 stored / 409 replay', async () => {
  const handler = require('../../docs/api/intent.js');
  const inbox = fs.mkdtempSync(path.join(os.tmpdir(), 'freedam-intents-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freedam-data-'));
  const markets = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/data/markets.json'), 'utf8'));
  markets.markets.find(m => m.id === 'PM-001').state = 'open';
  fs.writeFileSync(path.join(dataDir, 'markets.json'), JSON.stringify(markets));

  // mock JSON-RPC: hasMembership(member) → true (eth_call)
  const http = require('http');
  const rpc = http.createServer((rq, rs) => {
    let b = '';
    rq.on('data', c => b += c);
    rq.on('end', () => {
      rs.setHeader('content-type', 'application/json');
      const replies = [];
      for (const req of [].concat(JSON.parse(b))) {
        if (req.method === 'eth_chainId') {
          replies.push({ jsonrpc: '2.0', id: req.id, result: '0x8274f' }); // OP Sepolia
        } else if (req.method === 'eth_call') {
          // decode the 32-byte address arg from the calldata; member = test wallet
          const arg = '0x' + req.params[0].data.slice(-40);
          const isMember = arg.toLowerCase() === WALLET.address.toLowerCase();
          const word = '0x' + '0'.repeat(63) + (isMember ? '1' : '0');
          replies.push({ jsonrpc: '2.0', id: req.id, result: word });
        } else {
          replies.push({ jsonrpc: '2.0', id: req.id, result: '0x' });
        }
      }
      rs.end(JSON.stringify([].concat(JSON.parse(b)).length === 1 ? replies[0] : replies));
    });
  });
  await new Promise(r => rpc.listen(0, '127.0.0.1', r));
  process.env.MEMBER_RPC_URL = 'http://127.0.0.1:' + rpc.address().port;
  process.env.INTENT_INBOX_DIR = inbox;
  process.env.DATA_DIR = dataDir;

  function fakeRes() {
    return { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  }
  function fakeReq(method, body) {
    return { method, async *[Symbol.asyncIterator]() { if (body != null) yield body; } };
  }
  let res = fakeRes(); await handler(fakeReq('GET'), res);
  assert.strictEqual(res.statusCode, 405);
  res = fakeRes(); await handler(fakeReq('POST', 'not-json'), res);
  assert.strictEqual(res.statusCode, 400);
  res = fakeRes(); await handler(fakeReq('POST', JSON.stringify(signedIntentSync({ amount: 5 }))), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(JSON.parse(res.body).error, 'FLOOR');

  // full path: real EIP-712 sig, member, open market → 201, file stored
  const intent = await signedIntent();
  res = fakeRes(); await handler(fakeReq('POST', JSON.stringify(intent)), res);
  assert.strictEqual(res.statusCode, 201, res.body);
  const stored = fs.readdirSync(inbox);
  assert.strictEqual(stored.length, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(inbox, stored[0]), 'utf8')).amount, intent.amount);

  // replay: same address+market+nonce → 409
  res = fakeRes(); await handler(fakeReq('POST', JSON.stringify(intent)), res);
  assert.strictEqual(res.statusCode, 409, res.body);

  rpc.close();
  fs.rmSync(inbox, { recursive: true, force: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.INTENT_INBOX_DIR; delete process.env.DATA_DIR; delete process.env.MEMBER_RPC_URL;
});
