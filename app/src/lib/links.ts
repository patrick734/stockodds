import { catalog } from "@/generated/catalog";

export const explorer = (kind: "address" | "tx" | "token", value: string) => `${catalog.explorer}/${kind}/${value}`;
export const tradeUrl = (token?: string | null) => process.env.NEXT_PUBLIC_ODDS_TRADE_URL || `${catalog.pons.tokenPageUrl}${token ?? ""}`;
/** Set NEXT_PUBLIC_X_URL in Vercel once the X account exists; the link stays hidden until then. */
export const X_URL = process.env.NEXT_PUBLIC_X_URL || "";
/** The $ODDS token on Pons, shown before the timelock connects it to OddsBurn. NEXT_PUBLIC_ODDS_CA overrides. */
export const ODDS_CA = (process.env.NEXT_PUBLIC_ODDS_CA || "0xd8075c235b1d846a08641aca75336326cd2e934a") as `0x${string}` | "";
