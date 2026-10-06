"use client";

import { useProtocol } from "@/hooks/useOdds";
import { explorer } from "@/lib/links";
import { shortAddress } from "@/lib/format";

export default function Safety() {
  const p = useProtocol();
  const d = p.d;
  const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
  const rows: [string, boolean | undefined, string][] = d
    ? [
        ["The deployer holds no admin role", p.deployerIsAdmin === undefined ? undefined : !p.deployerIsAdmin && !p.deployerBurnAdmin, "The wallet that deployed StockOdds has no power over it."],
        ["The game's admin is the 48h timelock", p.timelockIsAdmin, "Every change to cards, limits or fees is public on-chain for 48 hours before it can run."],
        ["Fees can only go to the burn", p.feeSink === undefined ? undefined : same(p.feeSink, d.burn), "The game sends fees to OddsBurn, which can only buy $ODDS and burn it."],
        ["Entries are open", p.paused === undefined ? undefined : !p.paused, "The guardian can pause new entries in an emergency. Settling and claiming can never be paused."],
      ]
    : [];
  return (
    <section className="page">
      <p className="eyebrow">Safety</p>
      <h1>Nobody can touch your stake</h1>
      <p className="lede">
        Stakes leave the game only as payouts or refunds to the wallets that staked. These checks are read live from the contracts.
      </p>
      {!d && (
        <div className="card notice">
          <p>StockOdds is not deployed on this network yet.</p>
        </div>
      )}
      <ul className="safety">
        {rows.map(([title, ok, detail]) => (
          <li key={title} className={ok === undefined ? "" : ok ? "ok" : "bad"}>
            <span className="mark">{ok === undefined ? "…" : ok ? "✓" : "✕"}</span>
            <div>
              <b>{title}</b>
              <p>{detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <h2>Built in</h2>
      <ul className="plain">
        <li><b>Cards never change mid-round.</b> A round keeps the questions and fee it had at its first entry, and defined cards are permanent.</li>
        <li><b>Only real pools.</b> Prices come from Uniswap v3 pools the Uniswap factory vouches for, quoted in USDG, that remember enough history.</li>
        <li><b>Void, not wrong.</b> If a price can&apos;t be read, the round is void and everyone gets their full stake back.</li>
        <li><b>Fee changes wait.</b> 48 hours in the timelock, plus 24 hours in the contract, and never above 10%.</li>
      </ul>
      {d && (
        <>
          <h2>Contracts</h2>
          <table className="addrs">
            <tbody>
              {(
                [
                  ["OddsRounds (the game)", d.rounds],
                  ["OddsBurn", d.burn],
                  ["Timelock (48h)", d.timelock],
                  ["Admin (proposes to the timelock)", d.roles.admin],
                  ["Guardian (pause only)", d.roles.guardian],
                  ["Keeper (settles, burns)", d.roles.keeper],
                ] as const
              ).map(([label, a]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>
                    <a className="num" href={explorer("address", a)} target="_blank" rel="noreferrer">
                      {shortAddress(a)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
