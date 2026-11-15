'use strict';
/* BB-Fade engine (pure functions). Same rules as the Colab tests:
   Bollinger(20,2, sample std) fade + EMA200 computed over a trailing 300-candle window, long/short, 4h, 1x,
   exit at the middle band, 15% emergency stop, cost per side. Signal at candle close, fill at that close. */
const H4 = 4 * 3600e3;
const DEFAULTS = { coins: ['DOGE','ETH','XRP','SOL','BTC','ADA','LINK','AVAX','LTC','TRX','BNB','DOT'],
  bbN: 20, bbK: 2, emaN: 200, win: 300, stop: 0.15, cost: 0.001, erCut: 0.083 };
const REG = ['BEAR-CHOP', 'BEAR-TREND', 'BULL-CHOP', 'BULL-TREND'];

function indicators(cl, c) {
  const n = cl.length, N = new Float64Array(n).fill(NaN), mid = N.slice(), up = N.slice(), lo = N.slice(), ema = N.slice();
  const a = 2 / (c.emaN + 1), W = c.win, w = new Float64Array(W);
  for (let j = 0; j < W; j++) w[j] = a * Math.pow(1 - a, W - 1 - j);
  w[0] = Math.pow(1 - a, W - 1);
  for (let i = 0; i < n; i++) {
    if (i >= c.bbN - 1) {
      let s = 0; for (let k = i - c.bbN + 1; k <= i; k++) s += cl[k];
      const m = s / c.bbN; let v = 0; for (let k = i - c.bbN + 1; k <= i; k++) v += (cl[k] - m) ** 2;
      const sd = Math.sqrt(v / (c.bbN - 1)); mid[i] = m; up[i] = m + c.bbK * sd; lo[i] = m - c.bbK * sd;
    }
    if (i >= W - 1) { let s = 0; for (let j = 0; j < W; j++) s += w[j] * cl[i - W + 1 + j]; ema[i] = s; }
  }
  return { mid, up, lo, ema };
}

/* BTC regime per candle: 0 BEAR-CHOP, 1 BEAR-TREND, 2 BULL-CHOP, 3 BULL-TREND, -1 unknown.
   bull = close above its 1200-candle (~200 day) average; trend = 30-day path straightness above erCut */
function btcRegime(cl, erCut) {
  const n = cl.length, out = new Int8Array(n).fill(-1), P = new Float64Array(n + 1), D = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { P[i + 1] = P[i] + cl[i]; D[i + 1] = D[i] + (i ? Math.abs(cl[i] - cl[i - 1]) : 0); }
  for (let i = 1199; i < n; i++) {
    const sma = (P[i + 1] - P[i - 1199]) / 1200, path = D[i + 1] - D[i - 179];
    if (!(path > 0)) continue;
    out[i] = (cl[i] > sma ? 2 : 0) + (Math.abs(cl[i] - cl[i - 180]) / path > erCut ? 1 : 0);
  }
  return out;
}

/* one closed candle i. st = open position or null. returns {st, trade?, opened?} */
function step(st, I, b, i, c) {
  const cl = b.c[i];
  if (st) {
    let r = null, why;
    if (st.side === 1 && b.l[i] <= st.ep * (1 - c.stop)) { r = -c.stop; why = 'stop'; }
    else if (st.side === -1 && b.h[i] >= st.ep * (1 + c.stop)) { r = -c.stop; why = 'stop'; }
    else if ((st.side === 1 && cl >= I.mid[i]) || (st.side === -1 && cl <= I.mid[i])) { r = st.side * (cl / st.ep - 1); why = 'mid'; }
    if (r === null) return { st };
    return { st: null, trade: Object.assign({}, st, { exitMs: b.t[i] + H4, xp: why === 'stop' ? st.ep * (1 - st.side * c.stop) : cl, outcome: why, r: r - 2 * c.cost }) };
  }
  if (isNaN(I.ema[i]) || isNaN(I.lo[i])) return { st: null };
  if (cl < I.lo[i] && cl > I.ema[i]) return { st: { side: 1, ep: cl, entryMs: b.t[i] + H4 }, opened: true };
  if (cl > I.up[i] && cl < I.ema[i]) return { st: { side: -1, ep: cl, entryMs: b.t[i] + H4 }, opened: true };
  return { st: null };
}
module.exports = { H4, DEFAULTS, REG, indicators, btcRegime, step };
