# FREEDAM DAO — MVP Scope (Refined)

> **Scope discipline:** A DAO that governs 50 people well is more valuable than one that promises millions and ships nothing.
>
> **MVP success metric:** 20 verified members holding FRDM-ID on testnet, 3 community proposals on Snapshot, 1 passed vote.

---

## What's Already Built

| Component | Status | Notes |
|---|---|---|
| FRDM-ID contract (`FREEDAMMembership.sol`) | ✅ Written | ERC-1155 soulbound, mint/batchMint/selfMint/revoke, ReentrancyGuard |
| `selfMint()` permissionless minting | ✅ Done | Anyone can self-mint STANDARD_MEMBER. Owner controls founding/delegate. |
| Test suite (`FREEDAMMembership.test.js`) | ✅ Written | 22 tests across 8 suites (deployment, minting, batch, self-mint, soulbound, revocation, views, URI) |
| Hardhat config | ✅ Configured | Solc 0.8.19, OZ 4.9.6, Optimism Sepolia + mainnet support |
| Deploy script | ✅ Written | Ready for testnet. Minor bug: references `network` instead of `hre.network` |
| Whitepaper | ✅ Written | v1.0, comprehensive |
| Landing page | ✅ Live | freedamdao.org via Vercel |
| GitHub repo | ✅ Active | FREEDAM-DAO/DAOv.01 (private) |
| X account | ✅ Active | @FREEDAMDAO — July 4th viral post live |
| Domain | ✅ Active | freedamdao.org (Namecheap + Vercel) |
| Node.js | ✅ Installed | v22.23.1 (well above v20 requirement) |

## Bugs Found in Review

| # | Bug | Severity | Fix |
|---|---|---|---|
| 1 | `package.json` scripts reference `cd contracts && npm install` but no `contracts/package.json` exists — all deps are at root | P0 | Fix scripts to run at root level |
| 2 | Deploy script references `network.name` and `network.config.chainId` without importing `hre` | P1 | Add `const hre = require("hardhat")` or use `hre.network` |
| 3 | No `.env.example` file — contributors don't know what env vars to set | P1 | Create `.env.example` with placeholder values |
| 4 | `community/` and `governance/` folders are empty (just .gitkeep) | P2 | Add CONTRIBUTING.md, CODE_OF_CONDUCT.md, governance template |
| 5 | No `frontend/` directory but `package.json` references it in scripts | P2 | Create when Milestone 4 starts |

## What's NOT Built Yet (MVP Gaps)

| Gap | Priority | Effort |
|---|---|---|
| npm dependencies not installed locally | P0 | 15 min |
| Tests not verified passing on current setup | P0 | 15 min |
| No testnet deployment yet | P0 | 1 session |
| No contract verification on block explorer | P1 | 30 min |
| No Discord server | P1 | 1 session |
| No Snapshot governance space | P1 | 1 session |
| No minting web page (frontend) | P2 | 3-4 sessions |
| No onboarding documentation | P2 | 2 sessions |

---

## Milestone Roadmap (Refined)

### Milestone 1: Dev Environment + Tests Passing
> **Goal:** Code compiles, tests pass on your Mac. You can run `npx hardhat test` and see green.
>
> **Estimated time:** 1 session (~1.5 hours)

| # | Task | Checkable? | Status |
|---|---|---|---|
| 1.1 | Fix `package.json` scripts — remove `cd contracts &&` prefix (deps are at root) | ☐ `npm install` works at root | ⬜ |
| 1.2 | Run `npm install` at repo root | ☐ `node_modules/` exists, no errors | ⬜ |
| 1.3 | Run `npx hardhat compile` | ☐ `artifacts/` folder created | ⬜ |
| 1.4 | Run `npx hardhat test` — all 22 tests pass | ☐ 22 passing, 0 failing | ⬜ |
| 1.5 | Create `.env.example` with placeholder values | ☐ File exists, committed to repo | ⬜ |
| 1.6 | Create `.env` with placeholder PRIVATE_KEY | ☐ `.env` exists, `.gitignore` excludes it | ⬜ |

### Milestone 2: Contract Fix + Testnet Deployment
> **Goal:** FRDM-ID contract deployed to Optimism Sepolia. Verified on block explorer.
>
> **Estimated time:** 2 sessions (~3 hours)

| # | Task | Checkable? | Status |
|---|---|---|---|
| 2.1 | Fix deploy script — add `const hre = require("hardhat")` | ☐ Script runs without ReferenceError | ⬜ |
| 2.2 | Create a burner wallet (MetaMask) — never use main wallet | ☐ Wallet address saved | ⬜ |
| 2.3 | Get testnet ETH from Optimism Sepolia faucet | ☐ Balance > 0 on Sepolia | ⬜ |
| 2.4 | Add real burner wallet PRIVATE_KEY + RPC URL to `.env` | ☐ `.env` has key, not committed | ⬜ |
| 2.5 | Deploy contract to Optimism Sepolia | ☐ Contract address saved | ⬜ |
| 2.6 | Verify contract on block explorer | ☐ Verified on OP Sepolia Etherscan | ⬜ |
| 2.7 | Mint your own FRDM-ID as Founding Member (type 0) | ☐ Your address holds token ID 0 | ⬜ |
| 2.8 | Test selfMint() from a second address | ☐ Second address holds STANDARD_MEMBER | ⬜ |
| 2.9 | Update README with deployed contract address | ☐ Address visible in README | ⬜ |

### Milestone 3: Community Infrastructure
> **Goal:** Discord server live, Snapshot space configured, someone can join and vote.
>
> **Estimated time:** 2 sessions (~3 hours)

| # | Task | Checkable? | Status |
|---|---|---|---|
| 3.1 | Create Discord server: #announcements, #governance, #dev, #general, #proposals | ☐ Server URL works | ⬜ |
| 3.2 | Set up roles: Founding Member, Member, Delegate, Guest | ☐ Roles exist in Discord | ⬜ |
| 3.3 | Create Snapshot space at snapshot.org (#freedamdao) | ☐ Space is live | ⬜ |
| 3.4 | Configure Snapshot voting strategies (FRDM-ID holders) | ☐ Strategy set to contract address | ⬜ |
| 3.5 | Create first test proposal on Snapshot | ☐ Proposal visible | ⬜ |
| 3.6 | Update landing page with Discord + Snapshot links | ☐ Links work on freedamdao.org | ⬜ |

### Milestone 4: Minting Frontend
> **Goal:** Simple web page at freedamdao.org/mint where someone connects wallet and mints FRDM-ID.
>
> **Estimated time:** 4 sessions (~6 hours)

| # | Task | Checkable? | Status |
|---|---|---|---|
| 4.1 | Create `frontend/` directory structure | ☐ Folder exists | ⬜ |
| 4.2 | Build minimal HTML page with Connect Wallet button (MetaMask) | ☐ Button connects wallet | ⬜ |
| 4.3 | Add Mint Membership button — calls `selfMint()` on contract | ☐ Button mints FRDM-ID on testnet | ⬜ |
| 4.4 | Show transaction status (pending → confirmed) | ☐ User sees tx confirmation | ⬜ |
| 4.5 | Show membership status after minting ("You are Member #N") | ☐ Display works post-mint | ⬜ |
| 4.6 | Style page to match landing page (dark theme) | ☐ Page looks consistent | ⬜ |
| 4.7 | Deploy frontend to Vercel, route to freedamdao.org/mint | ☐ Page live at /mint | ⬜ |

### Milestone 5: Onboarding + Security Review
> **Goal:** New person can go from zero to voting member in under 10 minutes. Contract reviewed for security.
>
> **Estimated time:** 3 sessions (~4.5 hours)

| # | Task | Checkable? | Status |
|---|---|---|---|
| 5.1 | Write `docs/ONBOARDING.md` — step-by-step guide | ☐ Doc exists, someone follows it successfully | ⬜ |
| 5.2 | Add "How to Join" section on landing page | ☐ Section visible on freedamdao.org | ⬜ |
| 5.3 | Run `npx hardhat coverage` — review report | ☐ Coverage > 90% on critical paths | ⬜ |
| 5.4 | Manual security review with checklist | ☐ Checklist completed, issues logged | ⬜ |
| 5.5 | Create GitHub Issue template for bug reports | ☐ Template exists in `.github/ISSUE_TEMPLATE/` | ⬜ |
| 5.6 | Create `community/CONTRIBUTING.md` and `community/CODE_OF_CONDUCT.md` | ☐ Both files exist and are substantive | ⬜ |

---

## Deferred to Phase 2 (Post-MVP)

- FRDM ERC-20 governance token (participation mining)
- Quadratic voting implementation
- Gnosis Safe multisig treasury
- Tally on-chain execution
- The Graph subgraph indexing
- Next.js full dApp dashboard
- Rootstock (RSK) L2 integration
- Wyoming DAO LLC formation
- Grant applications (Gitcoin, etc.)
- Representative system
- XP / reputation points system

---

## Refinement Notes (What Changed)

| Change | Why |
|---|---|
| Removed "Contract minting is owner-only" gap | `selfMint()` already exists in the contract — this was already fixed |
| Added bug fixes as Milestone 1 tasks | `package.json` scripts are broken, deploy script has a bug — must fix before anything works |
| Reduced Milestone 1 from 5 tasks to 6 (but simpler) | Node is already installed, so the real work is fixing scripts + installing deps |
| Removed "post first X announcement" from M3 | Social media posts are not MVP milestones |
| Added `.env.example` creation to M1 | Contributors need to know what env vars are required |
| Added security checklist + contributing docs to M5 | Empty `community/` folder was flagged in review |
| Added `selfMint()` test task to M2 | Need to verify permissionless minting works on testnet, not just locally |
