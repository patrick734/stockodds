"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount, useBalance } from "wagmi";
import { oddsRoundsAbi } from "@/generated/abis";
import { useOpenRound } from "@/hooks/useOdds";
import { useDeployment } from "@/lib/deployment";
import { cardById, countdown, hourLabel, pack, timing, toBasisPoints, unpack } from "@/lib/odds";
import { TxStatus, useTx } from "./Tx";

/** Flat weights: every option starts equal. Users drag, and each question is normalised to 100%. */
const flat = (k: number) => Array.from({ length: k }, () => 50);

export function RoundCard() {
  const { deployment, chainId } = useDeployment();
  const { address, isConnected } = useAccount();
  const r = useOpenRound();
  const card = cardById(r.schemaId);
  const t = timing(r.n);
  const [weights, setWeights] = useState<number[][]>([]);
  const [stake, setStake] = useState("0.01");
  const tx = useTx();
  const { data: balance } = useBalance({ address, chainId });

  // New round or new card: start from flat weights.
  useEffect(() => {
    if (card) setWeights(card.questions.map((q) => flat(q.options.length)));
  }, [card?.id, r.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const bp = useMemo(() => weights.map((w) => toBasisPoints(w)), [weights]);
  const mine = r.entry && card ? unpack(r.entry.probs, card) : null;

  let stakeWei: bigint | null = null;
  try {
    stakeWei = stake ? parseEther(stake as `${number}`) : null;
  } catch {
    stakeWei = null;
  }

  async function enter() {
    if (!deployment || !card || stakeWei === null) return;
    const ok = await tx.run("Enter round", async () =>
      tx.writeContractAsync({
        address: deployment.rounds,
        abi: oddsRoundsAbi,
        chainId,
        functionName: "enter",
        args: [BigInt(r.n), BigInt(card.id), pack(bp)],
        value: stakeWei!,
      })
    );
    if (ok) r.refetch();
  }

  const left = r.pot !== undefined && r.roundCap !== undefined ? r.roundCap - r.pot : undefined;
  let action = { label: "Enter round", disabled: false };
  if (!deployment) action = { label: "Not live on this network yet", disabled: true };
  else if (r.paused) action = { label: "Entries are paused", disabled: true };
  else if (!isConnected) action = { label: "Connect a wallet to play", disabled: true };
  else if (r.entry) action = { label: "You're in this round", disabled: true };
  else if (stakeWei === null || (r.minStake !== undefined && stakeWei < r.minStake) || (r.maxStake !== undefined && stakeWei > r.maxStake))
    action = { label: `Stake ${r.minStake ? formatEther(r.minStake) : "…"} to ${r.maxStake ? formatEther(r.maxStake) : "…"} ETH`, disabled: true };
  else if (left !== undefined && stakeWei > left) action = { label: "This round is full", disabled: true };
  else if (balance && stakeWei > balance.value) action = { label: "Not enough ETH", disabled: true };
  else if (tx.busy) action = { label: tx.message ?? "Working…", disabled: true };

  return (
    <div className="card round" aria-label="This hour's round">
      <div className="round-head">
        <div>
          <span className="eyebrow">Round {r.n.toLocaleString()} · {card?.name === "weekend" ? "ETH weekend card" : "Weekday card"}</span>
          <h2>{hourLabel(r.n)}</h2>
        </div>
        <div className="timer" title="Entries close five minutes before the hour, when the start price window begins.">
          <span>entries close in</span>
          <b className="num">{countdown(t.locks - r.now)}</b>
        </div>
      </div>

      {!card && <p className="muted">Loading this hour&apos;s card…</p>}
      {card &&
        card.questions.map((q, qi) => (
          <fieldset key={q.key} className="question" disabled={Boolean(r.entry)}>
            <legend>{q.text}</legend>
            {q.options.map((opt, j) => {
              const pct = (mine ? mine[qi][j] : (bp[qi]?.[j] ?? 0)) / 100;
              return (
                <label key={opt} className="opt">
                  <span className="opt-name">{opt}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={weights[qi]?.[j] ?? 50}
                    onChange={(e) =>
                      setWeights((w) => w.map((row, a) => (a === qi ? row.map((v, b) => (b === j ? Number(e.target.value) : v)) : row)))
                    }
                    aria-label={`${q.text} ${opt}`}
                  />
                  <span className="opt-bar" aria-hidden>
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  <b className="num">{pct.toFixed(pct % 1 ? 1 : 0)}%</b>
                </label>
              );
            })}
          </fieldset>
        ))}

      <div className="stake">
        <label>
          <span>Stake</span>
          <input inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value.trim().replace(",", "."))} disabled={Boolean(r.entry)} aria-label="Stake in ETH" />
          <span>ETH</span>
        </label>
        <span className="muted">
          Pot {r.pot !== undefined ? formatEther(r.pot) : "…"} ETH · {r.entries ?? "…"} {r.entries === 1 ? "entry" : "entries"}
        </span>
      </div>
      <button className="btn btn-primary wide big" disabled={action.disabled} onClick={enter}>
        {action.label}
      </button>
      <TxStatus message={tx.busy ? undefined : tx.message} error={tx.error} />
      <p className="fine">
        Better calibrated than the room? You win from the less calibrated. Fee: {r.feeBps !== undefined ? r.feeBps / 100 : 5}% of profit only, nothing on a
        loss, and it buys and burns $ODDS. You can lose stake.
      </p>
    </div>
  );
}
