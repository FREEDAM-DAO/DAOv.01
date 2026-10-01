/**
 * verify_local.js — End-to-end check that generate.js output works against the
 * real FREEDAMMembership contract (OpenZeppelin MerkleProof.verify).
 *
 * Run: npx hardhat run scripts/allowlist/verify_local.js
 * (uses the in-memory Hardhat network; touches nothing live)
 *
 * Deploys the contract, builds an allowlist from the first 5 Hardhat accounts,
 * sets the root, then proves:
 *   1. an allowlisted address CAN mint with its generated proof
 *   2. a non-allowlisted address is REJECTED
 *   3. open-mint mode (root = 0) works with an empty proof
 */
const { ethers } = require('hardhat');
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const accounts = await ethers.getSigners();
  const allowed = accounts.slice(1, 6);          // 5 allowlisted (account 0 = owner)
  const outsider = accounts[7];                   // not allowlisted

  // 1. Generate allowlist file with the real generator script
  const tmp = path.join(os.tmpdir(), `freedam-allowlist-${Date.now()}.txt`);
  const outFile = tmp + '.json';
  fs.writeFileSync(tmp, allowed.map(a => a.address).join('\n') + '\n');
  execFileSync('node', [path.join(__dirname, 'generate.js'), tmp, '--out', outFile]);
  const { root, proofs } = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  fs.unlinkSync(tmp); fs.unlinkSync(outFile);

  // 2. Deploy contract
  const Factory = await ethers.getContractFactory('FREEDAMMembership');
  const [owner] = accounts;
  const c = await Factory.deploy(owner.address);
  await c.waitForDeployment();
  await c.founderMint(); // owner = Member #1

  // 3. Set allowlist root
  await (await c.setMerkleRoot(root)).wait();
  assert.equal(await c.merkleRoot(), root, 'root not stored');
  console.log('✓ Root set on local contract');

  // 4. Allowlisted address mints with generated proof
  const first = allowed[0];
  const proof = proofs[first.address.toLowerCase()];
  const min = await c.MEMBER_MINIMUM();
  await (await c.connect(first).mintWithDonation(proof, { value: min })).wait();
  assert.equal(await c.hasMembership(first.address), true, 'allowed mint failed');
  assert.equal((await c.getMemberNumber(first.address)).toString(), '2');
  console.log(`✓ Allowlisted ${first.address.slice(0, 8)}… minted as Member #2 with generated proof`);

  // 5. Leader tier via bigger donation
  const second = allowed[1];
  const leaderAmt = await c.LEADER_THRESHOLD();
  await (await c.connect(second).mintWithDonation(proofs[second.address.toLowerCase()], { value: leaderAmt })).wait();
  assert.equal(await c.getTier(second.address), 1, 'leader tier wrong'); // 1 = Leader
  console.log(`✓ Allowlisted ${second.address.slice(0, 8)}… minted as Leader (Member #3)`);

  // 6. Outsider rejected
  await assert.rejects(
    () => c.connect(outsider).mintWithDonation([], { value: min }),
    /NotAllowlisted/,
    'outsider was not rejected!'
  );
  console.log(`✓ Non-allowlisted ${outsider.address.slice(0, 8)}… correctly rejected`);

  // 7. Open mint mode still works with empty proof
  await (await c.setMerkleRoot(ethers.ZeroHash)).wait();
  await (await c.connect(outsider).mintWithDonation([], { value: min })).wait();
  assert.equal(await c.hasMembership(outsider.address), true);
  console.log('✓ Open-mint mode (root = 0) works with empty proof');

  // 8. Last allowlisted member (odd-node path coverage when count is odd)
  const last = allowed[allowed.length - 1];
  await (await c.setMerkleRoot(root)).wait();
  await (await c.connect(last).mintWithDonation(proofs[last.address.toLowerCase()], { value: min })).wait();
  assert.equal(await c.hasMembership(last.address), true);
  console.log(`✓ Last leaf ${last.address.slice(0, 8)}… (odd-count edge) minted fine`);

  console.log('\nALL VERIFIED — generate.js output is contract-compatible.');
}

main().catch(e => { console.error(e); process.exit(1); });
