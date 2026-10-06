"use client";

import { useEffect, useState } from "react";
import { zeroAddress } from "viem";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { oddsBurnAbi, oddsRoundsAbi } from "@/generated/abis";
import { useDeployment } from "@/lib/deployment";
import { openRound } from "@/lib/odds";

/** Chain time in seconds, ticking every second: the device clock corrected by the latest block's timestamp. */
export function useNow() {
  const { chainId } = useDeployment();
  const client = usePublicClient({ chainId });
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!client) return;
    let stop = false;
    const sync = async () => {
      try {
        const b = await client.getBlock({ blockTag: "latest" });
        const o = Number(b.timestamp) - Date.now() / 1000;
        // Ignore small drift (blocks lag the clock by a second or two); correct a wrong device clock.
        if (!stop) setOffset(Math.abs(o) > 20 ? Math.round(o) : 0);
      } catch {}
    };
    sync();
    const id = setInterval(sync, 30_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [client]);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000) + offset);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offset]);
  return now;
}

/** The round taking entries now, its card, pot and limits, and the wallet's entry. */
export function useOpenRound() {
  const { deployment: d, chainId } = useDeployment();
  const { address } = useAccount();
  const now = useNow();
  const n = openRound(now);
  const r = d?.rounds;
  const { data, refetch } = useReadContracts({
    query: { enabled: Boolean(r), refetchInterval: 10_000 },
    contracts: r
      ? [
          { address: r, abi: oddsRoundsAbi, functionName: "schemaFor", args: [BigInt(n)], chainId },
          { address: r, abi: oddsRoundsAbi, functionName: "rounds", args: [BigInt(n)], chainId },
          { address: r, abi: oddsRoundsAbi, functionName: "minStake", chainId },
          { address: r, abi: oddsRoundsAbi, functionName: "maxStake", chainId },
          { address: r, abi: oddsRoundsAbi, functionName: "roundCap", chainId },
          { address: r, abi: oddsRoundsAbi, functionName: "feeBps", chainId },
          { address: r, abi: oddsRoundsAbi, functionName: "paused", chainId },
          { address: r, abi: oddsRoundsAbi, functionName: "entryOf", args: [BigInt(n), address ?? zeroAddress], chainId },
        ]
      : [],
  });
  const at = (i: number) => data?.[i]?.result;
  const round = at(1) as readonly [bigint, number, number, number, bigint] | undefined;
  const entry = at(7) as { stake: bigint; claimed: boolean; probs: bigint } | undefined;
  return {
    n,
    now,
    schemaId: at(0) as bigint | undefined,
    pot: round?.[4],
    entries: round?.[3],
    minStake: at(2) as bigint | undefined,
    maxStake: at(3) as bigint | undefined,
    roundCap: at(4) as bigint | undefined,
    feeBps: at(5) as number | undefined,
    paused: at(6) as boolean | undefined,
    entry: entry && entry.stake > 0n ? entry : undefined,
    refetch,
  };
}

export type MyRound = { n: number; stake: bigint; claimed: boolean; probs: bigint; state: number; schemaId: bigint; received: bigint; fee: bigint };

/** The wallet's entries in the last `lookback` rounds, with their state and what a claim would pay. */
export function useMyRounds(current: number, lookback = 72) {
  const { deployment: d, chainId } = useDeployment();
  const { address } = useAccount();
  const r = d?.rounds;
  const ns = Array.from({ length: lookback }, (_, i) => current - i).filter((x) => x > 0);
  const { data: entries, refetch } = useReadContracts({
    query: { enabled: Boolean(r && address), refetchInterval: 20_000 },
    contracts: r && address ? ns.map((n) => ({ address: r, abi: oddsRoundsAbi, functionName: "entryOf", args: [BigInt(n), address], chainId }) as const) : [],
  });
  const mine = ns.filter((_, i) => {
    const e = entries?.[i]?.result as { stake: bigint } | undefined;
    return e && e.stake > 0n;
  });
  const { data: details, refetch: refetch2 } = useReadContracts({
    query: { enabled: Boolean(r && address && mine.length), refetchInterval: 20_000 },
    contracts:
      r && address
        ? mine.flatMap((n) => [
            { address: r, abi: oddsRoundsAbi, functionName: "rounds", args: [BigInt(n)], chainId } as const,
            { address: r, abi: oddsRoundsAbi, functionName: "previewPayout", args: [BigInt(n), address], chainId } as const,
          ])
        : [],
  });
  const list: MyRound[] = mine.map((n, k) => {
    const e = entries![ns.indexOf(n)].result as { stake: bigint; claimed: boolean; probs: bigint };
    const rd = details?.[2 * k]?.result as readonly [bigint, number, number, number, bigint] | undefined;
    const pv = details?.[2 * k + 1]?.result as readonly [bigint, bigint] | undefined;
    return { n, stake: e.stake, claimed: e.claimed, probs: e.probs, state: rd ? Number(rd[2]) : 0, schemaId: rd?.[0] ?? 0n, received: pv?.[0] ?? 0n, fee: pv?.[1] ?? 0n };
  });
  return {
    list,
    refetch: async () => {
      await refetch();
      await refetch2();
    },
  };
}

/** Protocol figures for the Burn and Safety pages. */
export function useProtocol() {
  const { deployment: d, chainId } = useDeployment();
  const { data } = useReadContracts({
    query: { enabled: Boolean(d) },
    contracts: d
      ? [
          { address: d.burn, abi: oddsBurnAbi, functionName: "totalBurned", chainId },
          { address: d.burn, abi: oddsBurnAbi, functionName: "oddsToken", chainId },
          { address: d.burn, abi: oddsBurnAbi, functionName: "totalEthSpent", chainId },
          { address: d.burn, abi: oddsBurnAbi, functionName: "lastBurn", chainId },
          { address: d.rounds, abi: oddsRoundsAbi, functionName: "feesAccrued", chainId },
          { address: d.rounds, abi: oddsRoundsAbi, functionName: "feeBps", chainId },
          { address: d.rounds, abi: oddsRoundsAbi, functionName: "hasRole", args: [("0x" + "00".repeat(32)) as `0x${string}`, d.timelock], chainId },
          { address: d.rounds, abi: oddsRoundsAbi, functionName: "hasRole", args: [("0x" + "00".repeat(32)) as `0x${string}`, d.deployer], chainId },
          { address: d.rounds, abi: oddsRoundsAbi, functionName: "feeSink", chainId },
          { address: d.rounds, abi: oddsRoundsAbi, functionName: "paused", chainId },
          { address: d.burn, abi: oddsBurnAbi, functionName: "hasRole", args: [("0x" + "00".repeat(32)) as `0x${string}`, d.deployer], chainId },
        ]
      : [],
  });
  const r = (i: number) => data?.[i]?.result;
  return {
    d,
    totalBurned: r(0) as bigint | undefined,
    oddsToken: (r(1) as string | undefined) && r(1) !== "0x0000000000000000000000000000000000000000" ? (r(1) as `0x${string}`) : null,
    ethSpent: r(2) as bigint | undefined,
    lastBurn: r(3) as bigint | undefined,
    feesAccrued: r(4) as bigint | undefined,
    feeBps: r(5) as number | undefined,
    timelockIsAdmin: r(6) as boolean | undefined,
    deployerIsAdmin: r(7) as boolean | undefined,
    feeSink: r(8) as string | undefined,
    paused: r(9) as boolean | undefined,
    deployerBurnAdmin: r(10) as boolean | undefined,
  };
}
