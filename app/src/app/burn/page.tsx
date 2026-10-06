"use client";

import { formatEther } from "viem";
import { OddsCA } from "@/components/OddsCA";
import { useProtocol } from "@/hooks/useOdds";
import { explorer } from "@/lib/links";

const n = (wei: bigint | undefined, d = 4) => (wei === undefined ? "…" : Number(formatEther(wei)).toLocaleString(undefined, { maximumFractionDigits: d }));

export default function Burn() {
  const p = useProtocol();
  return (
    <section className="page">
      <p className="eyebrow">$ODDS</p>
      <h1>Every win burns $ODDS</h1>
      <p className="lede">
        StockOdds keeps {p.feeBps !== undefined ? p.feeBps / 100 : 5}% of each winner&apos;s profit, and nothing from a loss. The fees go to OddsBurn, a contract
        with no withdraw function. A keeper uses them to buy $ODDS on its Pons pool and burns every token it buys. Runs are capped and at most hourly.
      </p>
      <OddsCA />
      <div className="stats">
        <div className="stat">
          <span>$ODDS burned</span>
          <b className="num">{n(p.totalBurned, 0)}</b>
        </div>
        <div className="stat">
          <span>ETH spent on burns</span>
          <b className="num">{n(p.ethSpent)}</b>
        </div>
        <div className="stat">
          <span>Fees waiting in the game</span>
          <b className="num">{n(p.feesAccrued)}</b>
        </div>
        <div className="stat">
          <span>Last burn</span>
          <b>{p.lastBurn ? new Date(Number(p.lastBurn) * 1000).toLocaleString() : "not yet"}</b>
        </div>
      </div>
      {p.d && !p.oddsToken && (
        <div className="card notice">
          <h3>Burns start once the timelock connects $ODDS</h3>
          <p>Connecting $ODDS to OddsBurn goes through the 48-hour public timelock, once and permanently. Until then, fees wait in the contract.</p>
        </div>
      )}
      {p.d && (
        <p className="muted">
          OddsBurn:{" "}
          <a className="num" href={explorer("address", p.d.burn)} target="_blank" rel="noreferrer">
            {p.d.burn}
          </a>
        </p>
      )}
    </section>
  );
}
