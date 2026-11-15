'use strict';
/* BB-Fade autopilot: runs on GitHub Actions every 4h. Public Binance data only, no keys. PAPER TRADING ONLY. */
const fs = require('fs'), path = require('path');
const C = require('./core.js'), { H4 } = C;
const ROOT = process.env.BB_ROOT || path.join(__dirname, '..'), DATA = path.join(ROOT, 'docs', 'data'), CFG = path.join(ROOT, 'config.json');
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function get(qs) {
  let err;
  for (const h of HOSTS) for (let t = 0; t < 3; t++) {
    try { const r = await fetch(`${h}/api/v3/klines?${qs}`); if (r.ok) return await r.json(); err = new Error('HTTP ' + r.status); if (r.status === 451 || r.status === 403) break; }
    catch (e) { err = e; } await sleep(800 * (t + 1));
  }
  throw err;
}
/* last n CLOSED 4h candles, oldest first */
async function bars(sym, n, now) {
  let rows = [], end = null;
  while (rows.length < n) {
    const part = await get(`symbol=${sym}USDT&interval=4h&limit=1000` + (end ? `&endTime=${end}` : ''));
    if (!part.length) break; rows = part.concat(rows); end = part[0][0] - 1; if (part.length < 1000) break;
  }
  rows = rows.filter(r => r[0] + H4 <= now).slice(-n);
  return { t: rows.map(r => r[0]), h: rows.map(r => +r[2]), l: rows.map(r => +r[3]), c: rows.map(r => +r[4]) };
}

async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  let user = {}; try { user = JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch (e) {}
  const cfg = Object.assign({}, C.DEFAULTS, user), now = Date.now();
  if (!cfg.startMs) { cfg.startMs = user.startMs = now; fs.writeFileSync(CFG, JSON.stringify(user, null, 2) + '\n'); log('paper account starts now'); }
  const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (e) { return d; } };
  const state = rd('state.json', { coins: {} }), trades = rd('trades.json', []);
  const btc = await bars('BTC', 2500, now), reg = C.btcRegime(btc.c, cfg.erCut), rIdx = new Map(btc.t.map((t, i) => [t, i]));
  const fresh = []; let newTrades = 0;
  for (const sym of cfg.coins) {
    try {
      const b = sym === 'BTC' ? btc : await bars(sym, 1500, now), I = C.indicators(b.c, cfg);
      const cs = state.coins[sym] || (state.coins[sym] = { lastMs: 0, pos: null });
      for (let i = 0; i < b.c.length; i++) {
        if (b.t[i] < cfg.startMs || b.t[i] <= cs.lastMs) continue;
        const r = C.step(cs.pos, I, b, i, cfg);
        if (r.opened) { const j = rIdx.get(b.t[i]); r.st.reg = j === undefined ? -1 : reg[j]; fresh.push(Object.assign({ sym }, r.st)); }
        if (r.trade) { trades.push(Object.assign({ sym }, r.trade)); newTrades++; }
        cs.pos = r.st; cs.lastMs = b.t[i];
      }
      const k = b.c.length - 1; Object.assign(cs, { price: b.c[k], mid: I.mid[k], up: I.up[k], lo: I.lo[k], ema: I.ema[k], candleMs: b.t[k] + H4 });
    } catch (e) { log(sym, 'failed:', e.message); }
  }
  const j = btc.c.length - 1;
  state.updatedMs = now; state.btc = { price: btc.c[j], reg: reg[j] };
  state.cfg = { startMs: cfg.startMs, cost: cfg.cost, stop: cfg.stop, erCut: cfg.erCut, bbN: cfg.bbN, bbK: cfg.bbK, emaN: cfg.emaN };
  fs.writeFileSync(path.join(DATA, 'state.json'), JSON.stringify(state));
  trades.sort((a, b) => a.exitMs - b.exitMs || (a.sym < b.sym ? -1 : 1));
  if (newTrades || !fs.existsSync(path.join(DATA, 'trades.json'))) {
    fs.writeFileSync(path.join(DATA, 'trades.json'), JSON.stringify(trades));
    fs.writeFileSync(path.join(DATA, 'trades.csv'), 'entry_utc,exit_utc,coin,side,entry,exit,outcome,net_return_pct,btc_regime\n' + trades.map(t =>
      [new Date(t.entryMs).toISOString(), new Date(t.exitMs).toISOString(), t.sym, t.side === 1 ? 'long' : 'short', t.ep, t.xp, t.outcome, (t.r * 100).toFixed(3), C.REG[t.reg] || 'unknown'].join(',')).join('\n') + '\n');
  }
  log(`${cfg.coins.length} coins, ${Object.values(state.coins).filter(c => c.pos).length} open, ${trades.length} closed (+${newTrades}), ${fresh.length} new entries`);
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (tok && chat && fresh.length) {
    const text = 'BB-Fade paper entries\n' + fresh.map(f => `${f.side === 1 ? 'LONG' : 'SHORT'} ${f.sym} @ ${f.ep}  [${C.REG[f.reg] || 'unknown'}]`).join('\n');
    try { await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) }); } catch (e) {}
  }
}
if (require.main === module) main().catch(e => { console.error('FAILED:', e); process.exit(1); });
module.exports = { main };
