// Builds OddsRounds constructor inputs (cards, schedule) from config/robinhood.json, and finds asset pools.
const config = require("../config/robinhood.json");

const KIND = { noul: 0, choice: 1, score: 2 };

function question(q, ids) {
  const pad = (a) => [...a, 0, 0, 0].slice(0, 3);
  if (q.kind === "noul") return { kind: 0, options: 2, assets: pad([ids[q.asset]]), lines: pad([q.line]), margin: q.margin, absMove: false };
  if (q.kind === "choice") return { kind: 1, options: q.assets.length, assets: pad(q.assets.map((a) => ids[a])), lines: [0, 0, 0], margin: q.margin, absMove: false };
  return { kind: 2, options: q.lines.length + 1, assets: pad([ids[q.asset]]), lines: pad(q.lines), margin: q.margin, absMove: Boolean(q.abs) };
}

function assetIds() {
  return Object.fromEntries(Object.entries(config.odds.assets).map(([sym, a]) => [sym, a.id]));
}

function schemas() {
  const ids = assetIds();
  return Object.values(config.odds.cards).map((card) => ({ id: card.id, questions: card.questions.map((q) => question(q, ids)) }));
}

function weekdayBitmap() {
  const [from, to] = config.odds.weekdayHours;
  let b = 0n;
  for (let h = from; h <= to; h++) b |= 1n << BigInt(h);
  return b;
}

function tokenAddress(sym) {
  const t = config.odds.assets[sym].token;
  return t === "weth" ? config.tokens.weth.address : config.equityTokens[t].address;
}

const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];
const POOL_ABI = [
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns (uint128)",
];

/** For each asset, the asset/USDG Uniswap v3 pool keeping the most observations (all fee tiers checked). */
async function findPools(ethers, provider) {
  const factory = new ethers.Contract(config.uniswap.v3Factory, FACTORY_ABI, provider);
  const out = {};
  for (const sym of Object.keys(config.odds.assets)) {
    const token = tokenAddress(sym);
    const found = [];
    for (const fee of config.uniswap.v3Fees) {
      const pool = await factory.getPool(token, config.tokens.usdg.address, fee);
      if (pool === ethers.ZeroAddress) continue;
      const p = new ethers.Contract(pool, POOL_ABI, provider);
      const [slot0, liquidity] = await Promise.all([p.slot0(), p.liquidity()]);
      found.push({ pool, fee, cardinality: Number(slot0[3]), liquidity });
    }
    found.sort((a, b) => b.cardinality - a.cardinality || (b.liquidity > a.liquidity ? 1 : -1));
    out[sym] = { token, best: found[0] || null, all: found };
  }
  return out;
}

module.exports = { KIND, schemas, weekdayBitmap, assetIds, tokenAddress, findPools };
