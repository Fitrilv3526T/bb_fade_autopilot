# BB-Fade autopilot (paper trading)

Runs by itself on GitHub every 4 hours (right after each 4h candle closes). No server, no API keys, no browser needed.
It scans Binance public data for 12 coins, runs a paper account, and saves everything in this repo (`docs/data/`).
A web page (GitHub Pages) shows the results. **Paper trading only: it never places real orders.**

## The strategy (same rules as the Colab tests)
- Bollinger(20, 2σ) on 4h candles, plus EMA200 as the trend filter.
- **Long** when a candle closes below the lower band while above EMA200. **Short** when it closes above the upper band while below EMA200.
- Exit when price closes back at the middle band. Emergency stop at 15% against entry. 1x, no leverage. 0.1% cost per side.
- One position per coin. Every trade is tagged with the BTC regime at entry (BEAR/BULL x CHOP/TREND), so the page can show which regimes actually work live.

## Set up (about 10 minutes, once)
1. On github.com click **New repository**. Name it `bb-fade`, choose **Public**, click Create.
2. Click **uploading an existing file** and drag in everything from this folder (`.github`, `docs`, `scanner`, `config.json`, `README.md`), then **Commit changes**.
   - If the hidden `.github` folder does not upload: **Add file > Create new file**, type `.github/workflows/scan.yml` as the name and paste the content of that file.
3. **Settings > Pages**: Source = *Deploy from a branch*, Branch = `main`, folder = `/docs`, Save. Your page address appears there after a minute or two.
4. **Actions** tab: if GitHub asks, click *I understand my workflows, enable them*. Open **BB-Fade scan** and click **Run workflow**. The first run starts your paper account (it begins from now, with no old trades).
5. Open your Pages address and bookmark it. It updates by itself after every 4h candle.

## What the page shows
Three paper books, each as an index starting at 100: (1) the Z.ai bot (DOGE only, all-in), (2) all 12 coins at 10% of the account per trade, (3) the same 12 coins but only in the two BTC TREND regimes (the ones that held up in the Colab test). Plus results by regime, by coin, open positions, and the last 30 trades.

## How to judge it
Wait for **50+ closed trades** (with 12 coins this takes a few weeks) and look at more than one kind of market. Compare book (3) against book (2): if the TREND-only book is not clearly better live, the regime idea was a story. Do not put real money in before that.

## Settings
Edit `config.json` on GitHub: `coins`, `cost` (per side, 0.001 = 0.1%), `stop`. To restart the paper account from today, delete the `startMs` line and also delete `docs/data/state.json` and `docs/data/trades.json`.

## Optional phone alerts (Telegram)
Create a bot with @BotFather, send it a message, find your chat id, then in the repo **Settings > Secrets and variables > Actions** add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. New paper entries are sent to you.

## Things to know
- GitHub may pause scheduled jobs after 60 days with no human activity in the repo. If the page says the data is old, open the Actions tab and re-enable the workflow. A missed run is caught up automatically on the next one.
- Uses Binance **spot** candles as a stand-in for futures (GitHub servers are in the US, where Binance futures is blocked). Funding on shorts is not included.
- Fills are at the signal candle's close price, as in the Colab tests. Real fills will differ a little.
- Verified before shipping: the engine gives trade-for-trade identical results to the Colab test code on the same data, re-running never creates duplicate trades, and catching up after a gap gives the same result as running continuously.
