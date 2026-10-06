// Read-only launch checks. Sends nothing and never needs a private key.
// Env: ADMIN_MULTISIG, GUARDIAN_MULTISIG, KEEPER_ADDRESS, DEPLOYER_ADDRESS, ROBINHOOD_RPC_URL (optional).
const { ethers } = require("ethers");
const config = require("../config/robinhood.json");
const cards = require("../lib/cards");

const RPC = process.env.ROBINHOOD_RPC_URL || config.network.rpcUrl;
const MIN_DEPLOYER_ETH = ethers.parseEther(process.env.MIN_DEPLOYER_ETH || "0.01");

let failed = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const warn = (m) => console.log(`  warn  ${m}`);
const fail = (m) => {
  failed++;
  console.log(`  FAIL  ${m}`);
};

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, config.network.chainId, { staticNetwork: true });
  console.log("Network");
  const chainId = BigInt(await provider.send("eth_chainId", []));
  chainId === BigInt(config.network.chainId) ? ok(`chainId ${chainId} (Robinhood Chain)`) : fail(`chainId ${chainId}, expected ${config.network.chainId}`);

  console.log("Roles");
  const roles = {};
  for (const name of ["ADMIN_MULTISIG", "GUARDIAN_MULTISIG", "KEEPER_ADDRESS"]) {
    const v = process.env[name];
    if (!v || !ethers.isAddress(v)) {
      fail(`${name} is not set to an address`);
      continue;
    }
    roles[name] = ethers.getAddress(v);
    const isContract = (await provider.getCode(v)) !== "0x";
    const wantsContract = name !== "KEEPER_ADDRESS";
    if (wantsContract && !isContract && process.env.ALLOW_PLAIN_WALLETS === "1") ok(`${name} ${roles[name]} (plain wallet, allowed by ALLOW_PLAIN_WALLETS=1)`);
    else if (wantsContract && !isContract) fail(`${name} ${roles[name]} is a plain wallet; it must be a multisig (or set ALLOW_PLAIN_WALLETS=1)`);
    else ok(`${name} ${roles[name]}`);
  }
  if (new Set(Object.values(roles)).size !== Object.values(roles).length) fail("admin, guardian and keeper must be three different addresses");
  if (process.env.DEPLOYER_ADDRESS) {
    console.log("Deployer");
    const d = ethers.getAddress(process.env.DEPLOYER_ADDRESS);
    const bal = await provider.getBalance(d);
    bal >= MIN_DEPLOYER_ETH ? ok(`${d} holds ${ethers.formatEther(bal)} ETH`) : fail(`${d} holds ${ethers.formatEther(bal)} ETH, needs ${ethers.formatEther(MIN_DEPLOYER_ETH)}`);
    if (Object.values(roles).includes(d)) fail("the deployer is also one of the role addresses; deploy from a fresh wallet");
  }

  console.log("Uniswap and Pons");
  for (const [label, a] of [
    ["Uniswap v4 PoolManager", config.uniswap.poolManager],
    ["Uniswap v3 factory", config.uniswap.v3Factory],
    ["Pons hook", config.pons.hook],
    ["WETH", config.tokens.weth.address],
  ]) {
    (await provider.getCode(a)) !== "0x" ? ok(`${label} ${ethers.getAddress(a)}`) : fail(`${label}: no contract at ${a}`);
  }
  try {
    const weth = new ethers.Contract(config.tokens.weth.address, ["function symbol() view returns (string)"], provider);
    const sym = await weth.symbol();
    /WETH/i.test(sym) ? ok(`WETH symbol ${sym}`) : fail(`token at the WETH address calls itself ${sym}`);
  } catch {
    fail("WETH address does not answer symbol()");
  }

  console.log(`TWAP pools (each needs ${config.odds.minObservations} observations)`);
  const found = await cards.findPools(ethers, provider);
  for (const [sym, f] of Object.entries(found)) {
    const list = f.all.map((p) => `${p.fee / 10000}%: ${p.cardinality}`).join(", ") || "no USDG pool";
    if (f.best && f.best.cardinality >= config.odds.minObservations) ok(`${sym}: ${f.best.pool} (${f.best.fee / 10000}% fee, ${f.best.cardinality} observations) [${list}]`);
    else fail(`${sym}: no USDG pool deep enough [${list}]`);
  }
  if (!process.env.ODDS_TOKEN_ADDRESS) ok("no $ODDS yet: deploying first; after the Pons launch, ./set-token.sh sets it through the timelock");

  console.log(failed ? `\n${failed} check(s) failed. Fix them before deploying.` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Preflight could not finish:", e.shortMessage || e.message);
  process.exit(1);
});
