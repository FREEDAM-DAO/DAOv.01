#!/usr/bin/env node
/**
 * set_root.js — Owner sets the Merkle allowlist root on FREEDAMMembership.
 *
 * Usage:
 *   node scripts/allowlist/set_root.js <root-from-generate.js>          # set allowlist
 *   node scripts/allowlist/set_root.js 0x000...000                      # open mint (64 zeros)
 *
 * Reads PRIVATE_KEY from environment or ~/.freedam-secrets/.env (never printed).
 * Defaults to Optimism Sepolia (RPC_URL overridable). Run verify_local.js first
 * if you changed the generator.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ethers } = require('ethers');

const CONTRACT = '0xB0b2C09E89b4D615fF8FF41CF21E556DA94c3728';
const RPC = process.env.RPC_URL || 'https://sepolia.optimism.io';

function loadKey() {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY.trim();
  const f = path.join(os.homedir(), '.freedam-secrets', '.env');
  if (fs.existsSync(f)) {
    const m = fs.readFileSync(f, 'utf8').match(/^\s*PRIVATE_KEY\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('No PRIVATE_KEY found in env or ~/.freedam-secrets/.env');
}

async function main() {
  const root = process.argv[2];
  if (!root || !/^0x[0-9a-fA-F]{64}$/.test(root)) {
    console.error('Usage: node scripts/allowlist/set_root.js <bytes32-root>');
    process.exit(1);
  }
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(loadKey(), provider);
  const c = new ethers.Contract(CONTRACT, [
    'function setMerkleRoot(bytes32 root)',
    'function merkleRoot() view returns (bytes32)',
    'function owner() view returns (address)'
  ], wallet);

  const owner = await c.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error('Loaded key is not the contract owner — refusing to send.');
  }
  console.log(`Owner verified: ${wallet.address}`);
  console.log(`Current root:   ${await c.merkleRoot()}`);
  console.log(`Setting root:   ${root}`);
  const tx = await c.setMerkleRoot(root);
  console.log(`Tx sent: ${tx.hash}`);
  await tx.wait();
  console.log(`Confirmed. On-chain root is now: ${await c.merkleRoot()}`);
  console.log(root === ethers.ZeroHash ? 'Mint is OPEN to everyone.' : 'Mint is INVITE-ONLY (allowlist active).');
}

main().catch(e => { console.error('FAILED:', e.shortMessage || e.message); process.exit(1); });
