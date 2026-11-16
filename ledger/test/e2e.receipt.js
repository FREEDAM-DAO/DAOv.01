/* End-to-end increment 3 receipt: signed intent → endpoint → inbox → Sunday batch → lock event on ledger. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Wallet } = require('ethers');
const http = require('http');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-e2e-'));
  const inbox = path.join(tmp, 'inbox');
  const ledgerDir = path.join(tmp, 'ledger');
  const dataDir = path.join(tmp, 'data');
  fs.mkdirSync(inbox); fs.mkdirSync(ledgerDir); fs.mkdirSync(dataDir);

  // 1. sandbox market marked OPEN
  const markets = JSON.parse(fs.readFileSync('docs/data/markets.json', 'utf8'));
  markets.markets.find(m => m.id === 'PM-001').state = 'open';
  fs.writeFileSync(path.join(dataDir, 'markets.json'), JSON.stringify(markets));

  // 2. seed sandbox ledger: test member minted 200 Aura (operator-signed)
  const { generateKeyPairSync, sign: edSign, createHash } = require('crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const member = new Wallet('0x' + '33'.repeat(32));
  const ZERO = '0x' + '0'.repeat(64);
  function ev(fields, prev) {
    const e = { ...fields, prev_hash: prev };
    e.hash = '0x' + createHash('sha256').update(JSON.stringify({
      seq: e.seq, type: e.type, address: e.address, amount: e.amount,
      market: e.market ?? null, side: e.side ?? null, ts: e.ts, note: e.note ?? null
    })).digest('hex');
    e.sig = '0x' + edSign(null, Buffer.from(e.hash.slice(2), 'hex'), privateKey).toString('hex');
    return e;
  }
  const mint = ev({ seq: 1, type: 'mint', address: member.address, amount: 200, ts: '2026-11-16T00:00:00Z', note: 'seed donation mint' }, ZERO);
  fs.writeFileSync(path.join(ledgerDir, 'events.jsonl'), JSON.stringify(mint) + '\n');

  // 3. mock RPC for hasMembership
  const rpc = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', c => b += c);
    rq.on('end', () => {
      rs.setHeader('content-type', 'application/json');
      const reqs = [].concat(JSON.parse(b));
      const out = reqs.map(req => {
        if (req.method === 'eth_chainId') return { jsonrpc: '2.0', id: req.id, result: '0x8274f' };
        if (req.method === 'eth_call') {
          const arg = '0x' + req.params[0].data.slice(-40);
          const isMember = arg.toLowerCase() === member.address.toLowerCase();
          return { jsonrpc: '2.0', id: req.id, result: '0x' + '0'.repeat(63) + (isMember ? '1' : '0') };
        }
        return { jsonrpc: '2.0', id: req.id, result: '0x' };
      });
      rs.end(JSON.stringify(reqs.length === 1 ? out[0] : out));
    });
  });
  await new Promise(r => rpc.listen(0, '127.0.0.1', r));

  // 4. endpoint: valid intent → 201; a below-floor one → 400
  process.env.MEMBER_RPC_URL = 'http://127.0.0.1:' + rpc.address().port;
  process.env.INTENT_INBOX_DIR = inbox;
  process.env.DATA_DIR = dataDir;
  const handler = require('/Users/bigmovementfoundation/Developer/DAOv.01/docs/api/intent.js');
  const { DOMAIN, TYPES } = require('/Users/bigmovementfoundation/Developer/DAOv.01/ledger/lib/intent.js');
  function mkReq(method, body) { return { method, async *[Symbol.asyncIterator]() { if (body != null) yield body; } }; }
  function mkRes() { return { statusCode: 0, body: '', headers: {}, setHeader(k) {}, end(b) { this.body = b; } }; }
  function mkIntent(o = {}, w = member) {
    const i = { marketId: 'PM-001', side: 'against', amount: 100, nonce: 7, deadline: Math.floor(Date.now() / 1000) + 3600, ...o };
    i.address = w.address;
    i.signature = null; // signed below
    return i;
  }
  async function sign(i, w = member) { i.signature = await w.signTypedData(DOMAIN, TYPES, i); return i; }
  let res = mkRes();
  await handler(mkReq('POST', JSON.stringify(await sign(mkIntent()))), res);
  console.log('POST valid intent   →', res.statusCode, res.body.slice(0, 60));
  const spam = mkIntent({ amount: 5 });
  res = mkRes(); await handler(mkReq('POST', JSON.stringify(await sign(spam))), res);
  console.log('POST below-floor    →', res.statusCode, JSON.parse(res.body).error);
  // 5. an intent from a non-member wallet (RPC says no) → 400 NOT_MEMBER
  const outsider = new Wallet('0x' + '44'.repeat(32));
  res = mkRes(); await handler(mkReq('POST', JSON.stringify(await sign(mkIntent({ nonce: 9 }, outsider), outsider))), res);
  console.log('POST non-member     →', res.statusCode, JSON.parse(res.body).error);

  // 6. Sunday batch over the sandbox ledger
  const { execFileSync } = require('child_process');
  const out = execFileSync('node', ['ledger/batch.js'], { cwd: '/Users/bigmovementfoundation/Developer/DAOv.01', env: { ...process.env, LEDGER_DIR: ledgerDir, INTENT_INBOX_DIR: inbox }, encoding: 'utf8' });
  console.log('--- batch output ---\n' + out.trim());

  // 7. verify the lock event landed and replays clean
  const { replay } = require('/Users/bigmovementfoundation/Developer/DAOv.01/ledger/lib/replay.js');
  const events = fs.readFileSync(path.join(ledgerDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const state = replay(events);
  const lock = events.find(e => e.type === 'lock');
  console.log('--- receipt ---');
  console.log('events:', events.length, 'lock:', !!lock, 'member balance after lock:', state.balances.get(member.address.toLowerCase()));
  console.log('rejections recorded:', fs.readFileSync(path.join(ledgerDir, 'rejections.jsonl'), 'utf8').trim().split('\n').length);
  const ok = lock && state.balances.get(member.address.toLowerCase()) === 100;
  console.log(ok ? 'E2E GREEN' : 'E2E FAILED');
  rpc.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
})();
