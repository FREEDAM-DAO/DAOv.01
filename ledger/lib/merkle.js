/*
 * Merkle seal — tamper-evident monthly checkpoint over the event chain (SPEC §7).
 * Root over the event hashes in seq order (binary Merkle, duplicate-last on odd levels).
 * No new contract: the root is posted as calldata in a 0-value self-send on OP Sepolia.
 */
'use strict';

const crypto = require('crypto');

function merkleRoot(hashes) {
  if (hashes.length === 0) return '0x' + '0'.repeat(64);
  let level = hashes.map(h => Buffer.from(h.replace(/^0x/, ''), 'hex'));
  while (level.length > 1) {
    if (level.length % 2 === 1) level.push(level[level.length - 1]); // duplicate-last on odd
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(crypto.createHash('sha256').update(Buffer.concat([level[i], level[i + 1]])).digest());
    }
    level = next;
  }
  return '0x' + level[0].toString('hex');
}

function rootForEvents(events) {
  return merkleRoot(events.map(e => e.hash).filter(Boolean));
}

module.exports = { merkleRoot, rootForEvents };
