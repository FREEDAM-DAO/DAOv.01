// Read-only state check after founder mint
const path = require('path');
const os = require('os');
const repo = path.join(os.homedir(), 'Developer/DAOv.01');
const { ethers } = require(path.join(repo, 'node_modules/ethers'));
const abi = require(path.join(repo, 'artifacts/contracts/src/FREEDAMMembership.sol/FREEDAMMembership.json')).abi;
const addr = '0x9af71751842C9fcE04e8f10473DDa43A8f9409B7';
const me = '0x3ACb94DB8d968cB35393A72394Ff16460e66919d';

(async () => {
  const provider = new ethers.JsonRpcProvider('https://sepolia.optimism.io', 11155420);
  const c = new ethers.Contract(addr, abi, provider);
  const checks = ['totalMembers', 'hasMembership', 'getTier', 'getMemberNumber', 'balanceOf'];
  for (const fn of checks) {
    try {
      let r;
      if (fn === 'balanceOf') r = await c['balanceOf(address,uint256)'](me, 0);
      else if (fn === 'totalMembers') r = await c[fn]();
      else r = await c[fn](me);
      console.log(fn + ':', r.toString());
    } catch (e) {
      console.log(fn + ': ERROR ->', e.message.slice(0, 120));
    }
  }
})().catch(e => console.error('FAIL:', e.message));
