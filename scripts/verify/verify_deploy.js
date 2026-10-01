// Post-deploy verification against live OP Sepolia — read-only, no key needed.
const path = require('path');
const repo = path.join(process.env.HOME, 'Developer/DAOv.01');
const { ethers } = require(path.join(repo, 'node_modules/ethers'));
const abi = require(path.join(repo, 'artifacts/contracts/src/FREEDAMMembership.sol/FREEDAMMembership.json')).abi;
const addr = '0x9af71751842C9fcE04e8f10473DDa43A8f9409B7';

(async () => {
  const provider = new ethers.JsonRpcProvider('https://sepolia.optimism.io', 11155420);
  const c = new ethers.Contract(addr, abi, provider);
  const [owner, total, iface] = await Promise.all([
    c.owner(),
    c.totalMembers(),
    Promise.resolve(new ethers.Interface(abi)),
  ]);
  console.log('owner():', owner);
  console.log('totalMembers():', total.toString());
  console.log('totalMembers selector:', iface.getFunction('totalMembers').selector);
})().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
