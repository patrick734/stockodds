const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { P, W, ETH, ASSET, WEEKDAY, pack, q, NOUL, baseFixture, openWeekdayRound, setMoves, endRound } = require("./fixtures");

// Clef's documented worked example: NVDA +6 ticks, GOOGL +12, ETH -16 over the hour, three entries.
const EXAMPLE_MOVES = { NVDA: 1800, GOOGL: 3600, ETH: -4800 };
const A = pack([6000, 4000, 3500, 4000, 2500, 2000, 4500, 2500, 1000]);
const B = pack([9500, 500, 7000, 1500, 1500, 500, 500, 1000, 8000]);
const C = pack([5000, 5000, 3334, 3333, 3333, 2500, 2500, 2500, 2500]);
const FLAT_WEEKDAY = pack([5000, 5000, 3334, 3333, 3333, 2500, 2500, 2500, 2500]);

const unpack = (v, k) => Array.from({ length: k }, (_, j) => Number((v >> BigInt(16 * j)) & 0xffffn));

describe("OddsRounds", function () {
  async function exampleRound() {
    const ctx = await baseFixture();
    const n = await openWeekdayRound(ctx.rounds);
    await setMoves(ctx, n, EXAMPLE_MOVES);
    await ctx.rounds.connect(ctx.alice).enter(n, 1, A, { value: ETH("0.01") });
    await ctx.rounds.connect(ctx.bob).enter(n, 1, B, { value: ETH("0.02") });
    await ctx.rounds.connect(ctx.carol).enter(n, 1, C, { value: ETH("0.005") });
    return { ...ctx, n };
  }

  describe("the worked example, to the wei", function () {
    it("settles to the documented soft answers", async function () {
      const { rounds, n } = await loadFixture(exampleRound);
      await endRound(n);
      await rounds.settle(n);
      const [up, lead, sev] = await rounds.answerOf(n);
      expect(unpack(up, 2)).to.deep.equal([7500, 2500]);
      expect(unpack(lead, 3)).to.deep.equal([4117, 5883, 0]);
      expect(unpack(sev, 3)).to.deep.equal([0, 10000, 10000]); // cumulative: Minor 100%
    });

    it("pays every wallet exactly what the documented math says", async function () {
      const { rounds, n, alice, bob, carol } = await loadFixture(exampleRound);
      await endRound(n);
      await rounds.settle(n);
      expect(await rounds.previewPayout(n, alice)).to.deep.equal([11047862289682540n, 55150646825396n]);
      expect(await rounds.previewPayout(n, bob)).to.deep.equal([18591714761904761n, 0n]);
      expect(await rounds.previewPayout(n, carol)).to.deep.equal([5290008686507936n, 15263615079365n]);

      await expect(rounds.connect(alice).claim([n])).to.changeEtherBalance(alice, 11047862289682540n);
      await expect(rounds.connect(bob).claim([n])).to.changeEtherBalance(bob, 18591714761904761n);
      await expect(rounds.connect(carol).claim([n])).to.changeEtherBalance(carol, 5290008686507936n);
      expect(await rounds.feesAccrued()).to.equal(70414261904761n);
      // Pot minus payouts minus fees: 2 wei of rounding dust stays.
      expect(await ethers.provider.getBalance(rounds)).to.equal(70414261904761n + 2n);
    });

    it("sends the fees only to the burn contract", async function () {
      const { rounds, n, alice, carol, burn, dave } = await loadFixture(exampleRound);
      await endRound(n);
      await rounds.connect(alice).claim([n]);
      await rounds.connect(carol).claim([n]);
      const fees = await rounds.feesAccrued();
      await expect(rounds.connect(dave).flushFees()).to.changeEtherBalances([rounds, burn], [-fees, fees]);
      expect(await rounds.feesAccrued()).to.equal(0n);
    });
  });

  describe("timing and cards", function () {
    it("takes entries only from open until five minutes before the hour", async function () {
      const { rounds, alice } = await loadFixture(baseFixture);
      const n = await openWeekdayRound(rounds);
      const [opens, locks, start, end] = await rounds.timing(n);
      expect([opens, locks, start, end]).to.deep.equal([BigInt(n * P - W - P), BigInt(n * P - W), BigInt(n * P), BigInt(n * P + P)]);
      await expect(rounds.connect(alice).enter(n + 1, 1, FLAT_WEEKDAY, { value: ETH("0.001") })).to.be.revertedWithCustomError(rounds, "RoundNotOpen");
      await time.increaseTo(n * P - W);
      await expect(rounds.connect(alice).enter(n, 1, FLAT_WEEKDAY, { value: ETH("0.001") })).to.be.revertedWithCustomError(rounds, "RoundNotOpen");
      expect(await rounds["openRound()"]()).to.equal(BigInt(n + 1));
    });

    it("asks stock questions on weekdays and ETH only on weekends", async function () {
      const { rounds, alice } = await loadFixture(baseFixture);
      const wd = await openWeekdayRound(rounds);
      expect(await rounds.schemaFor(wd)).to.equal(1n);
      await expect(rounds.connect(alice).enter(wd, 2, pack([5000, 5000, 2500, 2500, 2500, 2500]), { value: ETH("0.001") }))
        .to.be.revertedWithCustomError(rounds, "WrongSchema")
        .withArgs(1);
      const we = await openWeekdayRound(rounds, true);
      expect(await rounds.schemaFor(we)).to.equal(2n);
      await rounds.connect(alice).enter(we, 2, pack([5000, 5000, 2500, 2500, 2500, 2500]), { value: ETH("0.001") });
    });

    it("keeps a round's card once it has an entry, even if the schedule changes", async function () {
      const { rounds, admin, alice, bob } = await loadFixture(baseFixture);
      const n = await openWeekdayRound(rounds);
      await rounds.connect(alice).enter(n, 1, FLAT_WEEKDAY, { value: ETH("0.001") });
      await rounds.connect(admin).setSchedule(1, 2, 0); // every hour is now a weekend hour
      expect(await rounds.schemaFor(n)).to.equal(1n);
      await rounds.connect(bob).enter(n, 1, FLAT_WEEKDAY, { value: ETH("0.001") });
      expect(await rounds.schemaFor(n + 1)).to.equal(2n);
    });
  });

  describe("entries", function () {
    it("rejects probabilities that do not sum to 10,000 per question, or stray bits", async function () {
      const { rounds, alice } = await loadFixture(baseFixture);
      const n = await openWeekdayRound(rounds);
      for (const bad of [
        pack([5000, 4999, 3334, 3333, 3333, 2500, 2500, 2500, 2500]),
        pack([10000, 0, 3334, 3333, 3333, 2500, 2500, 2500, 2501]),
        FLAT_WEEKDAY | (1n << 160n),
        pack([20000, 0, 3334, 3333, 3333, 2500, 2500, 2500, 2500]),
      ]) {
        await expect(rounds.connect(alice).enter(n, 1, bad, { value: ETH("0.001") })).to.be.revertedWithCustomError(rounds, "BadProbabilities");
      }
    });

    it("enforces the stake limits, the round cap and one entry per wallet", async function () {
      const { rounds, alice, bob } = await loadFixture(baseFixture);
      const n = await openWeekdayRound(rounds);
      await expect(rounds.connect(alice).enter(n, 1, FLAT_WEEKDAY, { value: ETH("0.0004") })).to.be.revertedWithCustomError(rounds, "BadStake");
      await expect(rounds.connect(alice).enter(n, 1, FLAT_WEEKDAY, { value: ETH("0.11") })).to.be.revertedWithCustomError(rounds, "BadStake");
      await rounds.connect(alice).enter(n, 1, FLAT_WEEKDAY, { value: ETH("0.1") });
      await expect(rounds.connect(alice).enter(n, 1, FLAT_WEEKDAY, { value: ETH("0.1") })).to.be.revertedWithCustomError(rounds, "AlreadyEntered");
      const signers = await ethers.getSigners();
      for (const s of signers.slice(8, 17)) await rounds.connect(s).enter(n, 1, FLAT_WEEKDAY, { value: ETH("0.1") });
      await expect(rounds.connect(bob).enter(n, 1, FLAT_WEEKDAY, { value: ETH("0.0005") })).to.be.revertedWithCustomError(rounds, "RoundFull");
    });

    it("refuses a card whose pools keep too few observations", async function () {
      const { rounds, pools, alice } = await loadFixture(baseFixture);
      await pools.GOOGL.setCardinality(4499);
      const n = await openWeekdayRound(rounds);
      await expect(rounds.connect(alice).enter(n, 1, FLAT_WEEKDAY, { value: ETH("0.001") }))
        .to.be.revertedWithCustomError(rounds, "PoolTooShallow")
        .withArgs(pools.GOOGL.target);
    });

    it("pauses entries but never settling or claiming", async function () {
      const { rounds, guardian, admin, alice, n } = await loadFixture(exampleRound);
      await rounds.connect(guardian).pause();
      await expect(rounds.connect(alice).enter(n + 1, 1, FLAT_WEEKDAY, { value: ETH("0.001") })).to.be.revertedWithCustomError(rounds, "EnforcedPause");
      await endRound(n);
      await rounds.connect(alice).claim([n]);
      await expect(rounds.connect(guardian).unpause()).to.be.revertedWithCustomError(rounds, "AccessControlUnauthorizedAccount");
      await rounds.connect(admin).unpause();
    });
  });

  describe("settlement and claims", function () {
    it("cannot settle before the hour ends; a claim settles first and works only once", async function () {
      const { rounds, alice, n } = await loadFixture(exampleRound);
      await time.increaseTo(n * P + P - 10);
      await expect(rounds.settle(n)).to.be.revertedWithCustomError(rounds, "NotEnded");
      await endRound(n);
      await rounds.connect(alice).claim([n]); // settles on the way
      await expect(rounds.settle(n)).to.be.revertedWithCustomError(rounds, "AlreadySettled");
      await expect(rounds.connect(alice).claim([n])).to.be.revertedWithCustomError(rounds, "NothingToClaim");
    });

    it("refunds a lone entry exactly, and identical entries exactly", async function () {
      const ctx = await loadFixture(baseFixture);
      const { rounds, alice, bob, carol } = ctx;
      const n = await openWeekdayRound(rounds);
      await setMoves(ctx, n, EXAMPLE_MOVES);
      await rounds.connect(alice).enter(n, 1, A, { value: ETH("0.03") });
      const m = n + 3; // rounds next to each other share a price window
      await time.increaseTo(m * P - W - P + 5);
      await setMoves(ctx, m, { NVDA: -3000, GOOGL: 600, ETH: 9000 });
      await rounds.connect(bob).enter(m, 1, B, { value: ETH("0.02") });
      await rounds.connect(carol).enter(m, 1, B, { value: ETH("0.05") });
      await endRound(m);
      await expect(rounds.connect(alice).claim([n])).to.changeEtherBalance(alice, ETH("0.03"));
      await expect(rounds.connect(bob).claim([m])).to.changeEtherBalance(bob, ETH("0.02"));
      await expect(rounds.connect(carol).claim([m])).to.changeEtherBalance(carol, ETH("0.05"));
    });

    it("voids the round and refunds in full when a pool can no longer be read", async function () {
      const { rounds, pools, alice, bob, n } = await loadFixture(exampleRound);
      await endRound(n);
      await pools.ETH.setFailObserve(true);
      await expect(rounds.settle(n)).to.emit(rounds, "Settled");
      await expect(rounds.connect(alice).claim([n])).to.changeEtherBalance(alice, ETH("0.01"));
      await expect(rounds.connect(bob).claim([n])).to.changeEtherBalance(bob, ETH("0.02"));
      expect(await rounds.feesAccrued()).to.equal(0n);
    });

    it("refuses to settle with too little gas instead of voiding", async function () {
      const { rounds, n } = await loadFixture(exampleRound);
      await endRound(n);
      await expect(rounds.settle(n, { gasLimit: 250_000 })).to.be.reverted;
      expect((await rounds.rounds(n)).state).to.equal(0n);
      await rounds.settle(n);
    });

    it("reads a pool whose asset is token1 with the sign flipped", async function () {
      const ctx = await loadFixture(baseFixture);
      const { rounds, admin, usdg, factory, alice } = ctx;
      // Deploy until the asset sorts after USDG, so USDG is token0 and a higher pool tick means a lower asset price.
      let token;
      do token = await ethers.deployContract("MockERC20", ["F", "F", 18]);
      while (BigInt(token.target) < BigInt(usdg.target));
      const pool = await ethers.deployContract("MockOraclePool", [token, usdg, 500]);
      expect(await pool.token0()).to.equal(usdg.target);
      await factory.register(pool, token, usdg, 500);
      await rounds.connect(admin).setAsset(9, pool);
      expect((await rounds.assets(9)).flip).to.equal(true);
      await rounds.connect(admin).setSchema(7, [q(NOUL, 2, [9], [0], 12)]);
      await rounds.connect(admin).setSchedule(7, 7, 0);

      const n = await openWeekdayRound(rounds);
      // The asset rises 6 ticks, so the pool's tick falls 6.
      await pool.setTickAt(n * P - 2 * W, 0);
      await pool.setTickAt(n * P + P - W, -6);
      await rounds.connect(alice).enter(n, 7, pack([5000, 5000]), { value: ETH("0.001") });
      await endRound(n);
      await rounds.settle(n);
      const [up] = await rounds.answerOf(n);
      expect(unpack(up, 2)).to.deep.equal([7500, 2500]); // Yes 75%, as for NVDA +6 ticks
    });

    it("claims several rounds in one transfer", async function () {
      const ctx = await loadFixture(exampleRound);
      const { rounds, alice, n } = ctx;
      const m = n + 3;
      await time.increaseTo(m * P - W - P + 5);
      await setMoves(ctx, m, { NVDA: 600, GOOGL: 0, ETH: 0 });
      await rounds.connect(alice).enter(m, 1, A, { value: ETH("0.002") });
      await endRound(m);
      const [r1] = await (async () => {
        await rounds.settle(n);
        return rounds.previewPayout(n, alice);
      })();
      await expect(rounds.connect(alice).claim([n, m])).to.changeEtherBalance(alice, r1 + ETH("0.002"));
    });
  });

  describe("governance", function () {
    it("gives the deployer no role, the timelock admin and the guardian pause only", async function () {
      const { rounds, deployer, timelock, guardian } = await loadFixture(baseFixture);
      expect(await rounds.hasRole(await rounds.DEFAULT_ADMIN_ROLE(), timelock.target)).to.equal(true);
      expect(await rounds.hasRole(await rounds.DEFAULT_ADMIN_ROLE(), deployer.address)).to.equal(false);
      expect(await rounds.hasRole(await rounds.GUARDIAN_ROLE(), deployer.address)).to.equal(false);
      expect(await rounds.hasRole(await rounds.GUARDIAN_ROLE(), guardian.address)).to.equal(true);
      for (const call of [
        () => rounds.setLimits(1, 2, 3),
        () => rounds.setFeeBps(100),
        () => rounds.setSchedule(1, 2, 0),
        () => rounds.unpause(),
        () => rounds.pause(),
      ]) {
        await expect(call()).to.be.revertedWithCustomError(rounds, "AccessControlUnauthorizedAccount");
      }
    });

    it("never changes a defined card or asset", async function () {
      const { rounds, admin, pools } = await loadFixture(baseFixture);
      await expect(rounds.connect(admin).setSchema(1, WEEKDAY)).to.be.revertedWithCustomError(rounds, "InvalidSchema");
      await expect(rounds.connect(admin).setAsset(ASSET.ETH, pools.NVDA)).to.be.revertedWithCustomError(rounds, "InvalidAsset");
      await rounds.connect(admin).setSchema(3, [q(NOUL, 2, [ASSET.GOOGL], [5], 8)]);
      expect((await rounds.schema(3)).length).to.equal(1);
    });

    it("only registers USDG pools the factory vouches for", async function () {
      const { rounds, admin, usdg, factory } = await loadFixture(baseFixture);
      const t = await ethers.deployContract("MockERC20", ["X", "X", 18]);
      const rogue = await ethers.deployContract("MockOraclePool", [t, usdg, 500]);
      await expect(rounds.connect(admin).setAsset(9, rogue)).to.be.revertedWithCustomError(rounds, "InvalidAsset");
      const other = await ethers.deployContract("MockERC20", ["Y", "Y", 18]);
      const noUsdg = await ethers.deployContract("MockOraclePool", [t, other, 500]);
      await factory.register(noUsdg, t, other, 500);
      await expect(rounds.connect(admin).setAsset(9, noUsdg)).to.be.revertedWithCustomError(rounds, "InvalidAsset");
      await factory.register(rogue, t, usdg, 500);
      await rounds.connect(admin).setAsset(9, rogue);
    });

    it("delays a fee change 24h, caps it at 10%, and keeps each round's fee", async function () {
      const { rounds, admin, alice } = await loadFixture(baseFixture);
      await expect(rounds.connect(admin).setFeeBps(1001)).to.be.revertedWithCustomError(rounds, "InvalidConfig");
      await rounds.connect(admin).setFeeBps(1000);
      expect(await rounds.feeBps()).to.equal(500n);
      const n = await openWeekdayRound(rounds);
      await rounds.connect(alice).enter(n, 1, FLAT_WEEKDAY, { value: ETH("0.001") });
      await time.increase(24 * 3600);
      expect(await rounds.feeBps()).to.equal(1000n);
      expect((await rounds.rounds(n)).feeBps).to.equal(500n);
    });

    it("rejects a non-timelock admin and a deployer guardian", async function () {
      const ctx = await loadFixture(baseFixture);
      const { deployRounds } = require("./fixtures");
      const F = await ethers.getContractFactory("OddsRounds");
      await expect(deployRounds({ ...ctx, timelock: { target: ctx.multisig.address } })).to.be.revertedWithCustomError(F, "AdminNotTimelock");
      await expect(deployRounds({ ...ctx, guardian: ctx.deployer })).to.be.revertedWithCustomError(F, "InvalidConfig");
    });
  });
});
