# FREEDAM DAO

> **Free Decentralized Autonomous Movement**  
> *Dissent Stay Decent & Decentralize*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Governance: Snapshot](https://img.shields.io/badge/Governance-Snapshot-purple)](https://snapshot.org/#/freedam.eth)
[![Discord](https://img.shields.io/badge/Discord-Join-7289DA)](https://discord.gg/freedam)
[![Twitter Follow](https://img.shields.io/twitter/follow/FREEDAM_DAO?style=social)](https://x.com/FREEDAM_DAO)

---

**FREEDAM** is a non-partisan, open-source DAO building permissionless infrastructure for civic governance. We deploy blockchain primitives — soulbound membership credentials, quadratic voting, and transparent treasuries — to give democratic participation back to individuals rather than institutions.

**This is not a DeFi protocol. This is a movement.**

We believe the best way to build it is to **start small, ship fast, and iterate based on real usage**.

---

## What's in This Repo

```
freedam-dao/
├── contracts/              # Solidity smart contracts (Hardhat)
├── frontend/               # Next.js web interface
├── governance/             # Governance framework & templates
├── community/              # Code of conduct, contributing guide, charter
├── docs/                   # Technical documentation
├── WHITEPAPER.md           # Full project vision
├── SECURITY.md
└── LICENSE
```

---

## The Token Model (MVP)

- **FRDM-ID** — ERC-1155 soulbound membership credential (non-transferable, free to mint). Grants proposal and voting rights.
- **FRDM** — ERC-20 governance token earned through participation (not sold). Powers quadratic voting weight.

**No presale. No VC allocation. No founder reserve.** Fair launch.

---

## Current Focus (MVP Phase)

This repository contains the **minimum viable version** of FREEDAM. We’ve intentionally kept it simple so we can:

- Launch faster
- Get real feedback from real people
- Learn what actually works before adding complexity

**Included now:**
- Soulbound membership token
- Basic proposal creation and voting system
- Clean, readable code

**Not included yet (by design):**
- Rewards or token incentives
- Advanced identity features
- Complex voting mechanics

These will be added later based on community input.

---

## Quick Links

| Resource          | Link                                      |
|-------------------|-------------------------------------------|
| Whitepaper        | [WHITEPAPER.md](WHITEPAPER.md)            |
| Governance Docs   | [governance/](governance/)                |
| Security          | [SECURITY.md](SECURITY.md)                |
| Mint FRDM-ID      | Coming soon — freedam.io                  |
| Vote              | [snapshot.org/#/freedam.eth](https://snapshot.org/#/freedam.eth) |
| Discord           | [discord.gg/freedam](https://discord.gg/freedam) |
| X / Twitter       | [@FREEDAM_DAO](https://x.com/FREEDAM_DAO) |

---

## Getting Started

### For Members
1. Read the [Whitepaper](WHITEPAPER.md)
2. Join the [Discord](https://discord.gg/freedam)
3. Mint your FRDM-ID (when available)
4. Participate in proposals

### For Developers
```bash
git clone https://github.com/FREEDAM-DAO/freedam-dao
cd freedam-dao

# Contracts
cd contracts
npm install
npx hardhat compile
npx hardhat test

# Frontend
cd ../frontend
npm install
npm run dev
```

See [docs/](docs/) for architecture and technical details.

---

## Contributing

FREEDAM is built in public. All contributions are welcome — code, governance ideas, documentation, translations, or organizing.

Please read [community/CONTRIBUTING.md](community/CONTRIBUTING.md) and [community/CODE_OF_CONDUCT.md](community/CODE_OF_CONDUCT.md) before contributing.

---

## License

- Smart contracts and code: [MIT License](LICENSE)
- Governance and community content: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

---

*“We hold these truths to be self-evident, that all men are created equal...”*  
**FREEDAM is the infrastructure to mean it.**