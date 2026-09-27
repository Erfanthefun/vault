/* هسته‌ی Vault: دارایی‌ها، قیمت‌ها، دفتر عملیات، بهای تمام‌شده و تحلیل‌ها (منطق خالص و قابل تست) */
(function (root) {
  'use strict';
  const J = root.J;

  // هر دارایی به کوچک‌ترین واحدش ذخیره می‌شه (عدد صحیح) تا خطای اعشاری جمع نشه
  const ASSETS = {
    irr:  { name: 'ریال', unit: 'تومان', base: 10, dec: 0 },          // ذخیره به ریال، نمایش به تومان
    gold: { name: 'طلای آنلاین', unit: 'گرم', base: 1000, dec: 3 },   // میلی‌گرم
    bar:  { name: 'شمش طلا', unit: 'گرم', base: 1000, dec: 3 },       // میلی‌گرم
    usdt: { name: 'تتر', unit: 'USDT', fa: 'تتر', base: 1e6, dec: 2 },           // میکروتتر
    btc:  { name: 'بیت‌کوین', unit: 'BTC', fa: 'بیت‌کوین', base: 1e8, dec: 8 }         // ساتوشی
  };
  const ORDER = ['gold', 'bar', 'usdt', 'btc', 'irr'];

  // تبدیل متن ورودی به واحد پایه، بدون ضرب اعشاری (با رشته)
  function parseQty(text, asset) {
    const a = ASSETS[asset];
    const s = J.normDigits(text).replace(/٫/g, '.').replace(/[,\s٬]/g, '').trim();
    if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null;
    const [i, f = ''] = s.split('.');
    const decs = Math.round(Math.log10(a.base));
    const frac = (f + '0'.repeat(decs)).slice(0, decs);
    const n = Number((i || '0') + frac);
    return Number.isSafeInteger(n) ? n : null;
  }
  // نمایش مقدار با حذف صفرهای انتهایی
  function fmtQty(q, asset, maxDec) {
    const a = ASSETS[asset];
    if (asset === 'irr') return J.faNum(q / 10);
    const decs = Math.round(Math.log10(a.base)), neg = q < 0, abs = Math.abs(q);
    const i = Math.floor(abs / a.base), f = String(abs % a.base).padStart(decs, '0').slice(0, maxDec ?? a.dec).replace(/0+$/, '');
    return (neg ? '-' : '') + J.faNum(i) + (f ? '٫' + J.faDigits(f) : '');
  }

  // ---------- قیمت‌ها ----------
  // هر نمونه: { date, gold: ریال برای هر گرم ۱۸ عیار، usdt: ریال برای هر تتر، btc: تتر برای هر بیت‌کوین }
  const sortedPrices = state => state.prices.slice().sort((a, b) => a.date.localeCompare(b.date));
  function latestPrice(state) { const p = sortedPrices(state); return p.length ? p[p.length - 1] : null; }
  // قیمت در یک تاریخ: آخرین نمونه تا اون روز؛ اگه نبود، اولین نمونه‌ی بعدش
  function priceAt(state, date) {
    const p = sortedPrices(state); if (!p.length) return null;
    let best = null; for (const x of p) { if (x.date <= date) best = x; else break; }
    return best || p[0];
  }
  // ارزش ریالی یک واحد پایه از هر دارایی
  function unitRial(asset, P, settings) {
    if (asset === 'irr') return 1;
    if (!P) return null;
    const adj = 1 + ((settings && settings.barAdj) || 0) / 100;
    switch (asset) {
      case 'gold': return P.gold / 1000;
      case 'bar': return P.gold / 1000 * adj;
      case 'usdt': return P.usdt / 1e6;
      case 'btc': return P.btc * P.usdt / 1e8;
    }
    return null;
  }
  const valueRial = (asset, q, P, settings) => { const u = unitRial(asset, P, settings); return u === null ? null : q * u; };

  // ---------- دفتر عملیات ----------
  // عملیات: { id, date, type, loc, loc2?, out?: {a, q, pieces?}, in?: {a, q, pieces?}, cost?, proceeds?, note, created }
  //  cost: وقتی دارایی از بیرون وارد می‌شه (موجودی اولیه، واریز، خرید از حساب بانکی) — بهای تمام‌شده به ریال
  //  proceeds: وقتی دارایی فروخته و پولش به بیرون (حساب بانکی) می‌ره — مبلغ دریافتی به ریال
  const opSort = (a, b) => a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0);

  function replay(state, uptoDate, extraOp) {
    const ops = state.ops.concat(extraOp ? [extraOp] : []).filter(o => !uptoDate || o.date <= uptoDate).sort(opSort);
    const H = {}, pieces = {}, basis = {}, realized = { r: 0, u: 0, byAsset: {} }, flows = [], errors = [], idle = {};
    ORDER.forEach(a => { basis[a] = { q: 0, r: 0, u: 0 }; realized.byAsset[a] = 0; });
    const usdtAt = d => { const P = priceAt(state, d); return P ? P.usdt : null; };
    const hold = (loc, a) => ((H[loc] = H[loc] || {})[a] = (H[loc][a] || 0));
    for (const o of ops) {
      const u = usdtAt(o.date);
      let removed = { r: 0, u: 0 };
      if (o.out) {
        const { a, q } = o.out;
        hold(o.loc, a); H[o.loc][a] -= q;
        if (H[o.loc][a] < 0) errors.push({ op: o.id, loc: o.loc, asset: a, short: -H[o.loc][a] });
        const b = basis[a];
        const frac = b.q > 0 ? Math.min(1, q / b.q) : 0;
        removed = { r: b.r * frac, u: b.u * frac };
        b.q -= q; b.r -= removed.r; b.u -= removed.u;
        if (b.q <= 0) { b.q = Math.max(0, b.q); if (b.q === 0) { b.r = 0; b.u = 0; } }
        if (o.out.pieces) { const pl = pieces[o.loc] = pieces[o.loc] || {}; for (const w in o.out.pieces) pl[w] = (pl[w] || 0) - o.out.pieces[w]; }
      }
      if (o.proceeds != null && o.out && !o.in) { // فروش و خروج پول به حساب بانکی
        realized.r += o.proceeds - removed.r; realized.byAsset[o.out.a] += o.proceeds - removed.r;
        if (u) realized.u += o.proceeds / u - removed.u;
        flows.push({ date: o.date, r: -o.proceeds });
      } else if (o.out && !o.in && o.out.a === 'irr') { // برداشت ریال
        flows.push({ date: o.date, r: -o.out.q });
      }
      if (o.in) {
        const { a, q } = o.in, dest = o.loc2 || o.loc;
        hold(dest, a); H[dest][a] += q;
        const b = basis[a];
        if (o.cost != null) { // ورود از بیرون
          b.q += q; b.r += o.cost; if (u) b.u += o.cost / u;
          flows.push({ date: o.date, r: o.cost });
        } else if (a === 'irr' && o.out && o.out.a !== 'irr') { // فروش و ماندن ریال در همان محل
          b.q += q; b.r += q; if (u) b.u += q / u;
          realized.r += q - removed.r; realized.byAsset[o.out.a] += q - removed.r;
          if (u) realized.u += q / u - removed.u;
        } else { // خرید با ریالِ محل، تبدیل یا انتقال: بهای تمام‌شده منتقل می‌شه
          b.q += q; b.r += removed.r; b.u += removed.u;
        }
        if (a === 'irr') idle[dest] = o.date;
        if (o.in.pieces) { const pl = pieces[dest] = pieces[dest] || {}; for (const w in o.in.pieces) pl[w] = (pl[w] || 0) + o.in.pieces[w]; }
      }
    }
    // جمع هر دارایی در همه‌ی محل‌ها
    const totals = {}; ORDER.forEach(a => { totals[a] = 0; });
    for (const loc in H) for (const a in H[loc]) totals[a] += H[loc][a];
    return { H, pieces, basis, realized, flows, errors, idle, totals };
  }

  // ارزش کل و تفکیک‌ها با آخرین قیمت
  function portfolio(state) {
    const R = replay(state), P = latestPrice(state), S = state.settings;
    const assets = ORDER.map(a => {
      const q = R.totals[a], v = valueRial(a, q, P, S), b = R.basis[a];
      return { a, q, value: v, basisR: b.r, basisU: b.u,
        pnlR: v === null ? null : v - b.r, pnlU: v === null || !P ? null : v / P.usdt - b.u,
        avgUnit: b.q > 0 ? b.r / b.q : null };
    });
    const total = assets.reduce((s, x) => s + (x.value || 0), 0);
    const byLoc = state.locations.map(l => {
      const h = R.H[l.id] || {};
      const v = ORDER.reduce((s, a) => s + (valueRial(a, h[a] || 0, P, S) || 0), 0);
      return { loc: l, h, value: v, pieces: R.pieces[l.id] || {} };
    });
    const unreal = assets.reduce((s, x) => s + (x.pnlR || 0), 0);
    const unrealU = assets.reduce((s, x) => s + (x.pnlU || 0), 0);
    return { R, P, assets, total, byLoc, pnlR: unreal + R.realized.r, pnlU: unrealU + R.realized.u, unrealR: unreal, realized: R.realized };
  }

  // واحدهای سنجش: تومان، دلار (تتر)، گرم طلا
  function lens(rial, lensName, P) {
    if (rial === null || rial === undefined) return null;
    if (lensName === 'usd') return P ? rial / P.usdt : null;
    if (lensName === 'gold') return P ? rial / P.gold : null;
    return rial / 10;
  }

  // ریال‌هایی که یه جا مونده: از آخرین ورود ریال، و افت ارزش دلاریش
  function idleCash(state, todayStr, minDays) {
    const R = replay(state), P = latestPrice(state), out = [];
    for (const l of state.locations) {
      const q = (R.H[l.id] || {}).irr || 0, since = R.idle[l.id];
      if (q <= 0 || !since) continue;
      const days = J.diffDays(since, todayStr);
      if (days < (minDays || 0)) continue;
      const then = priceAt(state, since);
      const usdLoss = then && P ? 1 - then.usdt / P.usdt : null;
      out.push({ loc: l, q, since, days, usdLoss });
    }
    return out.sort((a, b) => b.q - a.q);
  }

  // «اگه جاش…»: همه‌ی پولی که وارد کردی، از همون روز در یه دارایی دیگه بود
  function whatIf(state) {
    const R = replay(state), P = latestPrice(state), S = state.settings;
    if (!P) return null;
    const alt = {};
    for (const a of ['gold', 'usdt', 'btc', 'irr']) {
      let units = 0, ok = true;
      for (const f of R.flows) {
        const Pd = priceAt(state, f.date), u = unitRial(a, Pd, S);
        if (!u) { ok = false; break; }
        units += f.r / u;
      }
      alt[a] = ok ? units * unitRial(a, P, S) : null;
    }
    const invested = R.flows.reduce((s, f) => s + f.r, 0);
    return { alt, invested, actual: portfolio(state).total };
  }

  // ارزش دارایی در هر تاریخی که قیمت ثبت شده
  function history(state) {
    const S = state.settings;
    return sortedPrices(state).map(P => {
      const R = replay(state, P.date);
      const total = ORDER.reduce((s, a) => s + (valueRial(a, R.totals[a], P, S) || 0), 0);
      return { date: P.date, total, P };
    }).filter((x, i, arr) => x.total > 0 || i === arr.length - 1);
  }

  // پیشرفت هدف‌ها: kind = gold (آنلاین + شمش، گرم) | usdt | btc | value (با واحد سنجش)
  function goalProgress(state, g) {
    const R = replay(state), P = latestPrice(state);
    let cur;
    if (g.kind === 'gold') cur = (R.totals.gold + R.totals.bar) / 1000;
    else if (g.kind === 'usdt') cur = R.totals.usdt / 1e6;
    else if (g.kind === 'btc') cur = R.totals.btc / 1e8;
    else cur = lens(portfolio(state).total, g.lens || 'toman', P);
    return { cur, target: g.target, ratio: g.target > 0 && cur !== null ? Math.min(1, cur / g.target) : 0 };
  }

  // ---------- پارسر پیام قیمت (تلگرام، سایت) ----------
  function parsePrices(raw, last) {
    const t = J.normDigits(raw || '').replace(/٫/g, '.');
    const num = s => Number(s.replace(/[,٬\s]/g, ''));
    const grab = re => { const m = t.match(re); return m ? num(m[m.length - 1]) : null; };
    let gold = grab(/(?:طلا|گرم)[^\n\d]{0,25}(?:18|۱۸)?[^\n\d]{0,20}?([\d][\d,٬]{3,})/);
    if (gold === null) gold = grab(/(?:18|۱۸)\s*عیار[^\n\d]{0,20}([\d][\d,٬]{3,})/);
    let usdt = grab(/(?:تتر|usdt|tether)[^\n\d]{0,20}([\d][\d,٬]{2,})/i);
    let btc = grab(/(?:بیت\s*‌?کوین|bitcoin|btc)[^\n\d$]{0,20}\$?\s*([\d][\d,٬.]{2,})/i);
    const out = {};
    // واحد: ریال یا تومان؛ نزدیک‌ترین به قیمت قبلی، وگرنه تومان فرض می‌شه
    const toRial = (v, prev) => {
      if (v === null || !isFinite(v) || v <= 0) return null;
      if (prev) return Math.abs(Math.log10(v / prev)) <= Math.abs(Math.log10(v * 10 / prev)) ? v : v * 10;
      return v * 10;
    };
    out.gold = toRial(gold, last && last.gold);
    out.usdt = toRial(usdt, last && last.usdt);
    if (btc !== null && btc > 0) {
      // اگه به تومان/ریال اومده بود (خیلی بزرگ)، با قیمت تتر به تتر تبدیل می‌شه
      const u = out.usdt || (last && last.usdt);
      out.btc = btc > 5e6 && u ? Math.round(toRial(btc, last && last.btc && last.usdt ? last.btc * last.usdt : null) / u) : btc;
    } else out.btc = null;
    return out;
  }

  root.V = { ASSETS, ORDER, parseQty, fmtQty, latestPrice, priceAt, unitRial, valueRial, replay, portfolio, lens,
    idleCash, whatIf, history, goalProgress, parsePrices, opSort };
})(typeof window !== 'undefined' ? window : globalThis);
