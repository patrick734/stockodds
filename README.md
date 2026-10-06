# StockOdds

**Say your odds. Get paid for being right.** Hourly forecast rounds on NVIDIA, Alphabet and ETH on Robinhood Chain.
Players answer with probabilities and stake ETH; the contract reads 5-minute Uniswap TWAPs, scores everyone with proper
scoring rules and pays the better calibrated from the worse. The 5% fee on winners' profit buys and burns $ODDS.

- `contracts/`: `OddsRounds` (rounds, soft answers, Brier and ranked-probability scoring, weighted-score payouts) and
  `OddsBurn` (fee ETH to $ODDS through its Pons pool, burned), governed by a 48h timelock from block one.
- `app/`: Next.js play site.
- `keeper/`: settles rounds, forwards fees, burns $ODDS (GitHub Actions, `KEEPER_LIVE`).
- `launch/`: launches $ODDS on Pons from the dev wallet.
- `tools/`: encrypted keystores for wallets imported from MetaMask.

Launch guide: [docs/LAUNCH.md](docs/LAUNCH.md). Security model: [docs/SECURITY.md](docs/SECURITY.md).

The round design follows the public description of an independent builders-camp project; this is an original
implementation with its own contracts, governance and token. Not affiliated with Robinhood, Uniswap or Cloudflare.
Forecast rounds with stakes may not be allowed where you live. Nothing here is financial advice.
