#!/usr/bin/env node
/*
 * scripts/operator/gen-ledger-key.js — one-time setup for the dedicated ledger-operator
 * key (SPEC §2.2: separate from the deploy key so one leak doesn't compromise the other).
 *
 * Writes ~/.freedam-secrets/ledger.env (chmod 600):
 *   LEDGER_PRIV_KEY_B64=<ed25519 private key, base64>   NEVER printed to stdout
 *   LEDGER_PUB_KEY=<ed25519 public key, hex>            published on the ledger page
 *
 * Refuses to overwrite an existing key unless --force (rotation = explicit act).
 * The private key never touches chat, git, or stdout.
 */
'use strict';

const fs = require('fs');
const path = require('os').homedir() + '/.freedam-secrets/ledger.env';

if (fs.existsSync(path) && !process.argv.includes('--force')) {
  const env = fs.readFileSync(path, 'utf8');
  const pub = /LEDGER_PUB_KEY=([0-9a-f]+)/.exec(env);
  console.error('ledger.env already exists — refusing to overwrite (use --force only for deliberate rotation).');
  console.error('Published operator address for this key: ' + (pub ? pub[1] : '(pub key line missing)'));
  process.exit(1);
}
fs.mkdirSync(require('path').dirname(path), { recursive: true });

const { generateKeyPairSync } = require('crypto');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const privB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const pubHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');

fs.writeFileSync(path, `# FREEDAM Aura ledger operator key (ed25519) — created ${new Date().toISOString()}\n# PRIVATE: never print, never commit. Rotation: run with --force, then announce the new LEDGER_PUB_KEY.\nLEDGER_PRIV_KEY_B64=${privB64}\nLEDGER_PUB_KEY=${pubHex}\n`);
fs.chmodSync(path, 0o600);
console.log('wrote ' + path + ' (chmod 600)');
console.log('LEDGER_PUB_KEY=' + pubHex + '   ← publish this on the ledger page');
