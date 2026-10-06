// Deploys StockOdds. Every contract is configured in its constructor and governed by the 48h timelock from its first
// block: the deployer wallet ends with no role, no ownership and nothing pending.
//
//   Local demo (mocks, seeded):  npx hardhat run scripts/deploy.js
//   Fork dry run:                FORK=1 DEPLOY_LIVE=1 npx hardhat run scripts/deploy.js
//   Robinhood Chain:             npx hardhat run scripts/deploy.js --network robinhood
//
// Live deploys read from env: ADMIN_MULTISIG, GUARDIAN_MULTISIG, KEEPER_ADDRESS (ALLOW_PLAIN_WALLETS=1 allows plain
// wallets for admin and guardian), ODDS_TOKEN_ADDRESS (optional; usually set later with ./set-token.sh).
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const config = require("../config/robinhood.json");
const cards = require("../lib/cards");
const { verifyDeployment } = require("./verify");

const LIVE = network.name === "robinhood" || process.env.DEPLOY_LIVE === "1";
const REAL_ROLES = network.name === "robinhood" || (LIVE && Boolean(process.env.ADMIN_MULTISIG));
const o = config.odds;
const eth = (n) => ethers.parseEther(String(n));

async function deploy(name, args = []) {
  const c = await ethers.deployContract(name, args);
  await c.waitForDeployment();
  console.log(`  ${name.padEnd(18)} ${await c.getAddress()}`);
  return c;
}

async function main() {
  const [deployer, ...rest] = await ethers.getSigners();
  const roles = REAL_ROLES
    ? { admin: required("ADMIN_MULTISIG"), guardian: required("GUARDIAN_MULTISIG"), keeper: required("KEEPER_ADDRESS") }
    : { admin: rest[0].address, guardian: rest[1].address, keeper: rest[2].address };
  await checkRoles(roles, deployer.address);

  console.log(`Deploying StockOdds to ${network.name} from ${deployer.address}`);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const out = { network: network.name, chainId, deployer: deployer.address, roles, startBlock: await ethers.provider.getBlockNumber() };

  const env = LIVE ? await liveEnv() : await localEnv();
  Object.assign(out, { usdg: env.usdg, v3Factory: env.v3Factory, poolManager: env.poolManager, ponsHook: env.ponsHook, assets: env.assets });

  const timelock = await deploy("TimelockController", [o.timelockDelaySeconds, [roles.admin], [roles.admin], ethers.ZeroAddress]);
  out.timelock = await timelock.getAddress();

  const burn = await deploy("OddsBurn", [
    env.poolManager,
    env.ponsHook,
    config.pons.poolFee,
    config.pons.poolTickSpacing,
    out.timelock,
    roles.guardian,
    roles.keeper,
    eth(o.burn.maxEthPerRun),
    o.burn.minIntervalSeconds,
  ]);
  out.burn = await burn.getAddress();

  const rounds = await deploy("OddsRounds", [
    {
      admin: out.timelock,
      guardian: roles.guardian,
      v3Factory: env.v3Factory,
      usdg: env.usdg,
      feeSink: out.burn,
      feeBps: o.feeBps,
      minStake: eth(o.minStake),
      maxStake: eth(o.maxStake),
      roundCap: eth(o.roundCap),
      weekdaySchema: o.cards.weekday.id,
      weekendSchema: o.cards.weekend.id,
      weekdayHours: cards.weekdayBitmap(),
      assets: Object.entries(env.assets).map(([sym, a]) => ({ id: o.assets[sym].id, pool: a.pool })),
      schemas: cards.schemas(),
    },
  ]);
  out.rounds = await rounds.getAddress();
  out.oddsToken = null;
  if (!LIVE) {
    out.oddsTokenDemo = env.oddsToken; // local only: set through the impersonated timelock below
    await seedLocal(out, env, rest);
  }

  const label = network.name === "robinhood" ? "robinhood" : LIVE ? "fork" : network.name;
  const file = path.join(__dirname, "..", "deployments", `${label}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${path.relative(process.cwd(), file)}\n`);

  let failures;
  try {
    failures = await verifyDeployment(ethers, out, { requireMultisigs: REAL_ROLES && process.env.ALLOW_PLAIN_WALLETS !== "1" });
  } catch (e) {
    console.error(`\nThe contracts ARE deployed (${path.relative(process.cwd(), file)}), but verification could not finish:`);
    console.error(`  ${e.shortMessage || e.message}`);
    console.error("Do NOT deploy again. Run ./verify.sh to finish the checks.");
    process.exit(3);
  }
  if (failures) {
    console.error(`\n${failures} verification check(s) failed. Do not announce this deployment.`);
    process.exitCode = 1;
  }
}

async function checkRoles(roles, deployer) {
  const all = [roles.admin, roles.guardian, roles.keeper].map((a) => a.toLowerCase());
  if (new Set(all).size !== all.length) throw new Error("admin, guardian and keeper must be three different addresses");
  if (all.includes(deployer.toLowerCase())) throw new Error("the deployer must not hold any role: use a fresh wallet for deploying");
  if (REAL_ROLES && process.env.ALLOW_PLAIN_WALLETS !== "1") {
    for (const name of ["admin", "guardian"]) {
      if ((await ethers.provider.getCode(roles[name])) === "0x") throw new Error(`${name} ${roles[name]} must be a multisig contract, not a plain wallet`);
    }
  }
}

function required(name) {
  const v = process.env[name];
  if (!v || !ethers.isAddress(v)) throw new Error(`${name} must be set to an address for live deploys`);
  return ethers.getAddress(v);
}

async function liveEnv() {
  const found = await cards.findPools(ethers, ethers.provider);
  const assets = {};
  for (const [sym, f] of Object.entries(found)) {
    if (!f.best || f.best.cardinality < o.minObservations) {
      throw new Error(`${sym}: no USDG pool keeps ${o.minObservations} observations (best: ${f.best ? f.best.cardinality : "none"})`);
    }
    assets[sym] = { token: f.token, pool: f.best.pool, fee: f.best.fee, observations: f.best.cardinality };
    console.log(`  ${(sym + " pool").padEnd(18)} ${f.best.pool} (${f.best.fee / 10000}% fee, ${f.best.cardinality} observations)`);
  }
  return {
    usdg: config.tokens.usdg.address,
    v3Factory: ethers.getAddress(config.uniswap.v3Factory),
    poolManager: ethers.getAddress(config.uniswap.poolManager),
    ponsHook: ethers.getAddress(config.pons.hook),
    assets,
  };
}

// ---------------------------------------------------------------- local demo

const DEMO = { ETH: 2690, NVDA: 240, GOOGL: 348 };

async function localEnv() {
  console.log("Local demo: mock USDG, WETH, stock tokens, Uniswap v3 TWAP pools and a v4 pool for $ODDS");
  const usdg = await deploy("MockERC20", ["Global Dollar", "USDG", 6]);
  const factory = await deploy("MockV3Factory");
  const pm = await deploy("MockPoolManager");
  const ponsHook = "0x0000000000000000000000000000000000000044";
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const assets = {};
  for (const sym of Object.keys(o.assets)) {
    const token = await deploy("MockERC20", [sym === "ETH" ? "Wrapped Ether" : `${sym} Stock Token`, sym === "ETH" ? "WETH" : sym, 18]);
    const pool = await deploy("MockOraclePool", [token, usdg, 500]);
    await (await factory.register(pool, token, usdg, 500)).wait();
    // A flat price from two days ago; the demo keeper script can add moves.
    await (await pool.setTickAt(now - 2 * 86400, 0)).wait();
    assets[sym] = { token: await token.getAddress(), pool: await pool.getAddress(), fee: 500, observations: 10000, price: DEMO[sym] };
  }
  const oddsToken = await deploy("OddsToken", [await pm.getAddress(), eth(1_000_000_000)]);
  const key = { currency0: ethers.ZeroAddress, currency1: await oddsToken.getAddress(), fee: config.pons.poolFee, tickSpacing: config.pons.poolTickSpacing, hooks: ponsHook };
  await (await pm.setPool(key, eth(1_000_000), eth("0.000001"))).wait();
  return { usdg: await usdg.getAddress(), v3Factory: await factory.getAddress(), poolManager: await pm.getAddress(), ponsHook, assets, oddsToken: await oddsToken.getAddress() };
}

async function seedLocal(out, env) {
  // Local demo only: the timelock is impersonated to set $ODDS at once (on mainnet that waits 48h).
  await network.provider.send("hardhat_setBalance", [out.timelock, "0x56BC75E2D63100000"]);
  const tl = await ethers.getImpersonatedSigner(out.timelock);
  const burn = await ethers.getContractAt("OddsBurn", out.burn, tl);
  await (await burn.setOddsToken(env.oddsToken)).wait();
  out.oddsToken = env.oddsToken;
  delete out.oddsTokenDemo;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { main };
