# FREEDAM DAO — MVP Scope Definition

> **Scope discipline:** A DAO that governs 50 people well is more valuable than one that promises millions and ships nothing.
>
> **MVP success metric:** 20 verified members holding FRDM-ID on testnet, 3 community proposals on Snapshot, 1 passed vote.

---

## What's Already Built

| Component | Status | Notes |
|---|---|---|
| FRDM-ID contract (`FREEDAMMembership.sol`) | ✅ Written | ERC-1155 soulbound, mint/batch mint/revoke |
| Test suite (`FREEDAMMembership.test.js`) | ✅ Written | 19 tests covering mint, batch, soulbound, revoke, URI |
| Hardhat config | ✅ Configured | Supports local, Optimism Sepolia, Sepolia, mainnet |
| Deploy script | ✅ Written | Ready for testnet |
| Whitepaper | ✅ Written | v1.0, 346 lines |
| Landing page | ✅ Live | www.freedamdao.org via Vercel |
| GitHub repo | ✅ Active | FREEDAM-DAO/DAOv.01 (private) |
| X account | ✅ Active | @FREEDAMDAO |
| Domain | ✅ Active | freedamdao.org (Namecheap + Vercel) |

## What's NOT Built Yet (MVP Gaps)

| Gap | Priority | Effort |
|---|---|---|
| Dev environment not set up locally | P0 | 1 session |
| npm dependencies not installed | P0 | 1 session |
| Contract minting is owner-only (not permissionless) | P0 | 1 session |
| No testnet deployment yet | P0 | 1 session |
| No contract verification on block explorer | P1 | 0.5 session |
| No Discord server | P1 | 1 session |
| No Snapshot governance space | P1 | 1 session |
| No minting web page (frontend) | P2 | 3-4 sessions |
| No onboarding documentation | P2 | 2 sessions |

---

## Milestone Roadmap

### Milestone 1: Dev Environment + Tests Passing
> **Goal:** Code compiles, tests pass on your Mac. You can run `npm run contracts:test` and see green.
>
> **Estimated time:** 2 sessions (~3 hours)

| # | Task | Checkable? | Status |
|---|---|---|---|
| 1.1 | Install Node.js LTS and verify version | ☐ `node -v` shows v20+ | ⬜ |
| 1.2 | Run `npm run contracts:install` in repo root | ☐ `node_modules/` exists, no errors | ⬜ |
| 1.3 | Run `npx hardhat compile` in contracts dir | ☐ `artifacts/` folder created | ⬜ |
| 1.4 | Run `npx hardhat test` — all 19 tests pass | ☐ 19 passing, 0 failing | ⬜ |
| 1.5 | Create `.env` with placeholder PRIVATE_KEY (do not use real key) | ☐ `.env` exists, `.gitignore` excludes it | ⬜ |

### Milestone 2: Contract Fix + Testnet Deployment
> **Goal:** FRDM-ID contract deployed to Optimism Sepolia. Anyone can mint. Verified on block explorer.
>
> **Estimated time:** 3 sessions (~4.5 hours)

| # | Task | Checkable? | Status |
|---|---|---|---|
| 2.1 | Fix `mintMembership` — add public mint function (anyone can mint standard membership, owner still controls founding/delegate) | ☐ New function exists, tests written for it | ⬜ |
| 2.2 | Add test: non-owner can self-mint standard membership | ☐ Test passes | ⬜ |
| 2.3 | Add test: non-owner cannot self-mint founding or delegate | ☐ Tests pass (reverts) | ⬜ |
| 2.4 | Run full test suite — all tests pass | ☐ 22+ passing, 0 failing | ⬜ |
| 2.5 | Create a burner wallet (MetaMask) — never use your main wallet for dev | ☐ Wallet address saved | ⬜ |
| 2.6 | Get testnet ETH from Optimism Sepolia faucet | ☐ Balance > 0 on Sepolia | ⬜ |
| 2.7 | Add real burner wallet PRIVATE_KEY to `.env` | ☐ `.env` has key, not committed to git | ⬜ |
| 2.8 | Deploy contract to Optimism Sepolia | ☐ Contract address saved | ⬜ |
| 2.9 | Verify contract on block explorer (`npx hardhat verify`) | ☐ Contract is verified on OP Sepolia Etherscan | ⬜ |
| 2.10 | Mint your own FRDM-ID as Founding Member (type 0) | ☐ Your address holds token ID 0 | ⬜ |
| 2.11 | Update README with deployed contract address | ☐ Address visible in README | ⬜ |

### Milestone 3: Community Infrastructure
> **Goal:** Discord server live, Snapshot space configured, someone can join and vote.
>
> **Estimated time:** 2 sessions (~3 hours)

| # | Task | Checkable? | Status |
|---|---|---|---|
| 3.1 | Create Discord server with channels: #announcements, #governance, #dev, #general, #proposals | ☐ Server URL works | ⬜ |
| 3.2 | Set up roles: Founding Member, Member, Delegate, Guest | ☐ Roles exist in Discord | ⬜ |
| 3.3 | Create Snapshot space at snapshot.org (#freedam.eth or freedamdao) | ☐ Space is live on Snapshot | ⬜ |
| 3.4 | Configure Snapshot voting strategies (FRDM-ID holders) | ☐ Strategy set to contract address | ⬜ |
| 3.5 | Create first test proposal on Snapshot | ☐ Proposal visible on Snapshot | ⬜ |
| 3.6 | Update landing page with Discord + Snapshot links | ☐ Links work on freedamdao.org | ⬜ |
| 3.7 | Post first X announcement: "FREEDAM DAO is live on testnet" | ☐ Tweet posted | ⬜ |

### Milestone 4: Minting Frontend
> **Goal:** Simple web page at freedamdao.org/mint where someone connects wallet and mints FRDM-ID.
>
> **Estimated time:** 4 sessions (~6 hours)

| # | Task | Checkable? | Status |
|---|---|---|---|
| 4.1 | Create `frontend/` directory structure in repo | ☐ Folder exists | ⬜ |
| 4.2 | Build minimal HTML page with "Connect Wallet" button (MetaMask) | ☐ Button connects wallet on page | ⬜ |
| 4.3 | Add "Mint Membership" button — calls `mintMembership` on contract | ☐ Button mints FRDM-ID on testnet | ⬜ |
| 4.4 | Show transaction status (pending → confirmed) | ☐ User sees tx confirmation | ⬜ |
| 4.5 | Show membership status after minting ("You are Member #N") | ☐ Display works post-mint | ⬜ |
| 4.6 | Style page to match landing page (dark theme, same colors) | ☐ Page looks consistent | ⬜ |
| 4.7 | Deploy frontend to Vercel, route to freedamdao.org/mint | ☐ Page live at freedamdao.org/mint | ⬜ |

### Milestone 5: Onboarding + Security Review
> **Goal:** New person can go from zero to voting member in under 10 minutes. Contract reviewed for security.
>
> **Estimated time:** 3 sessions (~4.5 hours)

| # | Task | Checkable? | Status |
|---|---|---|---|
| 5.1 | Write `docs/ONBOARDING.md` — step-by-step: install MetaMask, get testnet ETH, mint FRDM-ID, join Discord, vote on Snapshot | ☐ Doc exists, someone follows it successfully | ⬜ |
| 5.2 | Create a "How to Join FREEDAM" section on landing page | ☐ Section visible on freedamdao.org | ⬜ |
| 5.3 | Run `npx hardhat coverage` — review coverage report | ☐ Coverage > 90% on critical paths | ⬜ |
| 5.4 | Manual security review of contract with checklist (reentrancy, access control, overflow, soulbound enforcement) | ☐ Checklist completed, issues logged | ⬜ |
| 5.5 | Ask for community security review on Discord + GitHub | ☐ Review request posted | ⬜ |
| 5.6 | Create GitHub Issue template for bug reports | ☐ Template exists in `.github/ISSUE_TEMPLATE/` | ⬜ |

---

## Deferred to Phase 2 (Post-MVP)

These are explicitly OUT OF SCOPE for the MVP. Do not work on them until Milestone 5 is complete and the community votes to proceed.

- FRDM ERC-20 governance token (participation mining)
- Quadratic voting implementation
- Gnosis Safe multisig treasury
- Tally on-chain execution
- The Graph subgraph indexing
- Next.js full dApp dashboard
- Rootstock (RSK) L2 integration
- Wyoming DAO LLC formation
- Grant applications (Gitcoin, etc.)
- Educational onboarding modules (video tutorials)
- Representative system
- XP / reputation points system

---

## Time Estimate

| Milestone | Sessions | Hours (est.) |
|---|---|---|
| M1: Dev Environment | 2 | 3 |
| M2: Contract Fix + Deploy | 3 | 4.5 |
| M3: Community Infra | 2 | 3 |
| M4: Minting Frontend | 4 | 6 |
| M5: Onboarding + Security | 3 | 4.5 |
| **Total** | **14** | **~21 hours** |

At ~9 hours/week, this is roughly **2.5 weeks of focused work**. With real-life interruptions, plan for **3-4 weeks**.

---

## Assumptions Challenged

| Assumption from Whitepaper | Challenge | Resolution |
|---|---|---|
| "Ethereum mainnet (Phase 1)" | Mainnet deployment is expensive and premature for an unaudited contract | Deploy to Optimism Sepolia (testnet) first. Mainnet after community vote + security review. |
| "Permissionless minting" | Current contract is `onlyOwner` — not permissionless | Fix: add public `selfMint()` for standard memberships. Owner retains control of founding/delegate. |
| Full governance stack (Snapshot + Tally + Gnosis Safe) | Too complex for MVP. Tally and Gnosis Safe require operational multisig signers. | MVP uses Snapshot only (off-chain, gasless). Tally/Gnosis deferred to Phase 2. |
| $34,000 budget via Gitcoin Grants | Grants require a working product and community first. No grant for a pre-MVP project. | Build MVP first → community → then apply for grants. Fund the initial work with sweat equity. |
| Frontend is "Next.js dApp + governance dashboard" | Full Next.js app is overkill for minting a token. | MVP: single HTML page with ethers.js. Upgrade to Next.js in Phase 2 when dashboard features are needed. |

---

*MVP scope defined by Hermes Agent. This document is a living doc — update it as milestones are completed or scope changes.*
