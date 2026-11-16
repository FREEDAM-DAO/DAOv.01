#!/usr/bin/env node
/*
 * scripts/operator/fund-seal.js — one-time helper: send a small amount of OP Sepolia ETH
 * from the deploy wallet to the seal address (SEAL_ADDRESS in ~/.freedam-secrets/seal.env)
 * so it can pay gas for the monthly 0-ETH-value seal transactions. Testnet only.
 * Keys are read from ~/.freedam-secrets/ and never printed.
 *
 * Usage: node scripts/operator/fund-seal.js [amount-eth=0.05]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// minimal .env loader (dotenv may not be installed everywhere)
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnv(path.join(os.homedir(), '.freedam-secrets', '.env'));

(async () => {
  const { ethers } = require('ethers');
  const sealEnv = Object.fromEntries(fs.readFileSync(path.join(os.homedir(), '.freedam-secrets', 'seal.env'), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => l.split('=')));
  const pk = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!pk) { console.error('no deploy key var (DEPLOYER_PRIVATE_KEY/PRIVATE_KEY) in ~/.freedam-secrets/.env'); process.exit(1); }
  const deployer = new ethers.Wallet(pk, new ethers.JsonRpcProvider('https://optimism-sepolia.publicnode.com'));
  const amount = argAmount();
  function argAmount() {
    const a = process.argv[2];
    return a && !a.startsWith('-') ? ethers.parseEther(a) : ethers.parseEther('0.05');
  }
  const tx = await deployer.sendTransaction({ to: sealEnv.SEAL_ADDRESS, value: amount });
  const r = await tx.wait();
  console.log('funded ' + sealEnv.SEAL_ADDRESS + ' with ' + ethers.formatEther(amount) + ' ETH — tx ' + r.hash);
})().catch(e => { console.error('funding failed:', e.message); process.exit(1); });
