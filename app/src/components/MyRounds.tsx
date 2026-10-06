"use client";

import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { oddsRoundsAbi } from "@/generated/abis";
import { useMyRounds, useOpenRound } from "@/hooks/useOdds";
import { useDeployment } from "@/lib/deployment";
import { hourLabel, timing } from "@/lib/odds";
import { TxStatus, useTx } from "./Tx";

const fmt = (wei: bigint) => Number(formatEther(wei)).toLocaleString(undefined, { maximumFractionDigits: 6 });

export function MyRounds() {
  const { deployment, chainId } = useDeployment();
  const { isConnected } = useAccount();
  const r = useOpenRound();
  const { list, refetch } = useMyRounds(r.n);
  const tx = useTx();
  if (!isConnected || !deployment) return null;

  const rows = list.map((e) => {
    const ended = r.now >= timing(e.n).end;
    const status = e.claimed ? "Claimed" : e.state === 2 ? "Void: full refund" : e.state === 1 ? "Settled" : ended ? "Ended: ready to settle" : "In play";
    const claimable = !e.claimed && ended;
    return { ...e, ended, status, claimable };
  });
  const toClaim = rows.filter((x) => x.claimable).map((x) => BigInt(x.n));
  const owed = rows.filter((x) => x.claimable && x.state !== 0).reduce((a, x) => a + x.received, 0n);

  async function claim() {
    const ok = await tx.run("Claim", async () =>
      tx.writeContractAsync({ address: deployment!.rounds, abi: oddsRoundsAbi, chainId, functionName: "claim", args: [toClaim], gas: 3_000_000n })
    );
    if (ok) refetch();
  }

  return (
    <section className="card mine">
      <div className="mine-head">
        <h2>Your rounds</h2>
        <button className="btn btn-primary" disabled={!toClaim.length || tx.busy} onClick={claim}>
          {toClaim.length ? `Claim ${toClaim.length} round${toClaim.length > 1 ? "s" : ""}${owed ? ` · ${fmt(owed)} ETH` : ""}` : "Nothing to claim"}
        </button>
      </div>
      <TxStatus message={tx.busy ? undefined : tx.message} error={tx.error} />
      {!rows.length ? (
        <p className="muted">No entries in the last three days.</p>
      ) : (
        <table className="rounds-table">
          <thead>
            <tr>
              <th>Round</th>
              <th>Hour</th>
              <th>Stake</th>
              <th>Result</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const diff = x.state !== 0 && !x.claimed ? x.received - x.stake : null;
              return (
                <tr key={x.n}>
                  <td className="num">{x.n.toLocaleString()}</td>
                  <td>{hourLabel(x.n)}</td>
                  <td className="num">{fmt(x.stake)}</td>
                  <td className={`num ${diff === null ? "" : diff >= 0n ? "good" : "bad"}`}>
                    {diff === null ? "…" : `${diff >= 0n ? "+" : "−"}${fmt(diff >= 0n ? diff : -diff)}`}
                  </td>
                  <td>{x.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
