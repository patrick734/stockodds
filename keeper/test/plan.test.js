const test = require("node:test");
const assert = require("node:assert");
const { roundsToCheck, burnAmount, minOut } = require("../src/plan");

test("checks the rounds that have ended, newest first", () => {
  // At 10:30 UTC the 09:00-10:00 round (n = floor(now / 3600) - 1) is the newest ended one.
  const now = 497588 * 3600 + 1800;
  assert.deepEqual(roundsToCheck(now, 3), [497587, 497586, 497585]);
});

test("burns at most the per-run cap, and nothing below the minimum", () => {
  assert.equal(burnAmount(10n, 4n, 1n), 4n);
  assert.equal(burnAmount(3n, 4n, 1n), 3n);
  assert.equal(burnAmount(3n, 4n, 5n), 0n);
});

test("applies slippage to the quote", () => {
  assert.equal(minOut(10_000n, 500), 9_500n);
});
