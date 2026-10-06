#!/usr/bin/env node
// StockOdds keeper. One cycle:
//   1. settle: every ended round with entries that nobody settled yet (a round must be settled within about an
//      hour of its end, or its pools may no longer reach back and it turns void, refunding everyone)
//   2. flush:  sends accrued fees from the game to OddsBurn (anyone may call it)
//   3. burn:   buys $ODDS with fee ETH through its Pons pool and burns it (keeper only, capped, hourly)
// Every call is simulated first. DRY_RUN=1 (the default) only simulates and logs.
//
//   node src/index.js --once     one cycle (what GitHub Actions runs every 15 minutes)
//   node src/index.js            loop every LOOP_SECONDS (default 300)
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { logger } = require("./log");
const { roundsToCheck, burnAmount, minOut } = require("./plan");

const ROOT = path.join(__dirname, "..", "..");
const ROUNDS = [
  "function rounds(uint256) view returns (uint64 schemaId, uint16 feeBps, uint8 state, uint32 entries, uint128 pot)",
  "function settle(uint256)",
  "function feesAccrued() view returns (uint256)",
  "function flushFees()",
  "error NotEnded(uint256 round)",
  "error AlreadySettled(uint256 round)",
  "error LowGas()",
];
const BURN = [
  "function oddsToken() view returns (address)",
  "function halted() view returns (bool)",
  "function lastBurn() view returns (uint64)",
  "function minInterval() view returns (uint32)",
  "function maxEthPerRun() view returns (uint256)",
  "function burn(uint256 ethIn, uint256 minOut) returns (uint256)",
  "error TooSoon()",
  "error OverLimit()",
  "error Shortfall(uint256 received, uint256 minimum)",
];

const log = logger("keeper");
const reason = (e) => (e?.revert?.name ? `${e.revert.name}(${e.revert.args.join(", ")})` : e?.shortMessage || e?.message || String(e)).split("\n")[0].slice(0, 300);

function load() {
  const network = process.env.KEEPER_NETWORK || "robinhood";
  const dep = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts", "deployments", `${network}.json`), "utf8"));
  const chain = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts", "config", "robinhood.json"), "utf8"));
  const cfgFile = path.join(__dirname, "..", process.env.KEEPER_CONFIG || "actions.config.json");
  const cfg = { settleLookbackRounds: 6, minFlushEth: "0.001", minBurnEth: "0.002", slippageBps: 500, ...JSON.parse(fs.readFileSync(cfgFile, "utf8")) };
  return { network, dep, chain, cfg, dryRun: process.env.DRY_RUN !== "0", once: process.argv.includes("--once") };
}

async function send(ctx, label, contract, fn, args, overrides = {}) {
  await contract[fn].staticCall(...args, { from: ctx.keeper, ...overrides });
  if (ctx.dryRun) return logger(label).info("simulated OK (dry run, not sent)");
  const tx = await contract.connect(ctx.signer)[fn](...args, overrides);
  logger(label).info("sent", { tx: tx.hash });
  const r = await tx.wait();
  logger(label).info(r.status === 1 ? "confirmed" : "REVERTED", { gasUsed: r.gasUsed });
}

async function settle(ctx) {
  const l = logger("settle");
  const now = (await ctx.provider.getBlock("latest")).timestamp;
  let done = 0;
  for (const n of roundsToCheck(now, ctx.cfg.settleLookbackRounds)) {
    // By index: "entries" would collide with the Result object's own entries() method.
    const [, , state, entries, pot] = await ctx.rounds.rounds(n);
    if (Number(state) !== 0 || Number(entries) === 0) continue;
    l.info("settling", { round: n, entries: Number(entries), pot: ethers.formatEther(pot) });
    try {
      await send(ctx, "settle", ctx.rounds, "settle", [n], { gasLimit: 3_000_000 });
      done++;
    } catch (e) {
      l.error("failed", { round: n, reason: reason(e) });
    }
  }
  if (!done) l.info("nothing to settle");
}

async function flush(ctx) {
  const fees = await ctx.rounds.feesAccrued();
  if (fees < ethers.parseEther(ctx.cfg.minFlushEth)) return logger("flush").info("fees below threshold", { eth: ethers.formatEther(fees) });
  logger("flush").info("forwarding fees to OddsBurn", { eth: ethers.formatEther(fees) });
  await send(ctx, "flush", ctx.rounds, "flushFees", []);
}

async function burn(ctx) {
  const l = logger("burn");
  if ((await ctx.burn.oddsToken()) === ethers.ZeroAddress) return l.info("$ODDS not set yet (./set-token.sh): fees wait in OddsBurn");
  if (await ctx.burn.halted()) return l.warn("halted by the guardian");
  const [last, interval, head, cap, balance] = await Promise.all([
    ctx.burn.lastBurn(),
    ctx.burn.minInterval(),
    ctx.provider.getBlock("latest"),
    ctx.burn.maxEthPerRun(),
    ctx.provider.getBalance(ctx.dep.burn),
  ]);
  const wait = Number(last) + Number(interval) - head.timestamp;
  if (wait > 0) return l.info(`next burn allowed in ${Math.ceil(wait / 60)} min`);
  const amount = burnAmount(balance, cap, ethers.parseEther(ctx.cfg.minBurnEth));
  if (!amount) return l.info("not enough fee ETH to burn yet", { eth: ethers.formatEther(balance) });
  let quoted;
  try {
    quoted = await ctx.burn.burn.staticCall(amount, 0, { from: ctx.keeper });
  } catch (e) {
    return l.warn("cannot buy $ODDS yet (is its Pons pool live?)", { reason: reason(e) });
  }
  const floor = minOut(quoted, ctx.cfg.slippageBps);
  l.info("buying and burning $ODDS", { eth: ethers.formatEther(amount), quoted: ethers.formatEther(quoted), minOut: ethers.formatEther(floor) });
  await send(ctx, "burn", ctx.burn, "burn", [amount, floor]);
}

async function cycle(ctx) {
  for (const [name, fn] of [
    ["settle", settle],
    ["flush", flush],
    ["burn", burn],
  ]) {
    try {
      await fn(ctx);
    } catch (e) {
      logger(name).error("failed", { reason: reason(e) });
    }
  }
}

async function main() {
  const { network, dep, chain, cfg, dryRun, once } = load();
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || chain.network.rpcUrl, undefined, { staticNetwork: true });
  const chainId = Number((await provider.getNetwork()).chainId);
  if (chainId !== Number(dep.chainId)) throw new Error(`RPC is on chain ${chainId}, deployment ${network}.json is on ${dep.chainId}`);
  let signer;
  let keeper = dep.roles.keeper;
  if (process.env.KEEPER_PRIVATE_KEY) {
    signer = new ethers.NonceManager(new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY, provider));
    keeper = await signer.getAddress();
  } else if (!dryRun) throw new Error("KEEPER_PRIVATE_KEY is required when DRY_RUN=0");
  const ctx = { dep, cfg, dryRun, provider, signer, keeper, rounds: new ethers.Contract(dep.rounds, ROUNDS, provider), burn: new ethers.Contract(dep.burn, BURN, provider) };
  log.info("start", { network, chainId, keeper, mode: dryRun ? "DRY_RUN (simulate only)" : "LIVE" });
  for (;;) {
    await cycle(ctx);
    if (once) break;
    await new Promise((r) => setTimeout(r, Number(process.env.LOOP_SECONDS || 300) * 1000));
  }
}

if (require.main === module) {
  main().catch((e) => {
    log.error("fatal", { reason: reason(e) });
    process.exit(1);
  });
}
