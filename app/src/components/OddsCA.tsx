"use client";

import { useState } from "react";
import { useProtocol } from "@/hooks/useOdds";
import { ODDS_CA, tradeUrl } from "@/lib/links";

/** The $ODDS contract address with copy and buy buttons, once known. */
export function OddsCA() {
  const p = useProtocol();
  const ca = p.oddsToken || ODDS_CA;
  const [copied, setCopied] = useState(false);
  if (!ca) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(ca);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <div className="ca">
      <span className="ca-label">$ODDS CA</span>
      <code className="ca-addr">{ca}</code>
      <span className="ca-actions">
        <button type="button" className="chip" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <a className="chip chip-accent" href={tradeUrl(ca)} target="_blank" rel="noreferrer">
          Buy on Pons ↗
        </a>
      </span>
    </div>
  );
}
