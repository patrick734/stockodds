# StockOdds security model

## Roles

| Role | Holder | Can | Cannot |
|---|---|---|---|
| Admin | OpenZeppelin `TimelockController`, 48h delay | add new cards and assets (existing ones are permanent), change the schedule for future rounds, limits (within code caps), the fee (max 10%, plus a 24h in-contract delay), unpause, set $ODDS once, burn limits, resume the burn | touch any stake; change a card, asset or fee for a round already in play; send fees anywhere but OddsBurn; withdraw from OddsBurn |
| Guardian | Separate wallet | pause new entries, halt the burn | unpause, change anything, block settling or claiming |
| Keeper | Hot wallet, key only in GitHub Actions | burn (capped per run, at most hourly, with its own minimum) | anything else; settling and flushing are open to anyone |
| Deployer | Fresh wallet | launch $ODDS on Pons | **nothing after deployment** |

Constructors run `GovernanceChecks` (timelock admin with at least 48h delay that the deployer cannot use; distinct
roles). `scripts/verify.js` checks the timelock bytecode and replays every role event.

## OddsRounds

- **Money paths:** stakes leave only as `claim` payouts or refunds to the wallet that staked; fees only through
  `flushFees` to the immutable `feeSink` (OddsBurn). No admin transfer function exists.
- **Timing from the clock:** round n is `[n·3600, (n+1)·3600)`; entries close at the start of the start TWAP window.
- **Prices:** one `observe` per asset at settlement; moves are `(c3 − c2) − (c1 − c0)` tick-seconds, sign-flipped when the
  asset is token1. Only factory-verified USDG pools; cards require ≥ 4,500 observations per pool at the round's
  first entry.
- **Void, not wrong:** a failing `observe` voids the round (full refunds, no fee). `settle` reverts instead of voiding when
  it has under 200k gas left before a read.
- **Math:** exact integer Brier / ranked probability losses, running sums per question, payouts with floor division;
  verified to the wei against the documented worked example and against `lib/score.js` on random rounds. Payouts never
  exceed the pot; dust ≤ 1 wei per entry stays in the contract.
- **Immutability:** cards and asset ids cannot be redefined; a round keeps its card and fee from its first entry.

## Accepted risks

- **Price pushing.** A trader can hold a pool away from fair value for the 5-minute window. Soft margins, the
  weekday/weekend schedule and small caps (0.1 ETH per entry, 1 ETH per round) keep this unprofitable in most rounds.
- **Cap filling.** Several wallets with identical forecasts can fill a round's 1 ETH cap for the cost of gas (identical
  entries are refunded exactly). The admin can raise the cap; the guardian can pause.
- **Late settlement.** An unsettled round can be voided by someone rolling the pool's observation buffer after about an
  hour. The keeper settles within minutes; any claim settles first.
- **Public entries.** Forecasts are visible on-chain before the round locks.
- **Fee shading.** Taking the fee from profit only rewards shading toward the room by under 2 percentage points at 5%.
- **Wagering law.** Staked forecast rounds may be restricted in some jurisdictions. The site says so.
- **No external audit yet.**
