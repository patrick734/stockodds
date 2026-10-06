// Reads the live TWAP pools exactly as OddsRounds will, for the last few hours, and prints each hour's moves and
// the chain's soft answers. Read-only, no key. Run it before deploying: it proves the pools answer observe() for
// the windows a round needs.
const { ethers } = require("ethers");
const config = require("../config/robinhood.json");
const cards = require("../lib/cards");
const score = require("../lib/score");

const RPC = process.env.RPC_URL || process.env.ROBINHOOD_RPC_URL || config.network.rpcUrl;
// PROBE_DEPLOYMENT=localhost reads the pools from a local deployment instead (for testing this script).
const LOCAL = process.env.PROBE_DEPLOYMENT && require(`../deployments/${process.env.PROBE_DEPLOYMENT}.json`);
const P = 3600;
const W = 300;
const POOL = [
  "function observe(uint32[]) view returns (int56[], uint160[])",
  "function token0() view returns (address)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
  const found = LOCAL
    ? Object.fromEntries(Object.entries(LOCAL.assets).map(([s, a]) => [s, { best: { pool: a.pool } }]))
    : await cards.findPools(ethers, provider);
  const usdg = LOCAL ? LOCAL.usdg : config.tokens.usdg.address;
  const now = (await provider.getBlock("latest")).timestamp;
  const ids = cards.assetIds();
  const card = (h) => {
    const how = (h + 72) % 168;
    const [a, b] = config.odds.weekdayHours;
    return how >= a && how <= b ? "weekday" : "weekend";
  };
  for (const [s, f] of Object.entries(found)) {
    const others = (f.all || []).map((p) => `${p.fee / 10000}%: ${p.cardinality} obs, liquidity ${p.liquidity}`).join("; ");
    console.log(`${s.padEnd(6)} ${f.best ? f.best.pool : "none"}${others ? `  [${others}]` : ""}`);
  }
  console.log("");
  const lastEnded = Math.floor(now / P) - 1; // the most recent hour that has fully ended
  for (let n = lastEnded; n > lastEnded - 4; n--) {
    const start = n * P;
    const end = start + P;
    const ago = [now - (start - W), now - start, now - (end - W), now - end];
    const moves = {};
    for (const [sym, f] of Object.entries(found)) {
      const pool = new ethers.Contract(f.best.pool, POOL, provider);
      try {
        const [c] = await pool.observe(ago);
        const d = Number(c[3] - c[2] - (c[1] - c[0]));
        const flip = (await pool.token0()).toLowerCase() === usdg.toLowerCase();
        moves[ids[sym]] = flip ? -d : d;
      } catch (e) {
        moves[ids[sym]] = null;
        console.log(`  ${sym}: observe failed (${e.shortMessage || e.message})`);
      }
    }
    const kind = card(n);
    const c = cards.schemas().find((s) => s.id === config.odds.cards[kind].id);
    const fmt = (sym) => {
      const d = moves[ids[sym]];
      return d === null ? `${sym} n/a` : `${sym} ${((Math.pow(1.0001, d / W) - 1) * 100).toFixed(3)}%`;
    };
    console.log(`Hour ${new Date(start * 1000).toISOString().slice(0, 16)} UTC (${kind} card): ${["NVDA", "GOOGL", "ETH"].map(fmt).join("  ")}`);
    if (Object.values(moves).some((m) => m === null)) continue;
    c.questions.forEach((q, i) => {
      const v = score.answerFor(q, moves).map(Number);
      const qc = config.odds.cards[kind].questions[i];
      const shown = q.kind === 2 ? v.map((x, j) => x - (j ? v[j - 1] : 0)).concat(10000 - v[v.length - 1]) : v;
      console.log(`    ${qc.key.padEnd(9)} ${shown.map((x) => `${(x / 100).toFixed(2)}%`).join(" / ")}`);
    });
  }
}

main().catch((e) => {
  console.error("Probe failed:", e.shortMessage || e.message);
  process.exit(1);
});
