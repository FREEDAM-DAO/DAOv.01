# AGENTS.md — FREEDAM DAO Core Repo

Repository for FREEDAM DAO (Free Decentralized Autonomous Movement): Solidity
membership contract (FRDM-ID), tests, and deploy tooling.

## Key facts for any agent working here

- **Network:** Optimism Sepolia testnet (chainId 11155420). Mainnet is a
  separate decision gate — do NOT deploy to mainnet without explicit owner approval.
- **Deployed contract:** `0x9af71751842C9fcE04e8f10473DDa43A8f9409B7`
  (verified on Etherscan). Owner/deployer: `0x3ACb94DB8d968cB35393A72394Ff16460e66919d`
  (Member #1, Founder tier).
- **Deploy secrets:** `~/.freedam-secrets/.env` — contains `PRIVATE_KEY`
  (chmod 600). Never print, copy, or transmit the key. Derive/verify the
  address with `node scripts/verify/verify_key.js` before any on-chain action.
- **Knowledge base:** Obsidian vault at
  `~/Documents/Obsidian Vault/GEN1515` — deploy log is `DAO/DEPLOY_OP_SEPOLIA.md`.
  Record decisions and deploy results there, not in this repo.
- **Verify scripts:** `scripts/verify/` — key check, post-deploy read,
  founder mint, state check. All read-only except founder_mint.js.
- **Tests before deploy:** `npx hardhat test` (currently 49 tests). Do not
  deploy with failing tests.
- **Treasury policy:** testnet = owner-withdraw. Mainnet = Gnosis Safe
  multisig (future work, not implemented).
- **Commits:** use the owner's git identity from repo config; never commit
  private keys or `.env` contents.
