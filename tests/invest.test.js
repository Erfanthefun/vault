const assert = require('assert');
require('../core.js'); require('../invest.js'); const V = globalThis.V;
let n = 0; const t = (name, fn) => { fn(); n++; };
const near = (a, b, eps = 1e-6) => assert(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

t('parseQty / fmtQty: exact integer base units', () => {
  assert.strictEqual(V.parseQty('0.0003', 'btc'), 30000);
  assert.strictEqual(V.parseQty('۱٫۵', 'gold'), 1500);
  assert.strictEqual(V.parseQty('19.9', 'usdt'), 19900000);
  assert.strictEqual(V.parseQty('1,250', 'usdt'), 1250000000);
  assert.strictEqual(V.parseQty('0.123456789', 'btc'), 12345678, 'truncates beyond 8 decimals');
  assert.strictEqual(V.parseQty('abc', 'btc'), null); assert.strictEqual(V.parseQty('', 'gold'), null);
  assert.strictEqual(V.fmtQty(30000, 'btc'), '۰٫۰۰۰۳'); assert.strictEqual(V.fmtQty(1500, 'gold'), '۱٫۵');
  assert.strictEqual(V.fmtQty(19900000, 'usdt'), '۱۹٫۹'); assert.strictEqual(V.fmtQty(10000, 'bar'), '۱۰');
});

const P1 = { date: '1405/06/01', gold: 60000000, usdt: 1000000, btc: 60000 };
const P2 = { date: '1405/07/01', gold: 66000000, usdt: 1100000, btc: 66000 };
let c = 0; const op = (o) => ({ id: 'o' + (++c), created: c, ...o });
const S = { settings: { barAdj: 0 }, prices: [P2, P1], locations: [{ id: 'ex', name: 'صرافی' }, { id: 'gp', name: 'پلتفرم طلا' }, { id: 'home', name: 'خانه' }, { id: 'wal', name: 'کیف پول' }],
  goals: [], ops: [
    op({ date: '1405/06/01', type: 'deposit', loc: 'ex', in: { a: 'irr', q: 100000000 }, cost: 100000000 }),
    op({ date: '1405/06/01', type: 'buy', loc: 'ex', out: { a: 'irr', q: 50000000 }, in: { a: 'usdt', q: 50e6 } }),
    op({ date: '1405/06/02', type: 'swap', loc: 'ex', out: { a: 'usdt', q: 20e6 }, in: { a: 'btc', q: 30000 } }),
    op({ date: '1405/06/10', type: 'sell', loc: 'ex', out: { a: 'usdt', q: 10e6 }, in: { a: 'irr', q: 10500000 } }),
    op({ date: '1405/06/05', type: 'buy', loc: 'gp', in: { a: 'gold', q: 1500 }, cost: 90000000 }),
    op({ date: '1405/06/06', type: 'open', loc: 'home', in: { a: 'bar', q: 10000, pieces: { 10: 1 } }, cost: 500000000 }),
    op({ date: '1405/06/20', type: 'transfer', loc: 'ex', loc2: 'wal', out: { a: 'usdt', q: 5e6 }, in: { a: 'usdt', q: 4.9e6 } }),
    op({ date: '1405/06/25', type: 'sell', loc: 'gp', out: { a: 'gold', q: 500 }, proceeds: 32000000 })
  ] };

t('prices: latest & priceAt', () => {
  assert.strictEqual(V.latestPrice(S).date, '1405/07/01');
  assert.strictEqual(V.priceAt(S, '1405/06/15').date, '1405/06/01'); assert.strictEqual(V.priceAt(S, '1405/05/01').date, '1405/06/01');
  near(V.unitRial('btc', P2, S.settings) * 1e8, 66000 * 1100000);
  near(V.unitRial('bar', P2, { barAdj: -2 }) * 1000, 66000000 * 0.98);
});
t('replay: holdings per location, pieces, no errors', () => {
  const R = V.replay(S);
  assert.deepStrictEqual(R.errors, []);
  assert.deepStrictEqual(R.H.ex, { irr: 60500000, usdt: 15e6, btc: 30000 });
  assert.strictEqual(R.H.wal.usdt, 4.9e6); assert.strictEqual(R.H.gp.gold, 1000); assert.strictEqual(R.H.home.bar, 10000);
  assert.deepStrictEqual(R.pieces.home, { 10: 1 });
});
t('replay: average cost basis in rial and dollars carries through swaps/transfers', () => {
  const B = V.replay(S).basis;
  near(B.usdt.r, 20000000); near(B.usdt.u, 20); near(B.btc.r, 20000000); near(B.btc.u, 20);
  near(B.gold.r, 60000000); near(B.bar.r, 500000000); near(B.irr.r, 60500000); near(B.irr.u, 60.5);
});
t('realized P&L: sell keeping rial in exchange & sell to bank', () => {
  const R = V.replay(S).realized;
  near(R.r, 2500000); near(R.u, 2.5); near(R.byAsset.usdt, 500000); near(R.byAsset.gold, 2000000);
});
t('portfolio totals, P&L and lenses', () => {
  const pf = V.portfolio(S);
  near(pf.total, 830170000);
  near(pf.unrealR, 169670000); near(pf.pnlR, 172170000);
  near(V.lens(pf.total, 'toman', pf.P), 83017000); near(V.lens(pf.total, 'usd', pf.P), 830170000 / 1100000);
  near(V.lens(pf.total, 'gold', pf.P), 830170000 / 66000000);
  const btc = pf.assets.find(x => x.a === 'btc'); near(btc.value, 21780000); near(btc.pnlU, 21780000 / 1100000 - 20);
  const irr = pf.assets.find(x => x.a === 'irr'); near(irr.pnlR, 0); assert(irr.pnlU < 0, 'idle rial loses in dollars');
});
t('idle cash & what-if', () => {
  const idle = V.idleCash(S, '1405/07/05', 7);
  assert.strictEqual(idle.length, 1); assert.strictEqual(idle[0].loc.id, 'ex'); assert.strictEqual(idle[0].days, 26); near(idle[0].usdLoss, 1 - 1 / 1.1);
  const w = V.whatIf(S);
  near(w.invested, 658000000); near(w.alt.gold, 658 / 60 * 66000000); near(w.alt.irr, 658000000);
});
t('negative balance is detected', () => {
  const R = V.replay(S, null, { id: 'bad', created: 99, date: '1405/07/02', type: 'sell', loc: 'ex', out: { a: 'btc', q: 99999 }, in: { a: 'irr', q: 1 } });
  assert.strictEqual(R.errors.length, 1); assert.strictEqual(R.errors[0].asset, 'btc');
});
t('history & goals', () => {
  const h = V.history(S); assert.strictEqual(h.length, 2); near(h[1].total, 830170000);
  near(V.goalProgress(S, { kind: 'gold', target: 22 }).cur, 11); near(V.goalProgress(S, { kind: 'gold', target: 22 }).ratio, 0.5);
  near(V.goalProgress(S, { kind: 'value', lens: 'usd', target: 1000 }).cur, 830170000 / 1100000);
});
t('price parser: user sample 1 (Nobitex channel)', () => {
  const { nobitex, market } = require('./samples.js');
  const r = V.parsePrices(nobitex, null);
  assert.strictEqual(r.usdt, 2354120, 'USDT toman→rial'); assert.strictEqual(r.btc, 84736, 'BTC in USD, not the toman line');
  assert.strictEqual(r.gold, 239016000, '18k gold, not 24k/آب‌شده/سکه'); assert.strictEqual(r.usd, null, 'oil/ounce "دلار" lines ignored');
  assert.strictEqual(r.eur, null); assert.strictEqual(r.silver, null); assert.strictEqual(r.date, '1405/07/05');
});
t('price parser: user sample 2 (market channel)', () => {
  const { market } = require('./samples.js');
  const r = V.parsePrices(market, { gold: 239016000, usd: 2350000 });
  assert.strictEqual(r.usd, 2355000, 'prefers the «معامله» line'); assert.strictEqual(r.gold, 239444090, '#طلا_گرمی without unit');
  assert.strictEqual(r.usdt, null); assert.strictEqual(r.btc, null);
});
t('price parser: unitless defaults to toman; rial only when clearly rial', () => {
  assert.strictEqual(V.parsePrices('طلا گرمی 23,944,409', { gold: 66000000 }).gold, 239444090, 'far from both → toman');
  assert.strictEqual(V.parsePrices('طلا گرمی 239,444,090', { gold: 239000000 }).gold, 239444090, 'matches previous in rial → rial');
  assert.strictEqual(V.parsePrices('طلا گرمی 23,944,409', { gold: 239000000 }).gold, 239444090, 'matches previous in toman → toman');
});
t('price parser: user sample 3 (bot message, multi-line BTC, silver 999)', () => {
  const { bot } = require('./samples.js');
  const r = V.parsePrices(bot, null);
  assert.deepStrictEqual([r.gold, r.silver, r.usd, r.eur, r.usdt, r.btc], [244245000, 5123600, 2431750, 2763800, 2425700, 83400.03]);
  // قیمت طلای ۲۴ عیار که با «۲۴» شروع نمی‌شه باید هنوز رد بشه؛ ۱۸ عیاری که قیمتش با ۲۴ شروع می‌شه نه
  assert.strictEqual(V.parsePrices('طلای ۲۴ عیار: 31,868,500 تومان', null).gold, null);
  assert.strictEqual(V.parsePrices('طلای ۱۸ عیار: 24,000,000 تومان', null).gold, 240000000);
  assert.strictEqual(V.parsePrices('نقره ۹۹۹: 512,360 تومان', null).silver, 5123600, 'purity right after keyword');
  assert.strictEqual(V.parsePrices('نقره ۹۲۵ عیار ۴۸۰٬۰۰۰ تومان', null).silver, 4800000);
  assert.strictEqual(V.parsePrices('بیت‌کوین:\n20,187,222,733 تومان', { usdt: 2425700 }).btc, Math.round(201872227330 / 2425700), 'toman-only BTC on next line');
  assert.strictEqual(V.parsePrices('بیت‌کوین:\nتتر: 242,570 تومان', null).btc, null, 'does not steal the next asset\'s price');
});
t('price parser: other formats', () => {
  const r = V.parsePrices('یورو: ۲۷۰,۰۰۰ تومان\nنقره: 450,000\nدلار آزاد خرید 230000\nدلار آزاد فروش 232000\nبیت کوین ۱۹,۸۰۰,۰۰۰,۰۰۰ تومان\nتتر ۲۳۰۰۰۰۰ ریال', { usdt: 2300000 });
  assert.strictEqual(r.eur, 2700000); assert.strictEqual(r.silver, 4500000); assert.strictEqual(r.usd, 2310000, 'avg of buy/sell');
  assert.strictEqual(r.usdt, 2300000, 'explicit rial'); assert.strictEqual(r.btc, Math.round(198000000000 / 2300000), 'toman BTC converted via USDT');
  assert.deepStrictEqual(V.parsePrices('سلام', null), { date: null, gold: null, silver: null, usd: null, eur: null, usdt: null, btc: null });
});
t('new assets: USD cash, EUR, silver valuation; USD lens prefers dollar rate', () => {
  const P = { date: '1405/07/05', gold: 239016000, silver: 4500000, usd: 2355000, eur: 2700000, usdt: 2354120, btc: 84736 };
  near(V.unitRial('usd', P) * 100, 2355000); near(V.unitRial('silver', P) * 1000, 4500000); near(V.unitRial('btc', P) * 1e8, 84736 * 2354120);
  near(V.lens(2355000, 'usd', P), 1); near(V.lens(2355000, 'usd', { usdt: 2354120 }), 2355000 / 2354120, 1e-9);
  assert.strictEqual(V.unitRial('eur', { usdt: 1 }), null, 'missing price → null, not NaN');
  assert.strictEqual(V.parseQty('100.5', 'usd'), 10050); assert.strictEqual(V.fmtQty(10050, 'usd'), '۱۰۰٫۵');
});
t('gifts: received gift gets day value as basis; given gift removes basis without realized P&L', () => {
  const P = { date: '1405/07/01', gold: 240000000, usdt: 2350000, btc: 84000 };
  const st = { settings: {}, prices: [P], locations: [{ id: 'h', name: 'خانه' }], goals: [], ops: [
    { id: 'g1', created: 1, date: '1405/07/01', type: 'gift_in', loc: 'h', in: { a: 'gold', q: 2000 }, cost: 480000000 },
    { id: 'g2', created: 2, date: '1405/07/02', type: 'gift_out', loc: 'h', out: { a: 'gold', q: 500 } }] };
  const R = V.replay(st);
  assert.strictEqual(R.totals.gold, 1500); near(R.basis.gold.r, 360000000); near(R.realized.r, 0);
  assert.deepStrictEqual(R.flows.map(f => Math.round(f.r)), [480000000, -120000000]);
  near(V.portfolio(st).pnlR, 0, 1e-9);
});
console.log(`vault core: ${n} test groups passed`);
