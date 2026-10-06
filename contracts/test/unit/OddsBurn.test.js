const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { ETH, ZERO, baseFixture } = require("./fixtures");

describe("OddsBurn", function () {
  // $ODDS trades against native ETH in a Pons-style pool at 1 ETH = 1,000,000 ODDS.
  async function burnFixture() {
    const ctx = await baseFixture();
    const odds = await ethers.deployContract("OddsToken", [ctx.pm, ETH(1_000_000_000)]);
    const key = { currency0: ZERO, currency1: odds.target, fee: 0, tickSpacing: 200, hooks: ctx.hook };
    await ctx.pm.setPool(key, ETH(1_000_000), ETH("0.000001"));
    await ctx.alice.sendTransaction({ to: ctx.burn, value: ETH(1) }); // fees arriving
    return { ...ctx, odds, key };
  }

  async function withToken() {
    const ctx = await burnFixture();
    await ctx.burn.connect(ctx.admin).setOddsToken(ctx.odds);
    return ctx;
  }

  it("buys $ODDS with fee ETH and burns all of it", async function () {
    const { burn, odds, keeper } = await loadFixture(withToken);
    const supply = await odds.totalSupply();
    const quoted = await burn.connect(keeper).burn.staticCall(ETH("0.25"), 0);
    expect(quoted).to.equal(ETH(250_000));
    await expect(burn.connect(keeper).burn(ETH("0.25"), quoted)).to.emit(burn, "Burned").withArgs(ETH("0.25"), ETH(250_000), ETH(250_000));
    expect(supply - (await odds.totalSupply())).to.equal(ETH(250_000));
    expect(await odds.balanceOf(burn)).to.equal(0n);
    expect(await ethers.provider.getBalance(burn)).to.equal(ETH("0.75"));
    expect(await burn.totalEthSpent()).to.equal(ETH("0.25"));
  });

  it("enforces keeper role, per-run cap, interval, minimum output and halt", async function () {
    const { burn, keeper, alice, guardian, admin } = await loadFixture(withToken);
    await expect(burn.connect(alice).burn(ETH("0.1"), 0)).to.be.revertedWithCustomError(burn, "AccessControlUnauthorizedAccount");
    await expect(burn.connect(keeper).burn(ETH("0.6"), 0)).to.be.revertedWithCustomError(burn, "OverLimit");
    await expect(burn.connect(keeper).burn(ETH("0.1"), ETH(100_001))).to.be.revertedWithCustomError(burn, "Shortfall");
    await burn.connect(keeper).burn(ETH("0.1"), ETH(100_000));
    await expect(burn.connect(keeper).burn(ETH("0.1"), 0)).to.be.revertedWithCustomError(burn, "TooSoon");
    await time.increase(3600);
    await burn.connect(guardian).halt();
    await expect(burn.connect(keeper).burn(ETH("0.1"), 0)).to.be.revertedWithCustomError(burn, "IsHalted");
    await expect(burn.connect(guardian).resume()).to.be.revertedWithCustomError(burn, "AccessControlUnauthorizedAccount");
    await burn.connect(admin).resume();
    await burn.connect(keeper).burn(ETH("0.1"), 0);
  });

  it("waits for $ODDS, which only the timelock can set, once", async function () {
    const { burn, odds, keeper, admin, deployer } = await loadFixture(burnFixture);
    await expect(burn.connect(keeper).burn(ETH("0.1"), 0)).to.be.revertedWithCustomError(burn, "TokenUnset");
    await expect(burn.connect(deployer).setOddsToken(odds)).to.be.revertedWithCustomError(burn, "AccessControlUnauthorizedAccount");
    await expect(burn.connect(admin).setOddsToken(deployer.address)).to.be.revertedWithCustomError(burn, "InvalidConfig");
    await burn.connect(admin).setOddsToken(odds);
    await expect(burn.connect(admin).setOddsToken(odds)).to.be.revertedWithCustomError(burn, "TokenAlreadySet");
  });

  it("has no way out for ETH except buying $ODDS, and burns $ODDS sent to it", async function () {
    const { burn, odds, admin, pm, alice } = await loadFixture(withToken);
    const fns = burn.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    for (const name of ["withdraw", "sweep", "rescue", "transfer"]) expect(fns).to.not.include(name);
    await ethers.provider.send("hardhat_setBalance", [pm.target, "0xDE0B6B3A7640000"]);
    await odds.connect(await ethers.getImpersonatedSigner(pm.target)).transfer(burn, ETH(5));
    const supply = await odds.totalSupply();
    await burn.connect(alice).burnHeld();
    expect(supply - (await odds.totalSupply())).to.equal(ETH(5));
    await expect(burn.connect(alice).unlockCallback("0x")).to.be.revertedWithCustomError(burn, "Unauthorized");
    void admin;
  });

  it("gives the deployer no role and checks its own setup", async function () {
    const { burn, deployer, timelock, pm, hook, guardian, keeper } = await loadFixture(burnFixture);
    for (const role of [await burn.DEFAULT_ADMIN_ROLE(), await burn.GUARDIAN_ROLE(), await burn.KEEPER_ROLE()]) {
      expect(await burn.hasRole(role, deployer.address)).to.equal(false);
    }
    expect(await burn.hasRole(await burn.DEFAULT_ADMIN_ROLE(), timelock.target)).to.equal(true);
    const F = await ethers.getContractFactory("OddsBurn");
    await expect(F.deploy(pm, hook, 0, 200, timelock, guardian.address, deployer.address, ETH(1), 3600)).to.be.revertedWithCustomError(F, "RoleCollision");
    await expect(F.deploy(pm, hook, 0, 200, timelock, guardian.address, keeper.address, ETH(11), 3600)).to.be.revertedWithCustomError(F, "InvalidConfig");
  });
});
