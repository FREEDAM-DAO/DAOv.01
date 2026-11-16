/*
 * Stake-intent validation — shared by the intake endpoint (docs/api/intent.js) and the
 * operator batch (ledger/batch.js). Framework-free; side effects are injected so the
 * whole flow is testable without a server or an RPC (SPEC increment 3).
 *
 * An intent is NOT a lock (SPEC §3.2): the endpoint stores it, the Sunday batch
 * re-validates the balance first-come-by-timestamp and writes the `lock` event.
 */
'use strict';

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const MARKET_RE = /^PM-[0-9]{3}$/;
const MIN_STAKE = 10; // D9
const MAX_STAKE = 10_000_000; // sanity ceiling — an intent above this is malformed/spam

// EIP-712 domain bound to OP Sepolia + the FRDM-ID contract (SPEC §3.2).
const FRDM_ID_ADDRESS = '0x9af71751842C9fcE04e8f10473DDa43A8f9409B7';
const CHAIN_ID = 11155420;
const DOMAIN = Object.freeze({
  name: 'FREEDAM Policy Market',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: FRDM_ID_ADDRESS
});
const TYPES = Object.freeze({
  Stake: [
    { name: 'marketId', type: 'string' },
    { name: 'side', type: 'string' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
});

class IntentError extends Error {
  constructor(code, message) { super(`[${code}] ${message}`); this.code = code; }
}

/** Structural checks — everything that needs no async/external dependency. */
function validateIntentShape(intent) {
  if (!intent || typeof intent !== 'object') throw new IntentError('SHAPE', 'body must be a JSON object');
  if (!MARKET_RE.test(intent.marketId || '')) throw new IntentError('MARKET', 'marketId must be PM-###');
  if (intent.side !== 'for' && intent.side !== 'against') throw new IntentError('SIDE', 'side must be for|against');
  if (!Number.isInteger(intent.amount) || intent.amount < MIN_STAKE) throw new IntentError('FLOOR', `amount must be an integer ≥ ${MIN_STAKE} Aura (D9)`);
  if (intent.amount > MAX_STAKE) throw new IntentError('AMOUNT', 'amount exceeds sanity ceiling');
  if (!ADDR_RE.test(intent.address || '')) throw new IntentError('ADDR', 'address must be the signer wallet');
  if (!Number.isInteger(intent.nonce) || intent.nonce < 0 || intent.nonce > Number.MAX_SAFE_INTEGER) throw new IntentError('NONCE', 'nonce must be a uint256 within safe integer range');
  if (!Number.isInteger(intent.deadline) || intent.deadline * 1000 < Date.now()) throw new IntentError('DEADLINE', 'deadline must be a future unix seconds timestamp');
  if (typeof intent.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(intent.signature)) throw new IntentError('SIG', 'signature must be a 65-byte EIP-712 sig');
  return true;
}

/**
 * Full async validation. ctx:
 *   verifyStakeSig(intent) → Promise<recoveredAddress>  (ethers.verifyTypedData)
 *   hasMembership(address) → Promise<boolean>           (eth_call on FRDM-ID)
 *   marketStakeable(marketId) → Promise<boolean>        (markets.json: state open|stalled)
 * Throws IntentError on any violation; returns the canonical intent.
 */
async function validateIntent(intent, ctx) {
  validateIntentShape(intent);
  const recovered = await ctx.verifyStakeSig(intent);
  const addr = intent.address.toLowerCase();
  if (recovered.toLowerCase() !== addr) throw new IntentError('SIG_MISMATCH', 'signature does not recover the claimed address');
  if (!(await ctx.hasMembership(intent.address))) throw new IntentError('NOT_MEMBER', 'address does not hold an FRDM-ID membership');
  if (!(await ctx.marketStakeable(intent.marketId))) throw new IntentError('MARKET_CLOSED', 'market is not open for staking');
  return {
    marketId: intent.marketId, side: intent.side, amount: intent.amount,
    address: intent.address.toLowerCase(), nonce: intent.nonce,
    deadline: intent.deadline, signature: intent.signature,
    received_at: new Date().toISOString()
  };
}

/** Batch-time re-validation against replay state (SPEC §3.2: the batch re-validates the balance). */
function validateForBatch(intent, state, existingKeys) {
  const key = intent.address + ':' + intent.marketId;
  if (existingKeys.has(key)) throw new IntentError('REPLAY', 'an intent from this address for this market was already processed (first-come by timestamp)');
  const bal = state.balances.get(intent.address) || 0;
  if (intent.amount > bal) throw new IntentError('OVERDRAW', `stake ${intent.amount} exceeds spendable balance ${bal} — batch rejects (first-come by timestamp)`);
  const lockedForMarket = (state.locked.get(intent.address) || {})[intent.marketId];
  if (lockedForMarket) throw new IntentError('SIDE_DUP', 'one side per member per market (D-8)');
  return true;
}

module.exports = { DOMAIN, TYPES, FRDM_ID_ADDRESS, CHAIN_ID, MIN_STAKE, IntentError, validateIntentShape, validateIntent, validateForBatch };
