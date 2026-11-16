'use strict';
/* Increment 4 receipt — resolution payouts, leaderboard, Merkle seal (offline). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { merkleRoot, rootForEvents } = require('../lib/merkle');
const { buildLeaderboard } = require('../lib/leaderboard');
const { replay } = require('../lib/replay');

const REPO = path.join(__dirname, '..', '..');
const A = '0x' + 'aa'.repeat(20);
const B = '0x' + 'bb'.repeat(20);
const C = '0x' + 'cc'.repeat(20);
const T = '0x' + 'dd'.repeat(20);

test('merkle root: deterministic, odd counts handled, changes on edit', () => {
  const h = (i) => '0x' + crypto.createHash('sha256').update(String(i)).digest('hex');
  assert.strictEqual(merkleRoot([h(1), h(2)]), merkleRoot([h(1), h(2)]));
  assert.notStrictEqual(merkleRoot([h(1)]), merkleRoot([h(1), h(2)]));
  assert.notStrictEqual(merkleRoot([h(1), h(2), h(3)]), merkleRoot([h(1), h(2), h(4)]));
  assert.strictEqual(merkleRoot([]), '0x' + '0'.repeat(64));
});

test('leaderboard: ranked by correct calls, accuracy hidden <3 calls, COI flagged', () => {
  const mk = (seq, type, addr, amount, market, side, ts) =>
    ({ seq, type, address: addr, amount, market, side, ts, note: null });
  const chain = [
    mk(1, 'mint', A, 1000, null, null, '2026-11-01T00:00:00Z'),
    mk(2, 'lock', A, 100, 'PM-001', 'for', '2026-11-01T01:00:00Z'),
    mk(3, 'resolve_win', A, 150, 'PM-001', 'for', '2026-11-02T00:00:00Z'), // correct call
    mk(4, 'mint', B, 500, null, null, '2026-11-01T00:00:00Z'),
    mk(5, 'lock', B, 50, 'PM-001', 'against', '2026-11-01T02:00:00Z'),
    mk(6, 'resolve_lose', B, 0, 'PM-001', 'against', '2026-11-02T00:00:00Z'), // wrong call
    mk(7, 'lock', A, 10, 'PM-002', 'for', '2026-11-03T00:00:00Z'),
    mk(8, 'resolve_lose', A, 0, 'PM-002', 'for', '2026-11-04T00:00:00Z') // A wrong on PM-002
  ];
  const rows = buildLeaderboard(chain, { coiFlags: new Set([A.toLowerCase()]), memberNumbers: new Map([[A.toLowerCase(), 3]]) });
  const a = rows.find(r => r.address === A.toLowerCase());
  const b = rows.find(r => r.address === B.toLowerCase());
  assert.ok(a.rank < b.rank, 'A (1 correct) ranks above B (0 correct)');
  assert.strictEqual(a.correct_calls, 1);
  assert.strictEqual(a.calls, 2);
  assert.strictEqual(a.accuracy, null, 'accuracy hidden until 3+ calls');
  assert.strictEqual(a.member_number, 3);
  assert.strictEqual(a.coi_flagged, true);
});

test('resolution e2e (sandbox ledger): mint → locks → resolve → exact 75/20/5 events + balances', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-resolve-'));
  const ledgerDir = path.join(tmp, 'ledger');
  fs.mkdirSync(ledgerDir);
  const sealEnvBackup = process.env.FREEDAM_SEAL_TEST; // unused; keep env clean
  // sandbox chain: A stakes 100 FOR, B stakes 60 AGAINST on PM-001; L=60 → share 45, treasury 12, dust 3
  function ev(fields) { return fields; }
  const events = [
    ev({ seq: 1, type: 'mint', address: A, amount: 1000, ts: '2026-11-01T00:00:00Z', note: 'seed' }),
    ev({ seq: 2, type: 'mint', address: B, amount: 500, ts: '2026-11-01T00:00:00Z', note: 'seed' }),
    ev({ seq: 3, type: 'lock', address: A, amount: 100, market: 'PM-001', side: 'for', ts: '2026-11-01T01:00:00Z', note: null }),
    ev({ seq: 4, type: 'lock', address: B, amount: 60, market: 'PM-001', side: 'against', ts: '2026-11-01T02:00:00Z', note: null })
  ];
  // hash-chain them like batch.js would
  let prev = '0x' + '0'.repeat(64);
  for (const e of events) {
    e.prev_hash = prev;
    e.hash = '0x' + crypto.createHash('sha256').update(JSON.stringify({
      seq: e.seq, type: e.type, address: e.address, amount: e.amount,
      market: e.market ?? null, side: e.side ?? null, ts: e.ts, note: e.note ?? null
    })).digest('hex');
    prev = e.hash;
  }
  fs.writeFileSync(path.join(ledgerDir, 'events.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n');

  const out = execFileSync('node', ['ledger/resolve.js', 'PM-001', '--outcome', 'yes', '--source', 'https://congress.gov/example'], {
    cwd: REPO, env: { ...process.env, LEDGER_DIR: ledgerDir }, encoding: 'utf8'
  });
  assert.match(out, /PM-001 → YES/);

  const resolved = fs.readFileSync(path.join(ledgerDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const state = replay(resolved); // throws if the chain is broken or a rule is violated
  assert.strictEqual(state.balances.get(A.toLowerCase()), 1000 - 100 + 145); // principal + 75% share
  assert.strictEqual(state.balances.get(B.toLowerCase()), 440); // slashed, nothing returned
  assert.strictEqual(state.balances.get(T.toLowerCase()), undefined, 'no treasury addr passed → nothing minted');
  assert.strictEqual(state.totals.locked_aura, 0);
  assert.strictEqual(state.totals.slashed, 60);
  const types = resolved.slice(4).map(e => e.type);
  assert.deepStrictEqual(types, ['resolve_win', 'resolve_lose']);
  // every resolution event is operator-signed
  assert.ok(resolved.slice(4).every(e => /^0x[0-9a-f]{128}$/.test(e.sig)));

  // refund path: a dead market returns everything
  fs.writeFileSync(path.join(ledgerDir, 'events.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n');
  const out2 = execFileSync('node', ['ledger/resolve.js', 'PM-001', '--outcome', 'unresolved', '--source', 'https://congress.gov/example'], {
    cwd: REPO, env: { ...process.env, LEDGER_DIR: ledgerDir }, encoding: 'utf8'
  });
  assert.match(out2, /fully refunded/);
  const refunded = fs.readFileSync(path.join(ledgerDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const s2 = replay(refunded);
  assert.strictEqual(s2.balances.get(A.toLowerCase()), 1000);
  assert.strictEqual(s2.balances.get(B.toLowerCase()), 500);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('seal: root recomputed from events.jsonl matches posted root; --all verifies', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-seal-'));
  const ledgerDir = path.join(tmp, 'ledger');
  fs.mkdirSync(ledgerDir);
  // 3 events (odd count exercises duplicate-last)
  const events = [];
  let prev = '0x' + '0'.repeat(64);
  [1, 2, 3].forEach(i => {
    const e = { seq: i, type: 'mint', address: A, amount: 10 * i, ts: `2026-11-0${i}T00:00:00Z`, note: null, prev_hash: prev };
    e.hash = '0x' + crypto.createHash('sha256').update(JSON.stringify({
      seq: e.seq, type: e.type, address: e.address, amount: e.amount,
      market: null, side: null, ts: e.ts, note: null
    })).digest('hex');
    prev = e.hash;
    events.push(e);
  });
  fs.writeFileSync(path.join(ledgerDir, 'events.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n');
  const expectedRoot = rootForEvents(events);
  // post the seal (dry-run prints the root; emulate the seals.jsonl record)
  fs.writeFileSync(path.join(ledgerDir, 'seals.jsonl'), JSON.stringify({ month: '2026-11', root: expectedRoot, event_count: 3, last_seq: 3, tx_hash: '0x' + 'ab'.repeat(32), seal_address: T, ts: '2026-11-16T00:00:00Z' }) + '\n');
  const out = execFileSync('node', ['ledger/verify_seal.js', '--all'], {
    cwd: REPO, env: { ...process.env, LEDGER_DIR: ledgerDir }, encoding: 'utf8'
  });
  assert.match(out, /all 1 seal\(s\) verify ✓/);
  // tamper: change an amount AND recompute the chain hashes consistently (as a real
  // attacker would) — the seal must still break, because the root over the new hashes differs
  const tampered = events.map(e => e.seq === 2 ? { ...e, amount: 999 } : e);
  let prevHash = '0x' + '0'.repeat(64);
  for (const e of tampered) {
    e.prev_hash = prevHash;
    e.hash = '0x' + crypto.createHash('sha256').update(JSON.stringify({
      seq: e.seq, type: e.type, address: e.address, amount: e.amount,
      market: e.market ?? null, side: e.side ?? null, ts: e.ts, note: e.note ?? null
    })).digest('hex');
    prevHash = e.hash;
  }
  fs.writeFileSync(path.join(ledgerDir, 'events.jsonl'), tampered.map(e => JSON.stringify(e)).join('\n') + '\n');
  let failed = false;
  try {
    execFileSync('node', ['ledger/verify_seal.js', '--all'], { cwd: REPO, env: { ...process.env, LEDGER_DIR: ledgerDir }, encoding: 'utf8', stdio: 'pipe' });
  } catch { failed = true; }
  assert.ok(failed, 'tampered events must break the seal');
  fs.rmSync(tmp, { recursive: true, force: true });
});
