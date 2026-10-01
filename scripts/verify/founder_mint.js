// Founder mint on OP Sepolia — uses PRIVATE_KEY from ~/.freedam-secrets/.env
// Calls founderMint() on FREEDAMMembership, then verifies membership state.
const fs = require('fs');
const os = require('os');
const path = require('path');
const repo = path.join(os.homedir(), 'Developer/DAOv.01');
const { ethers } = require(path.join(repo, 'node_modules/ethers'));
const abi = require(path.join(repo, 'artifacts/contracts/src/FREEDAMMembership.sol/FREEDAMMembership.json')).abi;
const addr = '0x9af71751842C9fcE04e8f10473DDa43A8f9409B7';

const env = fs.readFileSync(path.join(os.homedir(), '.freedam-secrets/.env'), 'utf8');
const m = env.match(/^PRIVATE_KEY=(.+)$/m);
if (!m) { console.error('no PRIVATE_KEY'); process.exit(1); }
const raw = m[1].trim();
const pk = raw.startsWith('0x') ? raw : '0x' + raw;

(async () => {
  const provider = new ethers.JsonRpcProvider('https://sepolia.optimism.io', 11155420);
  const wallet = new ethers.Wallet(pk, provider);
  const c = new ethers.Contract(addr, abi, wallet);

  console.log('Founder mint from:', wallet.address);

  const tx = await c.founderMint();
  console.log('Tx hash:', tx.hash);
  const receipt = await tx.wait();
  console.log('Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED', '| gas used:', receipt.gasUsed.toString());

  // verify
  const [total, has, tier, num] = await Promise.all([
    c.totalMembers(),
    c.hasMembership(wallet.address),
    c.getTier(wallet.address),
    c.getMemberNumber(wallet.address),
  ]);
  console.log('totalMembers():', total.toString());
  console.log('hasMembership:', has);
  console.log('tier:', tier.toString());
  console.log('member number:', num.toString());
})().catch(e => { console.error('MINT FAILED:', e.message); process.exit(1); });
