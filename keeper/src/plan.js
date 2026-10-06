// Pure decisions, kept apart from chain calls so they can be unit tested.
const P = 3600;

/** Rounds that have ended and may need settling, newest first. */
function roundsToCheck(now, lookback) {
  const lastEnded = Math.floor(now / P) - 1; // round n ends at (n + 1) * P
  return Array.from({ length: lookback }, (_, i) => lastEnded - i).filter((n) => n > 0);
}

/** How much ETH to burn this run, or 0. */
function burnAmount(balance, maxPerRun, minBurn) {
  const amount = balance < maxPerRun ? balance : maxPerRun;
  return amount >= minBurn ? amount : 0n;
}

function minOut(quoted, slippageBps) {
  return (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
}

module.exports = { P, roundsToCheck, burnAmount, minOut };
