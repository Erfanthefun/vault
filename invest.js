/* هسته‌ی Vault: دارایی‌ها، قیمت‌ها، دفتر عملیات، بهای تمام‌شده و تحلیل‌ها (منطق خالص و قابل تست) */
(function (root) {
  'use strict';
  const J = root.J;

  // هر دارایی به کوچک‌ترین واحدش ذخیره می‌شه (عدد صحیح) تا خطای اعشاری جمع نشه
  const ASSETS = {
    irr:  { name: 'ریال', unit: 'تومان', base: 10, dec: 0 },          // ذخیره به ریال، نمایش به تومان
    gold: { name: 'طلای ۱۸ عیار', unit: 'گرم', base: 1000, dec: 3 },  // میلی‌گرم (طلای آنلاین/گرمی)
    bar:  { name: 'شمش طلا', unit: 'گرم', base: 1000, dec: 3 },       // میلی‌گرم، با قیمت طلای ۱۸
    silver: { name: 'نقره‌ی ۹۹۹', unit: 'گرم', base: 1000, dec: 3 },  // میلی‌گرم، عیار ۹۹۹
    usd:  { name: 'دلار', unit: 'USD', fa: 'دلار', base: 100, dec: 2 },  // سنت
    eur:  { name: 'یورو', unit: 'EUR', fa: 'یورو', base: 100, dec: 2 },  // سنت
    usdt: { name: 'تتر', unit: 'USDT', fa: 'تتر', base: 1e6, dec: 2 },           // میکروتتر
    btc:  { name: 'بیت‌کوین', unit: 'BTC', fa: 'بیت‌کوین', base: 1e8, dec: 8 }         // ساتوشی
  };
  const ORDER = ['gold', 'bar', 'silver', 'usd', 'eur', 'usdt', 'btc', 'irr'];
  const PRICE_KEYS = ['gold', 'silver', 'usd', 'eur', 'usdt', 'btc'];

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
  // هر نمونه: { date, gold/silver: ریال برای هر گرم، usd/eur/usdt: ریال برای هر واحد، btc: دلار برای هر بیت‌کوین }
  // هر ثبت قیمت، قیمت‌های واردنشده رو از ثبت قبلی به ارث می‌بره؛ پس آخرین نمونه همیشه کامل‌ترینه.
  const usdRate = P => P ? (P.usd || P.usdt || null) : null;   // نرخ دلار برای نمای دلاری
  const btcRate = P => P ? (P.usdt || P.usd || null) : null;   // بیت‌کوین با تتر معامله می‌شه
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
    const need = v => v > 0 ? v : null;
    switch (asset) {
      case 'gold': return need(P.gold) && P.gold / 1000;
      case 'bar': return need(P.gold) && P.gold / 1000 * adj;
      case 'silver': return need(P.silver) && P.silver / 1000;
      case 'usd': return need(P.usd) && P.usd / 100;
      case 'eur': return need(P.eur) && P.eur / 100;
      case 'usdt': return need(P.usdt) && P.usdt / 1e6;
      case 'btc': return need(P.btc) && need(btcRate(P)) && P.btc * btcRate(P) / 1e8;
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
    const usdtAt = d => usdRate(priceAt(state, d));
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
      } else if (o.out && !o.in && o.out.a === 'irr') { // برداشت ریال یا هدیه‌ی نقدی
        flows.push({ date: o.date, r: -o.out.q });
      } else if (o.out && !o.in && o.type === 'gift_out') { // هدیه دادم: ارزش روز از دارایی کم می‌شه، سود و زیانی محقق نمی‌شه
        const Pd = priceAt(state, o.date), ur = unitRial(o.out.a, Pd, state.settings);
        flows.push({ date: o.date, r: -(ur ? o.out.q * ur : removed.r) });
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
        pnlR: v === null ? null : v - b.r, pnlU: v === null || !usdRate(P) ? null : v / usdRate(P) - b.u,
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
    if (lensName === 'usd') return usdRate(P) ? rial / usdRate(P) : null;
    if (lensName === 'gold') return P && P.gold ? rial / P.gold : null;
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
      const usdLoss = usdRate(then) && usdRate(P) ? 1 - usdRate(then) / usdRate(P) : null;
      out.push({ loc: l, q, since, days, usdLoss });
    }
    return out.sort((a, b) => b.q - a.q);
  }

  // «اگه جاش…»: همه‌ی پولی که وارد کردی، از همون روز در یه دارایی دیگه بود
  function whatIf(state) {
    const R = replay(state), P = latestPrice(state), S = state.settings;
    if (!P) return null;
    const alt = {};
    for (const a of ['gold', 'silver', 'usd', 'eur', 'usdt', 'btc', 'irr']) {
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
    else if (ASSETS[g.kind] && g.kind !== 'irr') cur = R.totals[g.kind] / ASSETS[g.kind].base;
    else cur = lens(portfolio(state).total, g.lens || 'toman', P);
    return { cur, target: g.target, ratio: g.target > 0 && cur !== null ? Math.min(1, cur / g.target) : 0 };
  }

  // ---------- پارسر پیام قیمت (کانال‌های تلگرام، سایت‌ها) ----------
  // خط‌به‌خط: هر خط یک دارایی. عدد اولِ بعد از اسم دارایی برداشته می‌شه (درصدهای داخل پرانتز نادیده).
  const RULES = [
    { k: 'btc', re: /(بیت\s*کوین|bitcoin|\bbtc\b)/i },
    { k: 'usdt', re: /(تتر|\busdt\b|tether)/i },
    { k: 'gold', re: /(طلای?\s*18\s*عیار|طلای?\s*گرمی|گرم\s*طلا|طلای?\s*18(?!\d))/i, not: /(24\s*عیار|عیار\s*24|آب\s*شده|آبشده|انس|اونس|سکه|مثقال|ounce)/i },
    { k: 'silver', re: /(نقره|silver)/i, not: /(انس|اونس|ounce)/i },
    { k: 'eur', re: /(یورو|\beur\b|euro)/i, lead: true },
    { k: 'usd', re: /(دلار|\busd\b)/i, lead: true }
  ];
  // عیار (مثل «با عیار ۹۹۹»، «۷۵۰ عیار»، «نقره ۹۹۹:») عدد قیمت نیست
  const stripPurity = s => s.replace(/(?<![\d,.])\d{2,4}\s*عیار/g, ' ').replace(/(?:با\s*)?عیار\s*\d{2,4}(?![\d,.])/g, ' ').replace(/^\s*(?:750|900|925|950|995|999|9999)(?=\s*[:：\-–]|\s*$)/, ' ');
  const NUM = /\$?\s*(\d[\d,]*(?:\.\d+)?)/;
  const unitOf = (numMatch, tail) => /\$/.test(numMatch) || /^\s*(دلار|usd)/i.test(tail) ? 'usd' : /^\s*ریال/.test(tail) ? 'rial' : /^\s*تومان/.test(tail) ? 'toman' : null;
  const readNum = str => { const nm = str.match(NUM); if (!nm) return null; const val = Number(nm[1].replace(/,/g, ''));
    return val > 0 ? { val, unit: unitOf(nm[0], str.slice(nm.index + nm[0].length, nm.index + nm[0].length + 14)) } : null; };
  function parsePrices(raw, last) {
    const text = J.normDigits(raw || '').replace(/[\u200c]/g, ' ').replace(/٫/g, '.').replace(/[#_]/g, ' ');
    const found = {}, usdCands = [];
    let date = null;
    const dm = text.match(/(1[34]\d\d)\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (dm && +dm[2] >= 1 && +dm[2] <= 12 && +dm[3] >= 1 && +dm[3] <= 31) date = J.jStr(+dm[1], +dm[2], +dm[3]);
    const lines = text.split(/\n/).map(l => l.trim());
    const isKeyLine = l => RULES.some(r => { const m = l.match(r.re); return m && !(r.lead && /\d/.test(l.slice(0, m.index))); });
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]; if (!line) continue;
      for (const r of RULES) {
        const m = line.match(r.re); if (!m) continue;
        if (r.not && r.not.test(line)) break;
        // «دلار» و «یورو» فقط وقتی اسم دارایی‌ان که قبل از عدد بیان (نه واحدِ قیمت چیز دیگه)
        if (r.lead && /\d/.test(line.slice(0, m.index))) break;
        const cands = [];
        const same = readNum(stripPurity(line.slice(m.index + m[0].length)));
        if (same) cands.push(same);
        else { // قیمت در خط‌های بعدی (مثل «بیت‌کوین:» و بعد «۸۳٬۴۰۰ دلار» و «۲۰٬۱۸۷… تومان»)
          for (let k = li + 1; k < lines.length && k <= li + 3; k++) {
            const nl = lines[k]; if (!nl || isKeyLine(nl)) break;
            const c = readNum(stripPurity(nl)); if (c) cands.push(c);
          }
        }
        if (!cands.length) break;
        const side = /معامله/.test(line) ? 3 : /فروش/.test(line) ? 2 : /خرید/.test(line) ? 1 : 0;
        if (r.k === 'usd') { usdCands.push({ ...cands[0], side }); break; }
        if (r.k === 'btc') {
          const pick = cands.find(c => c.unit === 'usd') || cands[0];
          if (!found.btc || (pick.unit === 'usd' && found.btc.unit !== 'usd')) found.btc = pick;
          if (!found.btcToman) { const tc = cands.find(c => c.unit === 'toman' || c.unit === 'rial'); if (tc) found.btcToman = tc; }
          break;
        }
        if (!found[r.k]) found[r.k] = cands.find(c => c.unit !== 'usd') || cands[0];
        break;
      }
    }
    if (usdCands.length) {
      const trade = usdCands.find(c => c.side === 3), buy = usdCands.find(c => c.side === 1), sell = usdCands.find(c => c.side === 2);
      found.usd = trade || (buy && sell ? { val: (buy.val + sell.val) / 2, unit: buy.unit } : usdCands[0]);
    }
    // تبدیل به ریال: «ریال» یا «تومان» صریح؛ وگرنه نزدیک‌ترین به قیمت قبلی؛ وگرنه تومان
    const toRial = (f, prev) => {
      if (!f) return null;
      if (f.unit === 'rial') return Math.round(f.val);
      if (f.unit === 'toman') return Math.round(f.val * 10);
      // بدون واحد: کانال‌های قیمت تقریباً همیشه تومان می‌نویسن؛ ریال فقط وقتی که تومان بودن با قیمت قبلی جور نباشه و ریال جور باشه
      const within = (x, k) => x > 1 / k && x < k;
      if (prev && !within(f.val * 10 / prev, 5) && within(f.val / prev, 2)) return Math.round(f.val);
      return Math.round(f.val * 10);
    };
    const out = { date };
    for (const k of ['gold', 'silver', 'usd', 'eur', 'usdt']) out[k] = found[k] && found[k].unit !== 'usd' ? toRial(found[k], last && last[k]) : null;
    if (found.btc) {
      if (found.btc.unit === 'usd') out.btc = found.btc.val;
      else { const r = toRial(found.btc, last && last.btc && btcRate(last) ? last.btc * btcRate(last) : null), u = out.usdt || btcRate(last); out.btc = r && u ? Math.round(r / u) : null; }
    } else out.btc = null;
    return out;
  }

  // ---------- قیمت خودکار (فایل prices.json که دستیار GitHub از کانال تلگرام می‌سازه) ----------
  // قواعد: ثبت دستی هیچ‌وقت عوض نمی‌شه؛ ثبت خودکارِ یک روز فقط با پیام جدیدترِ همون روز عوض می‌شه؛
  // روزهایی که کاربر ثبت خودکارشون رو حذف کرده (skip) دوباره اضافه نمی‌شن؛ فقط ۱۴ روز اخیر؛
  // قیمتی که بیش از ۳ برابر با قبلی فرق داشته باشه رد می‌شه (احتمال خطای خواندن).
  const DATE_RE = /^1[34]\d\d\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  function cleanFeedItem(it) {
    if (!it || typeof it !== 'object' || !DATE_RE.test(it.date || '')) return null;
    const out = { date: it.date, time: TIME_RE.test(it.time || '') ? it.time : null, post: Number.isInteger(it.post) && it.post > 0 ? it.post : 0 };
    let n = 0;
    for (const k of PRICE_KEYS) {
      const v = it[k];
      if (typeof v === 'number' && isFinite(v) && v > 0 && v < 1e15) { out[k] = k === 'btc' ? Math.round(v * 100) / 100 : Math.round(v); n++; }
    }
    return n ? out : null;
  }
  function mergeAutoPrices(state, feed, todayStr, opts) {
    const res = { added: 0, updated: 0, rejected: 0, latest: null };
    if (!feed || !Array.isArray(feed.items) || !J) return res;
    const ap = (state.settings && state.settings.autoPrice) || {};
    const skip = new Set(Array.isArray(ap.skip) ? ap.skip : []);
    const days = (opts && opts.days) || 14, from = J.addDays(todayStr, -days);
    const items = feed.items.slice(0, 400).map(cleanFeedItem).filter(it => it && it.date <= todayStr && it.date >= from && !skip.has(it.date))
      .sort((a, b) => a.date.localeCompare(b.date) || a.post - b.post);
    for (const it of items) {
      const cur = state.prices.find(p => p.date === it.date);
      if (cur && !cur.auto) continue;                                   // دستی مقدمه
      const entered = {}; for (const k of PRICE_KEYS) if (it[k]) entered[k] = it[k];
      if (cur && cur.auto) {                                            // فقط پیام تازه‌تر یا ویرایش‌شده
        if (it.post < (cur.post || 0)) continue;
        if (it.post === (cur.post || 0) && (it.time || null) === (cur.time || null) && Object.keys(entered).every(k => cur[k] === entered[k])) continue;
      }
      const base = state.prices.filter(p => p.date < it.date).sort((a, b) => a.date.localeCompare(b.date)).pop() || {};
      if (Object.keys(entered).some(k => base[k] && (entered[k] / base[k] > 3 || entered[k] / base[k] < 1 / 3))) { res.rejected++; continue; }
      const rec = { date: it.date, auto: true };
      if (it.time) rec.time = it.time;
      if (it.post) rec.post = it.post;
      for (const k of PRICE_KEYS) if (entered[k] || base[k]) rec[k] = entered[k] || base[k];
      state.prices = state.prices.filter(p => p.date !== it.date).concat([rec]);
      state.prices.filter(p => p.date > it.date).forEach(p => { for (const k of PRICE_KEYS) if (!p[k] && rec[k]) p[k] = rec[k]; });
      if (cur) res.updated++; else res.added++;
      res.latest = rec;
    }
    return res;
  }

  root.V = { ASSETS, ORDER, PRICE_KEYS, usdRate, parseQty, fmtQty, latestPrice, priceAt, unitRial, valueRial, replay, portfolio, lens,
    idleCash, whatIf, history, goalProgress, parsePrices, opSort, cleanFeedItem, mergeAutoPrices };
})(typeof window !== 'undefined' ? window : globalThis);
