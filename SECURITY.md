# Security Policy

## Scope

This security policy covers:
- All smart contracts in `contracts/src/`
- The FREEDAM dApp frontend at freedamdao.org
- The Gnosis Safe treasury configuration
- The Snapshot governance space and custom voting strategies

## Reporting a Vulnerability

**Do not open a public GitHub Issue for security vulnerabilities.**

Report vulnerabilities to: **security@freedamdao.org**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

The Tech Working Group will acknowledge receipt within 48 hours and provide a preliminary assessment within 7 days.

## Responsible Disclosure

We ask that you:
- Give us reasonable time to investigate and patch before public disclosure (we request 90 days)
- Not exploit the vulnerability or access user data beyond what is needed to demonstrate the issue
- Not publicly disclose details until a fix is deployed or we mutually agree on a timeline

In return, FREEDAM commits to:
- Acknowledge your report promptly
- Keep you informed of progress
- Credit you in the security advisory (unless you prefer anonymity)
- Not pursue legal action against good-faith security researchers

## Severity Classification

| Severity | Description | Response Time |
|---|---|---|
| Critical | Direct loss of treasury funds, complete governance bypass | 24 hours |
| High | Privilege escalation, vote manipulation, Sybil enablement | 72 hours |
| Medium | Denial of service, incorrect state, non-critical bypass | 7 days |
| Low | Informational, minor UX issues | 30 days |

## Known Limitations

- Smart contracts are not yet audited. Audit is planned before mainnet deployment.
- Snapshot voting is off-chain. The security model relies on Snapshot's infrastructure; FREEDAM maintains fallback governance procedures in the event of Snapshot unavailability.
- The XP attestation system relies on multi-sig authorization. Compromise of the Gamification Working Group multisig would allow fraudulent XP issuance — this is mitigated by the quadratic formula, which limits the impact of any single address's XP balance.

## Bug Bounty

A formal bug bounty program is planned for launch following the completion of smart contract audits. Details will be published via governance proposal.

---

*FREEDAM Security Policy v1.0 | Tech Working Group | security@freedamdao.org*
