const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DELAY = 48 * 3600;
const P = 3600;
const W = 300;
const ETH = (n) => ethers.parseEther(String(n));
const ZERO = ethers.ZeroAddress;

const NOUL = 0;
const CHOICE = 1;
const SCORE = 2;
const ASSET = { ETH: 1, NVDA: 2, GOOGL: 3 };

// The launch cards (same questions as Clef's): weekday 1, weekend 2.
const q = (kind, options, assets, lines, margin, absMove = false) => ({
  kind,
  options,
  assets: [...assets, 0, 0, 0].slice(0, 3),
  lines: [...lines, 0, 0, 0].slice(0, 3),
  margin,
  absMove,
});
const SEVERITY = q(SCORE, 4, [ASSET.ETH], [10, 25, 50], 2, true);
const WEEKDAY = [q(NOUL, 2, [ASSET.NVDA], [0], 12), q(CHOICE, 3, [ASSET.NVDA, ASSET.GOOGL, ASSET.ETH], [], 20), SEVERITY];
const WEEKEND = [q(NOUL, 2, [ASSET.ETH], [0], 3), SEVERITY];

/** Hours 2..119 of the week (Monday 02:00 to Friday 23:00 UTC) get the weekday card. */
function weekdayBitmap() {
  let b = 0n;
  for (let h = 2; h <= 119; h++) b |= 1n << BigInt(h);
  return b;
}

/** Packs basis points: option i of the card at bits 16i. */
function pack(bp) {
  return bp.reduce((acc, p, i) => acc | (BigInt(p) << BigInt(16 * i)), 0n);
}

async function deployTimelock(multisig) {
  const timelock = await ethers.deployContract("TimelockController", [DELAY, [multisig.address], [multisig.address], ZERO]);
  await network.provider.send("hardhat_setBalance", [timelock.target, "0x56BC75E2D63100000"]);
  const admin = await ethers.getImpersonatedSigner(timelock.target);
  return { timelock, admin };
}

async function deployRounds(ctx, overrides = {}) {
  return ethers.deployContract("OddsRounds", [
    {
      admin: ctx.timelock.target,
      guardian: ctx.guardian.address,
      v3Factory: ctx.factory.target,
      usdg: ctx.usdg.target,
      feeSink: ctx.burn.target,
      feeBps: 500,
      minStake: ETH("0.0005"),
      maxStake: ETH("0.1"),
      roundCap: ETH(1),
      weekdaySchema: 1,
      weekendSchema: 2,
      weekdayHours: weekdayBitmap(),
      assets: [
        { id: ASSET.ETH, pool: ctx.pools.ETH.target },
        { id: ASSET.NVDA, pool: ctx.pools.NVDA.target },
        { id: ASSET.GOOGL, pool: ctx.pools.GOOGL.target },
      ],
      schemas: [
        { id: 1, questions: WEEKDAY },
        { id: 2, questions: WEEKEND },
      ],
      ...overrides,
    },
  ]);
}

async function baseFixture() {
  const [deployer, multisig, guardian, keeper, alice, bob, carol, dave] = await ethers.getSigners();
  const { timelock, admin } = await deployTimelock(multisig);
  const usdg = await ethers.deployContract("MockERC20", ["Global Dollar", "USDG", 6]);
  const factory = await ethers.deployContract("MockV3Factory");
  const pools = {};
  for (const sym of ["ETH", "NVDA", "GOOGL"]) {
    const token = await ethers.deployContract("MockERC20", [sym, sym, 18]);
    const pool = await ethers.deployContract("MockOraclePool", [token, usdg, 500]);
    await factory.register(pool, token, usdg, 500);
    pool.asset = token;
    pool.flip = (await pool.token0()) === usdg.target; // asset is token1: price ticks run the other way
    pools[sym] = pool;
  }

  const pm = await ethers.deployContract("MockPoolManager");
  const hook = "0x0000000000000000000000000000000000000044";
  const burn = await ethers.deployContract("OddsBurn", [pm, hook, 0, 200, timelock, guardian.address, keeper.address, ETH("0.5"), 3600]);
  const ctx = { deployer, multisig, guardian, keeper, alice, bob, carol, dave, timelock, admin, usdg, factory, pools, pm, hook, burn };
  const rounds = await deployRounds(ctx);
  return { ...ctx, rounds };
}

/** The next weekday (or weekend) round whose entry window is still ahead, with the chain moved into that window. */
async function openWeekdayRound(rounds, weekend = false) {
  const now = await time.latest();
  let n = Math.floor((now + W) / P) + 2;
  // Pick a round whose next few hours share its card, so tests can use n + 3 as a second round.
  const kind = (r) => {
    const h = (r + 72) % 168;
    return h >= 2 && h <= 119;
  };
  while (![0, 1, 2, 3, 4].every((k) => kind(n + k) !== weekend)) n++;
  const opens = n * P - W - P;
  await time.increaseTo(opens + 10);
  return n;
}

/**
 * Sets each pool's tick history so the asset moves by `moves[sym]` tick-seconds between the start and end windows
 * of round n (flat at 0 through the start window, then a constant tick across the end window).
 */
async function setMoves(ctx, n, moves) {
  const start = n * P;
  const end = start + P;
  for (const [sym, d] of Object.entries(moves)) {
    const pool = ctx.pools[sym];
    if (d % W !== 0) throw new Error("move must be a whole number of ticks over W");
    const ticks = d / W;
    await pool.setTickAt(start - 2 * W, 0);
    await pool.setTickAt(end - W, pool.flip ? -ticks : ticks);
  }
}

/** Moves the chain past the round's end. */
async function endRound(n, extra = 5) {
  await time.increaseTo(n * P + P + extra);
}

module.exports = { DELAY, P, W, ETH, ZERO, NOUL, CHOICE, SCORE, ASSET, WEEKDAY, WEEKEND, SEVERITY, q, pack, weekdayBitmap, deployTimelock, deployRounds, baseFixture, openWeekdayRound, setMoves, endRound };
