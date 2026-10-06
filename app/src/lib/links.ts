import { catalog } from "@/generated/catalog";

export const explorer = (kind: "address" | "tx" | "token", value: string) => `${catalog.explorer}/${kind}/${value}`;
export const tradeUrl = (token?: string | null) => process.env.NEXT_PUBLIC_ODDS_TRADE_URL || `${catalog.pons.tokenPageUrl}${token ?? ""}`;
/** Set NEXT_PUBLIC_X_URL in Vercel once the X account exists; the link stays hidden until then. */
export const X_URL = process.env.NEXT_PUBLIC_X_URL || "";
/** Set NEXT_PUBLIC_ODDS_CA after the Pons launch to show the contract address before the timelock connects it. */
export const ODDS_CA = (process.env.NEXT_PUBLIC_ODDS_CA || "") as `0x${string}` | "";
