# Launching StockOdds

Everything runs from the `stockodds` folder on your Mac. No step ever asks you to paste a private key into a file.
Copy the commands one block at a time.

## Wallets

Five different wallets. Create each one fresh in MetaMask (Add account > Create a new account).

| Wallet | What it does | Power after deploy |
|---|---|---|
| **Dev** | Pays the deploy gas and launches $ODDS on Pons. | **None.** The contracts refuse to deploy if it would keep any role. |
| **Admin** | Proposes changes to the 48h **timelock** (set $ODDS, fees, cards, limits). | Every change waits 48 hours in public. |
| **Guardian** | Can pause new entries and halt the burn. | Cannot unpause, change anything or move funds. |
| **Keeper** | Settles rounds, forwards fees, buys and burns $ODDS. Its key lives only in GitHub. | Capped, hourly burns. Cannot touch stakes. |

Admin, guardian, keeper and dev must be four different addresses.

## 1. Get the code

```bash
git clone https://github.com/patrick734/stockodds
```

```bash
cd stockodds/contracts && npm ci && npx hardhat test && cd ..
```

## 2. Save the wallets

First create the settings file from the template (the keeper tool writes into it):

```bash
cp -n launch.env.example launch.env
```

Before each import, select **that** account in MetaMask and copy **its** private key (Account details > Show private
key). The tool reads the clipboard, then clears it.

```bash
node tools/import-key.js stockodds-dev
```

```bash
node tools/import-key.js stockodds-admin
```

Check they are two different addresses:

```bash
node tools/wallet.js address stockodds-dev
```

```bash
node tools/wallet.js address stockodds-admin
```

If the admin import shows the dev address, re-copy the admin key and run `FORCE=1 node tools/import-key.js stockodds-admin`.

Then the keeper (creates its wallet and stores the key only in GitHub):

```bash
node tools/wallet.js keeper-secret
```

Fund: dev about 0.03 ETH, admin about 0.005 ETH, keeper 0.02 ETH, all on Robinhood Chain.

## 3. Settings

```bash
open -e launch.env
```

`KEEPER_ADDRESS` is already filled in. Fill in the rest and save:

```
ADMIN_MULTISIG=<admin address>
GUARDIAN_MULTISIG=<guardian address>
ALLOW_PLAIN_WALLETS=1
ADMIN_ACCOUNT=stockodds-admin
DEPLOYER_ACCOUNT=stockodds-dev
ROBINHOOD_RPC_URL=<your Alchemy URL, no # in front>
```

## 4. Check the pools, rehearse, deploy

```bash
./probe.sh
```

This reads the live Uniswap pools exactly as the game will and prints the last few hours' moves and answers.

```bash
./launch.sh --rehearsal
```

Must end with `REHEARSAL PASSED`. Then:

```bash
./launch.sh
```

Type `DEPLOY`, enter the dev wallet's password. Then:

```bash
git add -A && git commit -m "Mainnet deployment" && git push
```

```bash
./verify.sh
```

## 5. Keeper: turn it on right away

GitHub > Actions > **Keeper** > Run workflow. If the dry run looks healthy, set the repo variable `KEEPER_LIVE` to `1`
(Settings > Secrets and variables > Actions > Variables). The keeper settles every round within minutes of the hour.
A round left unsettled for about an hour can turn void, which refunds everyone in full.

## 6. Website

Vercel > Add New > Project > import `stockodds` > **Root Directory: `app`** > Deploy, then add your domain. Optional
environment variables: `NEXT_PUBLIC_X_URL` (your X profile link) and `NEXT_PUBLIC_ODDS_CA` (the $ODDS address).

## 7. $ODDS

Launch it on Pons from the dev wallet (website, or `./launch-token.sh` then `./launch-token.sh --launch`). Then:

```bash
./set-token.sh 0xTOKEN --schedule
```

48 hours later:

```bash
./set-token.sh 0xTOKEN --execute
```

`./govern.sh status` shows when it is ready. From then on the keeper buys and burns $ODDS with the fees.

## Troubleshooting

- **`missing end of string` or `command not found`:** you pasted a line with a `#` comment. Paste only the command.
- **`historical state is not available`:** the RPC dropped old state. Set `ROBINHOOD_RPC_URL` and run again.
- **`the deployer is also one of the role addresses`:** the dev wallet's address is in `ADMIN_MULTISIG`,
  `GUARDIAN_MULTISIG` or `KEEPER_ADDRESS`. Use different wallets.
