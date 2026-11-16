#!/usr/bin/env node
/*
 * scripts/operator/gen-seal-key.js — one-time setup for the dedicated seal key.
 * The monthly Merkle seal posts a 0-ETH self-send tx on OP Sepolia; that needs an
 * Ethereum (secp256k1) key, which is a THIRD key: deploy key, ledger (ed25519) key,
 * seal key — a leak of any one doesn't compromise the others (SPEC §2.2, §7).
 *
 * Writes ~/.freedam-secrets/seal.env (chmod 600):
 *   SEAL_PRIV_KEY=<hex private key>   NEVER printed to stdout
 *   SEAL_ADDRESS=<hex address>        published on the ledger page next to the operator key
 *
 * Refuses to overwrite unless --force. Fund the address with a little OP Sepolia ETH
 * (a seal tx costs a few hundred gwei of gas, 0 ETH value).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const SEAL_ENV = path.join(os.homedir(), '.freedam-secrets', 'seal.env');

if (fs.existsSync(SEAL_ENV) && !process.argv.includes('--force')) {
  const env = Object.fromEntries(fs.readFileSync(SEAL_ENV, 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=')));
  console.error('seal.env already exists — refusing to overwrite (use --force only for deliberate rotation).');
  console.error('Published seal address for this key: ' + env.SEAL_ADDRESS);
  process.exit(1);
}
fs.mkdirSync(path.dirname(SEAL_ENV), { recursive: true });

const { ethers } = require('ethers');
const wallet = ethers.Wallet.createRandom();
fs.writeFileSync(SEAL_ENV, `# FREEDAM ledger seal key (Ethereum, OP Sepolia) — created ${new Date().toISOString()}\n# PRIVATE: never print, never commit. Fund with a little testnet ETH to cover seal gas (0 ETH value txs).\nSEAL_PRIV_KEY=${wallet.privateKey}\nSEAL_ADDRESS=${wallet.address}\n`);
fs.chmodSync(SEAL_ENV, 0o600);
console.log('wrote ' + SEAL_ENV + ' (chmod 600)');
console.log('SEAL_ADDRESS=' + wallet.address + '   ← fund with OP Sepolia ETH, then publish this on the ledger page');
