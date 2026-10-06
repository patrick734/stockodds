import { MyRounds } from "@/components/MyRounds";
import { OddsCA } from "@/components/OddsCA";
import { RoundCard } from "@/components/RoundCard";

export default function Play() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Hourly rounds · Robinhood Chain</p>
          <h1>
            Say your odds.
            <br />
            <span className="accent">Get paid for being right.</span>
          </h1>
          <p className="lede">
            Every hour, StockOdds asks a few questions about NVIDIA, Alphabet and ETH. You answer with probabilities and stake ETH. After the hour, the chain reads
            what happened from Uniswap prices and pays the better calibrated from the worse.
          </p>
          <ul className="checks">
            <li>No bookmaker: players pay players, and nobody takes a cut of a loss</li>
            <li>Answers come from 5-minute price averages, read by the contract itself</li>
            <li>No admin keys: every change waits 48 hours in a public timelock</li>
          </ul>
          <OddsCA />
        </div>
        <RoundCard />
      </section>
      <MyRounds />
      <section className="how">
        <div>
          <span className="step">1</span>
          <h3>Answer</h3>
          <p>Drag each option to how likely you think it is. Each question always adds up to 100%.</p>
        </div>
        <div>
          <span className="step">2</span>
          <h3>Stake</h3>
          <p>Stake 0.0005 to 0.1 ETH before entries close, five minutes before the hour starts.</p>
        </div>
        <div>
          <span className="step">3</span>
          <h3>Settle</h3>
          <p>After the hour the contract compares 5-minute price averages from the start and end of the hour.</p>
        </div>
        <div>
          <span className="step">4</span>
          <h3>Claim</h3>
          <p>Score above the room and you win from the others; below and you lose some of your stake. Claim any time.</p>
        </div>
      </section>
    </>
  );
}
