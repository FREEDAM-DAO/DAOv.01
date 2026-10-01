#!/usr/bin/env node
/**
 * generate.js — Build a Merkle allowlist for FREEDAMMembership.
 *
 * Usage:
 *   node scripts/allowlist/generate.js <addresses-file> [--out docs/mint/proofs.json]
 *
 * Input file: one Ethereum address per line (# comments and blank lines ignored).
 * Output JSON: { "root": "0x..", "generated": "<date>", "proofs": { "<address>": ["0x..", ...] } }
 *
 * Leaf encoding matches the contract: keccak256(abi.encodePacked(address)).
 * Tree construction matches OpenZeppelin MerkleProof (sorted-pair hashing).
 *
 * The root is what the owner passes to setMerkleRoot() (see set_root.js).
 * The proofs file is published at docs/mint/proofs.json so the mint page can
 * auto-fill each pilot member's proof. It reveals only addresses that are
 * already public on-chain once they mint — no secret data.
 */
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

function sortedPairHash(a, b) {
  const [x, y] = [a, b].sort((p, q) => (BigInt(p) < BigInt(q) ? -1 : 1));
  return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [x, y]);
}

function buildTree(leaves) {
  // leaves: array of bytes32 hex strings; returns { layers }
  let layer = leaves.slice();
  const layers = [layer];
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 === layer.length) next.push(layer[i]); // odd node promoted
      else next.push(sortedPairHash(layer[i], layer[i + 1]));
    }
    layer = next;
    layers.push(layer);
  }
  return layers;
}

function getProof(layers, index) {
  const proof = [];
  let i = index;
  for (let l = 0; l < layers.length - 1; l++) {
    const layer = layers[l];
    const isRight = i % 2 === 1;
    const sib = isRight ? i - 1 : i + 1;
    if (sib < layer.length) proof.push(layer[sib]);
    i = Math.floor(i / 2);
  }
  return proof;
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node scripts/allowlist/generate.js <addresses-file> [--out docs/mint/proofs.json]');
    process.exit(1);
  }
  const inFile = args[0];
  const outIdx = args.indexOf('--out');
  const outFile = outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, '..', '..', 'docs', 'mint', 'proofs.json');

  const addresses = fs.readFileSync(inFile, 'utf8')
    .split('\n')
    .map(s => s.split('#')[0].trim())
    .filter(Boolean)
    .map(s => {
      const a = ethers.getAddress(s); // validates + checksums
      return a;
    });

  const unique = [...new Set(addresses.map(a => a.toLowerCase()))];
  if (unique.length !== addresses.length) {
    console.error(`Warning: ${addresses.length - unique.length} duplicate address(es) removed.`);
  }
  if (!unique.length) { console.error('No addresses found.'); process.exit(1); }

  const canon = unique.map(a => ethers.getAddress(a)); // checksummed, deduped
  // Leaf encoding MUST match the contract: keccak256(abi.encode(address))
  // (32-byte left-padded, per security fix 9e20a97 — NOT abi.encodePacked)
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const leaves = canon.map(a => ethers.keccak256(coder.encode(['address'], [a])));
  const layers = buildTree(leaves);
  const root = layers[layers.length - 1][0];

  const proofs = {};
  canon.forEach((addr, i) => { proofs[addr.toLowerCase()] = getProof(layers, i); });

  const out = { root, generated: new Date().toISOString(), count: canon.length, proofs };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));

  console.log(`Allowlist built: ${canon.length} address(es)`);
  console.log(`Merkle root: ${root}`);
  console.log(`Proofs written to: ${outFile}`);
  console.log('');
  console.log('Next: owner sets the root on-chain with scripts/allowlist/set_root.js');
}

main();
