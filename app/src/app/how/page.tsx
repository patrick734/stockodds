import { catalog } from "@/generated/catalog";

export const metadata = { title: "How StockOdds works" };

export default function How() {
  return (
    <section className="page prose">
      <p className="eyebrow">Rules</p>
      <h1>How a round works</h1>
      <p className="lede">
        One round every hour, every hour. You give probabilities, the chain reads what happened from Uniswap prices, and stakes move from the less calibrated
        to the better calibrated. Nobody runs the oracle and there is no house edge on losses.
      </p>

      <h2>Timing</h2>
      <ul>
        <li>
          <b>Entries</b> for the hour from <i>H</i> to <i>H</i>+1 open an hour before and close at <i>H</i> − 5 minutes. Nobody entering knows any part of the
          start price.
        </li>
        <li>
          <b>Start price:</b> the 5-minute average from <i>H</i> − 5 min to <i>H</i>. <b>End price:</b> the 5-minute average over the hour&apos;s last 5 minutes.
        </li>
        <li>
          <b>Settle:</b> anyone can settle once the hour ends; the keeper does it within minutes, and your claim settles it first if needed.
        </li>
        <li>
          <b>Claim</b> any time after: there is no deadline.
        </li>
      </ul>

      <h2>The questions</h2>
      <p>
        <b>Weekdays</b> (Monday 02:00 to Friday 23:00 UTC), while the stock market session keeps the stock pools busy:
      </p>
      <ul>
        {catalog.cards.weekday.questions.map((q) => (
          <li key={q.key}>{q.text}</li>
        ))}
      </ul>
      <p>
        <b>Weekends and nights outside the session:</b> ETH only, the deepest pool.
      </p>
      <ul>
        {catalog.cards.weekend.questions.map((q) => (
          <li key={q.key}>{q.text}</li>
        ))}
      </ul>

      <h2>Soft answers near the line</h2>
      <p>
        A hard line (“up if above zero”) is cheap to game in a quiet hour. So close calls are answered in shares: NVIDIA up 0.06% counts as 75% Yes, 25% No. To
        flip a clear answer, someone would have to hold the price a whole margin away for the full 5-minute window, against every arbitrageur.
      </p>

      <h2>Scoring and payouts</h2>
      <p>
        Each question is scored with a proper scoring rule (the Brier score, or the ranked probability score for the move-size buckets, which gives partial
        credit for a near miss). Your card score is the average. Then stakes are redistributed by weighted-score wagering:
      </p>
      <p className="formula">payout = stake × (1 + your score − the room&apos;s stake-weighted average score)</p>
      <ul>
        <li>Better than the room: you gain in proportion to your stake. Worse: you lose in proportion.</li>
        <li>If everyone answers the same, everyone gets their stake back. A lone entry is refunded exactly.</li>
        <li>Honesty pays: your expected payout is highest when you report what you really believe.</li>
        <li>
          Fee: {catalog.feeBps / 100}% of profit only, nothing on a loss or break-even. It buys $ODDS and burns it.
        </li>
        <li>
          Limits: {catalog.minStake} to {catalog.maxStake} ETH per entry, {catalog.roundCap} ETH per round, one entry per wallet per round.
        </li>
        <li>If a price can&apos;t be read when the round settles, the round is void and everyone is refunded in full, with no fee.</li>
      </ul>

      <h2>Risks</h2>
      <ul>
        <li>You can lose stake. A confident miss in a room of calibrated players can lose most of it.</li>
        <li>Answers come from prices traders can move. The soft answers, the 5-minute windows and the small caps make that costly, not impossible.</li>
        <li>Entries are public on-chain: later players can see earlier forecasts.</li>
        <li>The contracts have not had an external audit. Stake only what you can afford to lose.</li>
        <li>Forecast rounds with stakes may not be allowed where you live. Check before playing. Nothing here is financial advice.</li>
      </ul>
    </section>
  );
}
