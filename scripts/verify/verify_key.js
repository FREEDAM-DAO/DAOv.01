// Reads PRIVATE_KEY from ~/.freedam-secrets/.env and prints ONLY the derived
// wallet address. The key itself never leaves memory / never gets printed.
const fs = require('fs');
const os = require('os');
const path = require('path');

const envPath = path.join(os.homedir(), '.freedam-secrets', '.env');
const content = fs.readFileSync(envPath, 'utf8');
const match = content.match(/^PRIVATE_KEY=(.+)$/m);
if (!match) { console.error('PRIVATE_KEY not found in .env'); process.exit(1); }

const raw = match[1].trim();
// ethers accepts both 0x-prefixed and raw hex
const normalized = raw.startsWith('0x') ? raw : '0x' + raw;

const { Wallet } = require(path.join(os.homedir(), 'Developer/DAOv.01/node_modules/ethers'));
try {
  const wallet = new Wallet(normalized);
  console.log('Derived address:', wallet.address);
} catch (e) {
  console.error('Key failed to load:', e.message);
  process.exit(2);
}
