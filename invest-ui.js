(function () {
  'use strict';
  const { ASSETS, ORDER } = V;
  const { faNum, faDigits, today, MONTHS } = J;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let uidN = 0;
  const uid = () => Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 6);
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- آیکون‌ها ----------
  const svg = d => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    right: svg('<path d="m9 5 7 7-7 7"/>'), left: svg('<path d="m15 5-7 7 7 7"/>'), x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'), down: svg('<path d="m6 9 6 6 6-6"/>'),
    buy: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'), sell: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    swap: svg('<path d="M7 7h11l-3-3M17 17H6l3 3"/>'), transfer: svg('<path d="M4 12h14M13 6l6 6-6 6"/>'),
    deposit: svg('<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M12 9v6M9.5 12.5 12 15l2.5-2.5"/>'),
    withdraw: svg('<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M12 15V9M9.5 11.5 12 9l2.5 2.5"/>'),
    open: svg('<path d="M4 7h16v12H4zM4 7l2-3h12l2 3M10 11h4"/>'), clock: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
    gift: svg('<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M4 13h16M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>')
  };

  // ---------- اتصال به پوسته‌ی اصلی (app.js) ----------
  let S;
  const save = () => App.save(), render = () => App.render();
  const toast = (...a) => App.toast(...a);
  const openSheet = (t, h, m) => App.openSheet(t, h, ov => { bindInputs(ov); if (m) m(ov); });
  const closeSheet = ov => App.closeSheet(ov), closeAll = () => App.closeAll(), once = (b, f) => App.once(b, f);
  let invTab = 'sum', opFilter = 'all';

  // ---------- قالب‌بندی ----------
  const lensName = () => S.settings.lens;
  const LENS = { toman: 'تومان', usd: 'دلار', gold: 'گرم طلا' };
  const dec = (x, d) => faDigits((+x.toFixed(d)).toString()).replace('.', '٫');
  function fmtLens(rial, lz = lensName(), withUnit = true) {
    const P = V.latestPrice(S), v = V.lens(rial, lz, P);
    if (v === null) return '—';
    let s;
    if (lz === 'toman') s = faNum(v);
    else if (lz === 'usd') s = Math.abs(v) >= 1000 ? faNum(v) : dec(v, 2);
    else s = Math.abs(v) >= 100 ? faNum(v) : dec(v, Math.abs(v) < 1 ? 3 : 2);
    return s + (withUnit ? ' ' + LENS[lz] : '');
  }
  function shortLens(v, lz = lensName()) { // v در واحد سنجش
    const a = Math.abs(v), sg = v < 0 ? '−' : '';
    if (lz === 'toman') { if (a >= 1e9) return sg + dec(a / 1e9, 1) + ' میلیارد'; if (a >= 1e6) return sg + dec(a / 1e6, a >= 1e8 ? 0 : 1) + ' م'; if (a >= 1e3) return sg + dec(a / 1e3, 0) + ' هزار'; return sg + faNum(a); }
    if (lz === 'usd') return sg + (a >= 1e3 ? dec(a / 1e3, 1) + 'K' : dec(a, 0)) + '$';
    return sg + dec(a, a >= 100 ? 0 : 1) + 'g';
  }
  const toman = rial => faNum(rial / 10) + ' تومان';
  const pct = (x, d = 1) => x === null || !isFinite(x) ? '—' : `<bdi dir="ltr">${x > 0 ? '+' : x < 0 ? '−' : ''}${dec(Math.abs(x * 100), d)}٪</bdi>`;
  const faUnit = a => ASSETS[a].fa || ASSETS[a].unit;
  const qtyStr = (q, a) => `${V.fmtQty(q, a)} <small>${faUnit(a)}</small>`;
  const qtyTxt = (q, a) => `${V.fmtQty(q, a)} ${faUnit(a)}`;
  const locName = id => (S.locations.find(l => l.id === id) || {}).name || 'محل حذف‌شده';
  const dateTitle = js => { const { y, m, d } = J.jParse(js); return `${faDigits(d)} ${MONTHS[m - 1]}${y !== J.jParse(today()).y ? ' ' + faDigits(y) : ''}`; };
  const ago = js => { const n = J.diffDays(js, today()); return n <= 0 ? 'امروز' : n === 1 ? 'دیروز' : `${faDigits(n)} روز پیش`; };

  // فیلدها
  function dateField(name, value) {
    const { y, m, d } = J.jParse(value || today()), cy = J.jParse(today()).y;
    let ys = ''; for (let i = Math.min(cy - 10, y); i <= Math.max(cy + 1, y); i++) ys += `<option value="${i}" ${i === y ? 'selected' : ''}>${faDigits(i)}</option>`;
    const ms = MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${n}</option>`).join('');
    let ds = ''; for (let i = 1; i <= 31; i++) ds += `<option value="${i}" ${i === d ? 'selected' : ''}>${faDigits(i)}</option>`;
    return `<div class="datef" data-date="${name}"><select data-p="d" aria-label="روز">${ds}</select><select data-p="m" aria-label="ماه">${ms}</select><select data-p="y" aria-label="سال">${ys}</select>
      <div class="chips"><button type="button" class="chip" data-setdate="0">امروز</button><button type="button" class="chip" data-setdate="-1">دیروز</button></div></div>`;
  }
  function readDate(root, name) {
    const w = $(`[data-date="${name}"]`, root), y = +$('[data-p=y]', w).value, m = +$('[data-p=m]', w).value;
    return J.jStr(y, m, Math.min(+$('[data-p=d]', w).value, J.monthLen(y, m)));
  }
  // مبلغ تومانی (عدد صحیح با جداکننده)
  const tomanInput = (name, rial, ph) => { const s = rial ? faNum(rial / 10) : ''; return `<div class="unitwrap"><input class="toman" name="${name}" inputmode="numeric" autocomplete="off" placeholder="${ph || '۰'}" value="${s}"><span>تومان</span></div>`; };
  const readToman = (root, name) => { const v = Number(J.normDigits($(`[name="${name}"]`, root).value).replace(/\D/g, '').slice(0, 14)); return (v || 0) * 10; };
  // مقدار دارایی (اعشاری)
  const qtyInput = (name, asset, q) => `<div class="unitwrap"><input class="qtyin" name="${name}" inputmode="decimal" autocomplete="off" placeholder="۰" value="${q ? V.fmtQty(q, asset) : ''}" data-asset="${asset}"><span>${ASSETS[asset].unit}</span></div>`;
  const readQty = (root, name, asset) => { const v = $(`[name="${name}"]`, root).value; return v.trim() ? V.parseQty(v.replace(/٬/g, ''), asset) : 0; };
  function bindInputs(root) {
    $$('input.toman', root).forEach(inp => inp.addEventListener('input', () => { const n = J.normDigits(inp.value).replace(/\D/g, '').slice(0, 14); inp.value = n ? faNum(Number(n)) : ''; }));
    $$('input.qtyin', root).forEach(inp => inp.addEventListener('input', () => { inp.value = J.normDigits(inp.value).replace(/[^\d.٫]/g, '').replace('.', '٫').replace(/٫(?=.*٫)/g, ''); }));
    $$('[data-setdate]', root).forEach(b => b.addEventListener('click', () => {
      const w = b.closest('[data-date]'), { y, m, d } = J.jParse(J.addDays(today(), +b.dataset.setdate));
      $('[data-p=y]', w).value = y; $('[data-p=m]', w).value = m; $('[data-p=d]', w).value = d;
    }));
  }
  const locOptions = (sel, filter) => S.locations.filter(filter || (() => true)).map(l => `<option value="${esc(l.id)}" ${l.id === sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('') + `<option value="__new">+ محل جدید…</option>`;
  const assetOptions = (list, sel) => list.map(a => `<option value="${a}" ${a === sel ? 'selected' : ''}>${ASSETS[a].name}</option>`).join('');
  function bindNewLoc(ov) {
    $$('select.locsel', ov).forEach(s => s.addEventListener('change', () => {
      if (s.value !== '__new') return;
      const name = (prompt('اسم محل جدید (مثلاً اسم صرافی یا پلتفرم):') || '').trim().slice(0, 40);
      if (!name) { s.value = s.options[0].value; return; }
      const l = { id: uid(), name }; S.locations.push(l); save();
      $$('select.locsel', ov).forEach(x => { const v = x === s ? l.id : x.value; x.innerHTML = locOptions(v); x.value = v; });
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }));
  }

  const lensSwitch = () => `<div class="lens" role="group" aria-label="واحد سنجش">${Object.entries({ toman: 'تومان', usd: 'دلار', gold: 'طلا' }).map(([k, n]) =>
    `<button data-act="lens" data-l="${k}" aria-pressed="${lensName() === k}">${n}</button>`).join('')}</div>`;

  function overviewHtml() {
    const t = today(), P = V.latestPrice(S), pf = V.portfolio(S), lz = lensName();
    const others = Object.keys(LENS).filter(k => k !== lz);
    const hasOps = S.ops.length > 0;
    const stale = P ? J.diffDays(P.date, t) : null;
    const idle = V.idleCash(S, t, 7);
    const onboarding = !P || !S.locations.length || !hasOps;
    const allocTotal = pf.assets.reduce((s, x) => s + Math.max(0, x.value || 0), 0) || 1;
    return `
    <section class="nw" aria-label="ارزش کل">
      <div class="nw-row">${lensSwitch()}</div>
      <p class="nw-label">ارزش کل دارایی</p>
      <p class="nw-num"><span id="nwNum">${P || !hasOps ? fmtLens(pf.total, lz, false) : '—'}</span><small>${LENS[lz]}</small></p>
      ${P ? `<p class="equiv">${others.map(k => `<b>${fmtLens(pf.total, k, false)}</b> ${LENS[k]}`).join(' یا ')}</p>` : ''}
      ${P && hasOps ? `<div class="pnl"><span class="${pf.pnlR >= 0 ? 'up' : 'down'}">سود و زیان تومانی: <bdi dir="ltr">${pf.pnlR >= 0 ? '+' : '−'}${faNum(Math.abs(pf.pnlR) / 10)}</bdi> تومان</span>
        <span class="${pf.pnlU >= 0 ? 'up' : 'down'}">دلاری: <bdi dir="ltr">${pf.pnlU >= 0 ? '+' : '−'}${dec(Math.abs(pf.pnlU), Math.abs(pf.pnlU) >= 100 ? 0 : 2)}</bdi> دلار</span></div>` : ''}
      <div class="seal ${stale !== null && stale >= 3 ? 'stale' : ''}"><span>${P ? `قیمت‌ها: <b>${ago(P.date)}</b>` : 'هنوز قیمتی ثبت نشده'}</span><button data-act="prices">به‌روزرسانی قیمت</button></div>
      ${P && hasOps && pf.assets.some(x => x.q > 0 && x.value === null) ? `<p class="nw-warn">قیمت ${pf.assets.filter(x => x.q > 0 && x.value === null).map(x => ASSETS[x.a].name).join('، ')} ثبت نشده و در جمع حساب نشده.</p>` : ''}
    </section>
    ${onboarding ? `<section class="box block"><h2>شروع کار</h2><p class="note">سه قدم تا اینکه گاوصندوقت پر بشه:</p><ol class="onb">
      <li class="${P ? 'done' : ''}"><span>قیمت‌های امروز: طلا، دلار، تتر، بیت‌کوین…</span><button class="btn small" data-act="prices">${P ? 'ویرایش' : 'ثبت'}</button></li>
      <li class="${S.locations.length ? 'done' : ''}"><span>محل‌های نگهداری: صرافی، پلتفرم طلا، کیف پول…</span><button class="btn small" data-act="locs">${S.locations.length ? 'ویرایش' : 'تعریف'}</button></li>
      <li class="${hasOps ? 'done' : ''}"><span>موجودی فعلی هر دارایی در هر محل</span><button class="btn small" data-act="op" data-type="open">ثبت</button></li></ol></section>` : ''}
    <nav class="qa4" aria-label="عملیات سریع">
      <button data-act="op" data-type="buy"><span class="qi">${IC.buy}</span>خرید</button>
      <button data-act="op" data-type="sell"><span class="qi">${IC.sell}</span>فروش</button>
      <button data-act="op" data-type="gift_in"><span class="qi">${IC.gift}</span>هدیه</button>
      <button data-act="opchooser"><span class="qi">${IC.plus}</span>بیشتر</button>
    </nav>
    ${idle.length ? `<section class="block"><h2>ریالِ بلااستفاده</h2>${idle.map(x => `<div class="notice">${IC.clock}<span><b>${toman(x.q)}</b> از ${ago(x.since)} در <b>${esc(x.loc.name)}</b> مونده.${x.usdLoss !== null && x.usdLoss > 0.001 ? ` در این مدت به دلار حدود <b>${dec(x.usdLoss * 100, 1)}٪</b> ارزش از دست داده.` : ''}</span></div>`).join('')}</section>` : ''}
    ${hasOps ? `<section class="block"><div class="block-head"><h2>ترکیب دارایی</h2></div>
      <div class="alloc" role="img" aria-label="ترکیب دارایی">${pf.assets.filter(x => x.value > 0).map(x => `<i class="k-${x.a}" style="width:${x.value / allocTotal * 100}%"></i>`).join('')}</div>
      <div class="legend">${pf.assets.filter(x => x.value > 0).map(x => `<span><i class="k-${x.a}"></i>${ASSETS[x.a].name} <b>${dec(x.value / allocTotal * 100, 0)}٪</b></span>`).join('')}</div></section>
    <section class="block"><h2>بر اساس محل</h2><ul class="ledger">${pf.byLoc.filter(x => ORDER.some(a => (x.h[a] || 0) !== 0)).sort((a, b) => b.value - a.value).map(x => `
      <li><button class="row" data-act="loc" data-id="${esc(x.loc.id)}"><i class="key" style="background:var(--gold)"></i>
        <span class="main"><strong>${esc(x.loc.name)}</strong><span>${ORDER.filter(a => x.h[a]).map(a => qtyTxt(x.h[a], a)).join('، ')}</span></span>
        <span class="side"><b>${fmtLens(x.value)}</b></span></button></li>`).join('')}</ul></section>` : ''}
    <section class="block"><div class="block-head"><h2>هدف‌ها</h2><button class="linkbtn" data-act="goal">+ هدف جدید</button></div>
      ${S.goals.length ? `<div class="box">${S.goals.map(g => { const gp = V.goalProgress(S, g); return `<div class="goal"><div class="gl"><strong>${esc(g.name)}</strong>
        <span>${goalCur(g, gp.cur)} از ${goalCur(g, g.target)}</span></div><div class="gmeter"><i style="width:${gp.ratio * 100}%"></i></div>
        <div class="gl"><span>${dec(gp.ratio * 100, 0)}٪</span><button class="linkbtn" data-act="goal" data-id="${esc(g.id)}">ویرایش</button></div></div>`; }).join('')}</div>`
        : `<p class="note">مثلاً «۵۰ گرم طلا تا عید» یا «۵ هزار دلار برای ماشین».</p>`}
    </section>`;
  }
  const goalUnit = g => g.kind === 'gold' ? 'گرم طلا' : g.kind === 'silver' ? 'گرم نقره' : ASSETS[g.kind] && g.kind !== 'irr' ? (ASSETS[g.kind].fa || ASSETS[g.kind].unit) : LENS[g.lens || 'toman'];
  const goalCur = (g, v) => v === null ? '—' : (g.kind === 'btc' ? dec(v, 4) : g.kind === 'value' && (g.lens || 'toman') === 'toman' ? faNum(v) : dec(v, v >= 100 ? 0 : 2)) + ' ' + goalUnit(g);

  function assetsHtml() {
    const pf = V.portfolio(S), P = pf.P, S2 = S.settings;
    const rows = pf.assets.filter(x => x.q !== 0 || pf.R.basis[x.a].q);
    return `
    <section class="block"><h2>دارایی‌ها به واحد خودشون</h2>
    ${rows.length ? `<ul class="ledger">${rows.map(x => {
      const pr = x.basisR > 0 && x.pnlR !== null ? x.pnlR / x.basisR : null;
      const prU = x.basisU > 0 && x.pnlU !== null ? x.pnlU / x.basisU : null;
      const unit = x.a !== 'irr' && x.avgUnit !== null ? x.avgUnit * ASSETS[x.a].base : null;
      return `<li><button class="row" data-act="asset" data-a="${x.a}"><i class="key k-${x.a}"></i>
        <span class="main"><strong>${ASSETS[x.a].name}</strong><span>${unit !== null ? `میانگین خرید: ${toman(unit)} هر ${faUnit(x.a)}` : x.a === 'irr' ? 'نقد در محل‌ها' : ''}</span>
        <span>${x.a !== 'irr' ? `تومانی <b class="${pr >= 0 ? 'pos' : 'neg'}">${pct(pr)}</b>، دلاری <b class="${prU >= 0 ? 'pos' : 'neg'}">${pct(prU)}</b>` : prU !== null ? `ارزش دلاری از زمان ورود: <b class="${prU >= 0 ? 'pos' : 'neg'}">${pct(prU)}</b>` : ''}</span></span>
        <span class="side"><b class="qty">${qtyStr(x.q, x.a)}</b><span>${fmtLens(x.value)}</span></span></button></li>`; }).join('')}</ul>
      <p class="note">درصدها سود یا زیان روی کاغذ نسبت به میانگین قیمت خریدن. سود محقق‌شده‌ی فروش‌ها در تب تحلیل هست.</p>`
      : `<p class="empty">هنوز دارایی‌ای ثبت نشده. از «موجودی اولیه» شروع کن.</p><button class="btn wide" data-act="op" data-type="open">ثبت موجودی اولیه</button>`}
    ${P && S2.barAdj ? `<p class="note">ارزش شمش با ${dec(S2.barAdj, 1)}٪ اختلاف نسبت به قیمت طلای ۱۸ عیار حساب می‌شه.</p>` : ''}</section>`;
  }

  const OPS = {
    buy: { t: 'خرید', ic: 'buy' }, sell: { t: 'فروش', ic: 'sell' }, swap: { t: 'تبدیل', ic: 'swap' }, transfer: { t: 'انتقال', ic: 'transfer' },
    deposit: { t: 'واریز ریال', ic: 'deposit' }, withdraw: { t: 'برداشت ریال', ic: 'withdraw' }, open: { t: 'موجودی اولیه', ic: 'open' },
    gift_in: { t: 'هدیه گرفتم', ic: 'gift' }, gift_out: { t: 'هدیه دادم', ic: 'gift' }
  };
  function opTitle(o) {
    const A = x => ASSETS[x.a].name;
    switch (o.type) {
      case 'buy': return `خرید ${A(o.in)}`; case 'sell': return `فروش ${A(o.out)}`; case 'swap': return `${A(o.out)} به ${A(o.in)}`;
      case 'transfer': return `انتقال ${A(o.out)}`; case 'open': return `موجودی اولیه‌ی ${A(o.in)}`;
      case 'gift_in': return `هدیه: ${A(o.in)}`; case 'gift_out': return `هدیه دادم: ${A(o.out)}`; default: return OPS[o.type].t;
    }
  }
  function opRow(o) {
    const where = o.type === 'transfer' ? `${locName(o.loc)} ← ${locName(o.loc2)}` : locName(o.loc);
    const outTxt = o.out ? qtyTxt(o.out.q, o.out.a) : o.cost != null && !['deposit', 'open', 'gift_in'].includes(o.type) ? toman(o.cost) + ' از حساب' : '';
    const inTxt = o.in ? qtyTxt(o.in.q, o.in.a) : o.proceeds != null ? toman(o.proceeds) + ' به حساب' : '';
    return `<li><button class="oprow" data-act="editop" data-id="${esc(o.id)}"><span class="opi ${OPS[o.type].ic}">${IC[OPS[o.type].ic]}</span>
      <span class="main"><strong>${opTitle(o)}</strong><span>${esc(where)}${o.note ? '، ' + esc(o.note) : ''}</span></span>
      <span class="flow">${outTxt ? `<span class="o">−${outTxt}</span>` : ''}${inTxt ? `<span class="n">+${inTxt}</span>` : ''}</span></button></li>`;
  }
  function opsHtml() {
    const list = S.ops.filter(o => opFilter === 'all' || o.type === opFilter || (opFilter === 'cash' && (o.type === 'deposit' || o.type === 'withdraw')) || (opFilter === 'gift' && o.type.startsWith('gift'))).sort((a, b) => V.opSort(b, a));
    const groups = {}; list.forEach(o => (groups[o.date] = groups[o.date] || []).push(o));
    return `
    <div class="chips seg" role="group" aria-label="فیلتر">${[['all', 'همه'], ['buy', 'خرید'], ['sell', 'فروش'], ['swap', 'تبدیل'], ['transfer', 'انتقال'], ['gift', 'هدیه'], ['cash', 'واریز/برداشت'], ['open', 'موجودی اولیه']].map(([k, n]) =>
      `<button class="chip ${opFilter === k ? 'on' : ''}" data-act="opf" data-f="${k}" aria-pressed="${opFilter === k}">${n}</button>`).join('')}</div>
    ${list.length ? Object.keys(groups).map(d => `<section class="day-group"><h3>${J.weekday(d)} ${dateTitle(d)}</h3><ul class="ledger">${groups[d].map(opRow).join('')}</ul></section>`).join('')
      : `<p class="empty">عملیاتی ثبت نشده.</p>`}
    <button class="fab" data-act="opchooser" aria-label="عملیات جدید">${IC.plus}</button>`;
  }

  // ---------- نمودارها ----------
  const W = 340, PR = 48, PL = 6, PT = 10, PB = 26;
  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * p >= v) return f * p; return 10 * p; }
  function lineChart({ labels, series, tips, H = 180, fmt, area }) {
    const n = labels.length, pw = W - PR - PL, ph = H - PT - PB;
    const all = series.flatMap(s => s.values.filter(v => v !== null));
    const max = niceMax(Math.max(...all, 0)), min = Math.min(0, ...all);
    const x = i => n === 1 ? PL + pw / 2 : PL + pw - pw * i / (n - 1), y = v => PT + ph * (1 - (v - min) / (max - min || 1));
    let g = '';
    for (const f of [0, 0.5, 1]) { const v = min + (max - min) * f; g += `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${W - 2}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
    series.forEach(s => {
      const pts = s.values.map((v, i) => v === null ? null : `${x(i)},${y(v)}`).filter(Boolean);
      if (area && pts.length > 1) g += `<polygon class="area ${s.cls}" points="${x(0)},${y(min)} ${pts.join(' ')} ${x(s.values.length - 1)},${y(min)}"/>`;
      g += `<polyline class="ln ${s.cls} ${s.dash ? 'dash' : ''}" points="${pts.join(' ')}"/>`;
      if (pts.length <= 24) g += s.values.map((v, i) => v === null ? '' : `<circle class="${s.cls}" cx="${x(i)}" cy="${y(v)}" r="3"/>`).join('');
    });
    const step = n > 1 ? pw / (n - 1) : pw, every = Math.max(1, Math.ceil(n / 6));
    let hits = '';
    labels.forEach((l, i) => {
      if (i % every === 0 || i === n - 1) g += `<text class="ax" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`;
      hits += `<rect class="hit" x="${x(i) - step / 2}" y="${PT}" width="${step}" height="${ph}" data-tip="${esc(tips[i])}"/>`;
    });
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img">${g}${hits}</svg>`;
  }
  const figure = (title, sub, body) => `<figure class="box chart" style="margin:14px 0 0"><h2>${title}</h2>${sub ? `<p class="note">${sub}</p>` : ''}${body}<figcaption class="tip">روی نمودار بزن تا عددها رو ببینی</figcaption></figure>`;

  function anHtml() {
    const pf = V.portfolio(S), P = pf.P, lz = lensName();
    if (!P || !S.ops.length) return `<p class="empty">برای تحلیل، اول قیمت‌ها و موجودی‌ها رو ثبت کن.</p>`;
    const hist = V.history(S);
    const shortD = d => { const { m, d: dd } = J.jParse(d); return `${faDigits(dd)} ${MONTHS[m - 1].slice(0, 3)}`; };
    const histChart = hist.length > 1 ? lineChart({ labels: hist.map(h => shortD(h.date)), area: true, fmt: v => shortLens(v, lz),
      series: [{ cls: 's-accent', values: hist.map(h => V.lens(h.total, lz, h.P)) }],
      tips: hist.map(h => { const v = V.lens(h.total, lz, h.P); return `${dateTitle(h.date)}: ${lz === 'toman' ? faNum(v) : dec(v, 2)} ${LENS[lz]}`; }) }) : '';
    const w = V.whatIf(S);
    const cmp = w ? [{ k: 'me', n: 'ترکیب فعلی تو', v: w.actual, cls: 'var(--navy)' }, { k: 'gold', n: 'اگه همه طلا بود', v: w.alt.gold, cls: 'var(--a-gold)' },
      { k: 'usd', n: 'اگه همه دلار بود', v: w.alt.usd, cls: 'var(--a-usd)' }, { k: 'eur', n: 'اگه همه یورو بود', v: w.alt.eur, cls: 'var(--a-eur)' },
      { k: 'usdt', n: 'اگه همه تتر بود', v: w.alt.usdt, cls: 'var(--a-usdt)' }, { k: 'btc', n: 'اگه همه بیت‌کوین بود', v: w.alt.btc, cls: 'var(--a-btc)' },
      { k: 'silver', n: 'اگه همه نقره بود', v: w.alt.silver, cls: 'var(--a-silver)' }, { k: 'irr', n: 'اگه ریالی نگه داشته بودی', v: w.alt.irr, cls: 'var(--a-irr)' }].filter(x => x.v !== null) : [];
    const cmax = Math.max(1, ...cmp.map(x => x.v));
    const R = pf.R;
    const priceSeries = (key, conv, fmt, label) => {
      const ps = S.prices.filter(p => p[key] > 0).sort((a, b) => a.date.localeCompare(b.date)); // فقط ثبت‌هایی که این قیمت رو دارن
      if (ps.length < 2) return '';
      return figure(label, '', lineChart({ labels: ps.map(p => shortD(p.date)), fmt, series: [{ cls: 's-' + key, values: ps.map(conv) }], tips: ps.map(p => `${dateTitle(p.date)}: ${fmt(conv(p), true)}`) }));
    };
    return `
    ${histChart ? figure(`ارزش دارایی به ${LENS[lz]}`, 'در هر تاریخی که قیمت ثبت کردی.', histChart) : `<div class="box"><p class="note">نمودار روند ارزش، بعد از ثبت قیمت در دو تاریخ مختلف ظاهر می‌شه.</p></div>`}
    ${w ? `<section class="box" style="margin-top:14px"><h2>اگه جاش…</h2><p class="note">اگه همه‌ی پولی که وارد کردی (${toman(w.invested)})، از همون روز در یک دارایی بود، الان چقدر می‌ارزید؟ ارزش‌ها به ${LENS[lz]}.</p>
      <ul class="cmpbars">${cmp.sort((a, b) => b.v - a.v).map(x => `<li class="${x.k === 'me' ? 'me' : ''}"><div><span>${x.n}</span><b>${fmtLens(x.v)}</b></div><i style="width:${Math.max(2, x.v / cmax * 100)}%;background:${x.cls}"></i></li>`).join('')}</ul></section>` : ''}
    <section class="box" style="margin-top:14px"><h2>بازده هر دارایی</h2>
      <table class="tbl"><thead><tr><th>دارایی</th><th>بهای خرید</th><th>تومانی</th><th>دلاری</th></tr></thead><tbody>
      ${pf.assets.filter(x => x.q > 0 && x.a !== 'irr').map(x => { const pr = x.basisR ? x.pnlR / x.basisR : null, pu = x.basisU ? x.pnlU / x.basisU : null;
        return `<tr><td>${ASSETS[x.a].name}</td><td>${shortLens(x.basisR / 10, 'toman')}</td><td class="${pr >= 0 ? 'pos' : 'neg'}">${pct(pr)}</td><td class="${pu >= 0 ? 'pos' : 'neg'}">${pct(pu)}</td></tr>`; }).join('')}
      </tbody></table>
      <p class="note">سود محقق‌شده از فروش‌ها: <b class="${R.realized.r >= 0 ? 'pos' : 'neg'}"><bdi dir="ltr">${R.realized.r >= 0 ? '+' : '−'}${faNum(Math.abs(R.realized.r) / 10)}</bdi> تومان</b> (به دلار <bdi dir="ltr">${R.realized.u >= 0 ? '+' : '−'}${dec(Math.abs(R.realized.u), 2)}</bdi>).</p></section>
    ${priceSeries('gold', p => p.gold / 10, (v, full) => full ? faNum(v) + ' تومان' : shortLens(v, 'toman'), 'قیمت گرم طلای ۱۸ عیار')}
    ${priceSeries('usdt', p => p.usdt / 10, (v, full) => full ? faNum(v) + ' تومان' : shortLens(v, 'toman'), 'قیمت تتر')}
    ${priceSeries('btc', p => p.btc, (v, full) => full ? faNum(v) + ' دلار' : shortLens(v, 'usd'), 'قیمت بیت‌کوین (دلار)')}
    ${priceSeries('usd', p => p.usd / 10, (v, full) => full ? faNum(v) + ' تومان' : shortLens(v, 'toman'), 'قیمت دلار')}
    ${priceSeries('eur', p => p.eur / 10, (v, full) => full ? faNum(v) + ' تومان' : shortLens(v, 'toman'), 'قیمت یورو')}
    ${priceSeries('silver', p => p.silver / 10, (v, full) => full ? faNum(v) + ' تومان' : shortLens(v, 'toman'), 'قیمت گرم نقره')}
    <section class="box" style="margin-top:14px"><h2>خروجی اکسل</h2><p class="note">یه فایل کامل: دارایی‌ها، محل‌ها، عملیات سرمایه و قیمت‌ها، کنار تراکنش‌ها، وام‌ها و شاخص‌های مالی.</p><button class="btn wide" data-act="excel">ساخت فایل اکسل</button></section>`;
  }

  // ---------- قیمت‌ها ----------
  const PRICE_FIELDS = [
    ['gold', 'گرم طلای ۱۸ عیار', 'toman'], ['usd', 'دلار', 'toman'], ['eur', 'یورو', 'toman'],
    ['usdt', 'تتر', 'toman'], ['btc', 'بیت‌کوین (به دلار)', 'usd'], ['silver', 'گرم نقره', 'toman']
  ];
  const priceText = (k, v) => v ? (k === 'btc' ? dec(v, 2) + '$' : faNum(v / 10)) : '—';
  function openPrices(pasted) {
    const P = V.latestPrice(S);
    const past = S.prices.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    const html = `
      <p class="note">${P ? `آخرین ثبت: ${dateTitle(P.date)} (${ago(P.date)}). فقط قیمت‌هایی که عوض شدن رو وارد کن؛ بقیه از ثبت قبلی می‌مونن.` : 'قیمت‌هایی که لازم داری رو وارد کن؛ لازم نیست همه رو پر کنی.'}</p>
      <label class="lbl" for="ptext">چسباندن پیام قیمت (تلگرام یا سایت)</label>
      <textarea id="ptext" rows="4" placeholder="متن پیامی که قیمت‌ها توشه رو اینجا بچسبون">${esc(pasted || '')}</textarea>
      <div class="btnrow" style="margin-top:8px"><button type="button" class="btn small" id="pclip">چسباندن از کلیپ‌بورد</button><button type="button" class="btn small ghost" id="pparse">استخراج قیمت‌ها</button></div>
      ${PRICE_FIELDS.map(([k, n, u]) => `<label class="lbl">${n}${P && P[k] ? ` <span class="was">قبلی: ${priceText(k, P[k])}</span>` : ''}</label>` + (u === 'usd'
        ? `<div class="unitwrap"><input class="qtyin" name="p_${k}" inputmode="decimal" placeholder="${P && P[k] ? dec(P[k], 2) : 'مثلاً ۸۴٬۷۳۶'}"><span>دلار</span></div>`
        : tomanInput('p_' + k, 0, P && P[k] ? faNum(P[k] / 10) : '')).replace('placeholder="۰"', '')).join('')}
      <label class="lbl">تاریخ</label>${dateField('pdate', today())}
      <button class="btn wide" id="psave">ثبت قیمت‌ها</button>
      ${past.length ? `<details class="fold"><summary>${IC.down}ثبت‌های قبلی</summary><ul class="ledger" style="margin-top:8px">${past.map(p => `<li class="row plain"><span class="main"><strong>${dateTitle(p.date)}</strong>
        <span>${PRICE_FIELDS.filter(([k]) => p[k]).map(([k, n]) => `${n.replace(' (به دلار)', '').replace('گرم ', '')} ${priceText(k, p[k])}`).join('، ')}</span></span>
        <button class="iconbtn sm" data-delprice="${p.date}" aria-label="حذف ثبت ${dateTitle(p.date)}">${IC.x}</button></li>`).join('')}</ul></details>` : ''}`;
    openSheet('قیمت‌ها', html, ov => {
      const fill = () => {
        const r = V.parsePrices($('#ptext', ov).value, V.latestPrice(S));
        let found = 0;
        for (const [k, , u] of PRICE_FIELDS) if (r[k]) { $(`[name=p_${k}]`, ov).value = u === 'usd' ? dec(r[k], 2) : faNum(r[k] / 10); found++; }
        if (r.date) { const { y, m, d } = J.jParse(r.date), w = $('[data-date=pdate]', ov); if ([...$('[data-p=y]', w).options].some(o => +o.value === y)) { $('[data-p=y]', w).value = y; $('[data-p=m]', w).value = m; $('[data-p=d]', w).value = d; } }
        toast(found ? `${faDigits(found)} قیمت پیدا شد${r.date ? ' (با تاریخ پیام)' : ''}. قبل از ثبت یه نگاه بنداز.` : 'قیمتی از دارایی‌های تو توی این متن پیدا نشد.', found ? '' : 'bad');
        return found;
      };
      $('#pparse', ov).addEventListener('click', fill);
      $('#pclip', ov).addEventListener('click', async () => {
        try { $('#ptext', ov).value = await navigator.clipboard.readText(); fill(); } catch (e) { toast('دسترسی به کلیپ‌بورد داده نشد. متن رو دستی بچسبون.', 'bad'); }
      });
      if (pasted) setTimeout(fill, 50);
      $$('[data-delprice]', ov).forEach(b => b.addEventListener('click', () => {
        if (!confirm('این ثبت قیمت حذف بشه؟')) return;
        S.prices = S.prices.filter(p => p.date !== b.dataset.delprice); save(); closeSheet(ov); render();
      }));
      once($('#psave', ov), () => {
        const date = readDate(ov, 'pdate'), entered = {};
        for (const [k, , u] of PRICE_FIELDS) {
          const raw = $(`[name=p_${k}]`, ov).value.trim(); if (!raw) continue;
          const v = u === 'usd' ? Number(J.normDigits(raw).replace(/[,٬]/g, '').replace('٫', '.')) : readToman(ov, 'p_' + k);
          if (!(v > 0)) { toast('یکی از قیمت‌ها درست وارد نشده.', 'bad'); return false; }
          entered[k] = v;
        }
        if (!Object.keys(entered).length) { toast('حداقل یه قیمت وارد کن.', 'bad'); return false; }
        // پایه: آخرین ثبتِ تا این تاریخ، تا قیمت‌های واردنشده حفظ بشن
        const base = S.prices.filter(p => p.date <= date).sort((a, b) => a.date.localeCompare(b.date)).pop() || V.latestPrice(S) || {};
        const jump = Object.keys(entered).some(k => base[k] && (entered[k] / base[k] > 3 || entered[k] / base[k] < 1 / 3));
        if (jump && !confirm('یکی از قیمت‌ها بیش از ۳ برابر با قبلی فرق داره. مطمئنی؟ (شاید ریال و تومان جابه‌جا شده)')) return false;
        const rec = { date }; for (const k of V.PRICE_KEYS) if (entered[k] || base[k]) rec[k] = entered[k] || base[k];
        S.prices = S.prices.filter(p => p.date !== date).concat([rec]);
        // ثبت‌های بعد از این تاریخ، کلیدهایی رو که ندارن از این ثبت بگیرن
        S.prices.filter(p => p.date > date).forEach(p => { for (const k of V.PRICE_KEYS) if (!p[k] && rec[k]) p[k] = rec[k]; });
        save(); closeSheet(ov); render(); toast('قیمت‌ها ثبت شد.');
      });
    });
  }

  // ---------- محل‌ها ----------
  function openLocs() {
    const sug = ['صرافی', 'پلتفرم طلا', 'کیف پول شخصی', 'خانه', 'صندوق امانات'].filter(n => !S.locations.some(l => l.name === n));
    const html = `<p class="note">هر جایی که دارایی یا ریالت اونجاست. اسم دقیق صرافی یا پلتفرم رو بنویس تا بعداً راحت پیداشون کنی.</p>
      ${sug.length ? `<div class="chips wrap">${sug.map(n => `<button type="button" class="chip" data-sug="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>` : ''}
      <label class="lbl">یا اسم دلخواه</label><div class="btnrow" style="margin-top:0"><input id="locname" placeholder="مثلاً نوبیتکس یا میلی"><button class="btn" id="locadd">افزودن</button></div>
      <p class="note" id="loclist">${S.locations.map(l => esc(l.name)).join('، ')}</p>`;
    openSheet('محل‌های نگهداری', html, ov => {
      const add = name => { name = name.trim().slice(0, 40); if (!name) return; if (S.locations.some(l => l.name === name)) { toast('این اسم قبلاً هست.', 'bad'); return; }
        S.locations.push({ id: uid(), name }); save(); $('#loclist', ov).textContent = S.locations.map(l => l.name).join('، '); render(); toast(`«${name}» اضافه شد.`); };
      $$('[data-sug]', ov).forEach(b => b.addEventListener('click', () => { add(b.dataset.sug); b.remove(); }));
      $('#locadd', ov).addEventListener('click', () => { add($('#locname', ov).value); $('#locname', ov).value = ''; });
    });
  }
  function locMenu(id) {
    const l = S.locations.find(x => x.id === id); if (!l) return;
    const used = S.ops.some(o => o.loc === id || o.loc2 === id);
    const name = prompt(used ? `اسم جدید برای «${l.name}» (این محل عملیات داره و حذف نمی‌شه):` : `اسم جدید برای «${l.name}»، یا خالی بذار تا حذف بشه:`, l.name);
    if (name === null) return;
    if (!name.trim()) { if (used) return; S.locations = S.locations.filter(x => x !== l); }
    else l.name = name.trim().slice(0, 40);
    save(); render();
  }
  function openLocDetail(id) {
    const pf = V.portfolio(S), x = pf.byLoc.find(b => b.loc.id === id); if (!x) return;
    const pcs = Object.entries(x.pieces).filter(([, c]) => c > 0);
    const ops = S.ops.filter(o => o.loc === id || o.loc2 === id).sort((a, b) => V.opSort(b, a)).slice(0, 15);
    openSheet(x.loc.name, `<p class="note">ارزش: <b>${fmtLens(x.value)}</b></p><ul class="ledger">${ORDER.filter(a => x.h[a]).map(a => `<li class="row"><i class="key k-${a}"></i>
      <span class="main"><strong>${ASSETS[a].name}</strong>${a === 'bar' && pcs.length ? `<span>${pcs.map(([w, c]) => `${faDigits(c)} شمش ${faDigits(w)} گرمی`).join('، ')}</span>` : ''}</span>
      <span class="side"><b class="qty">${qtyStr(x.h[a], a)}</b><span>${fmtLens(V.valueRial(a, x.h[a], pf.P, S.settings))}</span></span></li>`).join('')}</ul>
      ${ops.length ? `<h3 class="lbl">آخرین عملیات</h3><ul class="ledger">${ops.map(opRow).join('')}</ul>` : ''}`);
  }
  function openAssetDetail(a) {
    const pf = V.portfolio(S), x = pf.assets.find(s => s.a === a);
    const locs = pf.byLoc.filter(b => (b.h[a] || 0) !== 0);
    const ops = S.ops.filter(o => (o.in && o.in.a === a) || (o.out && o.out.a === a)).sort((p, q) => V.opSort(q, p)).slice(0, 20);
    openSheet(ASSETS[a].name, `<p class="note">مجموع: <b>${qtyTxt(x.q, a)}</b>، ارزش <b>${fmtLens(x.value)}</b>${a !== 'irr' && x.basisR ? `، بهای خرید ${toman(x.basisR)}` : ''}</p>
      <ul class="ledger">${locs.map(b => `<li class="row"><i class="key k-${a}"></i><span class="main"><strong>${esc(b.loc.name)}</strong>${a === 'bar' ? `<span>${Object.entries(b.pieces).filter(([, c]) => c > 0).map(([w, c]) => `${faDigits(c)} شمش ${faDigits(w)} گرمی`).join('، ')}</span>` : ''}</span>
        <span class="side"><b class="qty">${qtyStr(b.h[a], a)}</b></span></li>`).join('')}</ul>
      ${ops.length ? `<h3 class="lbl">عملیات</h3><ul class="ledger">${ops.map(opRow).join('')}</ul>` : ''}`);
  }

  // ---------- فرم عملیات ----------
  function openChooser() {
    openSheet('عملیات جدید', `<nav class="qa4 grid2">${Object.entries(OPS).map(([k, o]) => `<button data-pick="${k}"><span class="qi">${IC[o.ic]}</span>${o.t}</button>`).join('')}</nav>`, ov => {
      $('.qa4', ov).addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; closeSheet(ov); setTimeout(() => openOpForm(b.dataset.pick), 150); });
    });
  }
  const HOLD_ASSETS = ['gold', 'bar', 'usd', 'eur', 'usdt', 'btc', 'silver'];
  function piecesField(prefix, pieces) {
    const w = pieces ? Object.keys(pieces)[0] : '10', c = pieces ? pieces[w] : 1;
    return `<div class="two"><div><label class="lbl">وزن هر شمش</label><select name="${prefix}w">${['5', '10', '1', '2.5', '20', '50', '100'].map(x => `<option value="${x}" ${x === String(w) ? 'selected' : ''}>${faDigits(x).replace('.', '٫')} گرم</option>`).join('')}</select></div>
      <div><label class="lbl">تعداد</label><input name="${prefix}c" inputmode="numeric" value="${faDigits(c)}"></div></div>`;
  }
  const readPieces = (ov, prefix) => {
    const we = $(`[name=${prefix}w]`, ov), ce = $(`[name=${prefix}c]`, ov); if (!we || !ce) return null; // فیلدها هنوز ساخته نشدن
    const w = we.value, c = Number(J.normDigits(ce.value).replace(/\D/g, '').slice(0, 4)) || 0;
    return c ? { pieces: { [w]: c }, q: Math.round(parseFloat(w) * 1000 * c) } : null;
  };

  function openOpForm(type, editId) {
    const E = editId ? S.ops.find(o => o.id === editId) : null;
    if (editId && !E) return;
    type = E ? E.type : type;
    const firstLoc = (S.locations[0] || {}).id;
    const loc = E ? E.loc : firstLoc;
    let asset = E ? ((['sell', 'swap', 'transfer', 'gift_out'].includes(E.type)) ? E.out.a : E.in ? E.in.a : 'irr') : (type === 'swap' ? 'usdt' : 'gold');
    const assetList = ['open', 'gift_in', 'gift_out'].includes(type) ? HOLD_ASSETS.concat(['irr']) : HOLD_ASSETS;
    const title = (E ? 'ویرایش ' : '') + OPS[type].t;
    if (!S.locations.length) { toast('اول یه محل نگهداری تعریف کن.', 'bad'); openLocs(); return; }
    const payExt = E ? (E.type === 'buy' && !E.out) : false, recvExt = E ? (E.type === 'sell' && !E.in) : false;
    let fields = '';
    const locSel = (name, sel, label) => `<label class="lbl">${label}</label><select name="${name}" class="locsel">${locOptions(sel)}</select>`;
    const assetSel = (name, list, sel, label) => `<label class="lbl">${label}</label><select name="${name}">${assetOptions(list, sel)}</select>`;
    if (type === 'buy') fields = locSel('loc', loc, 'کجا خریدی؟') + assetSel('asset', HOLD_ASSETS, asset, 'چی خریدی؟') +
      `<div id="qwrap"></div><label class="lbl">مبلغ کل پرداختی (با کارمزد)</label>${tomanInput('amt', E ? (E.out ? E.out.q : E.cost) : 0)}
      <label class="lbl">پول از کجا اومد؟</label><div class="radio"><label><input type="radio" name="src" value="loc" ${!payExt ? 'checked' : ''}> از ریالِ موجود در همین محل</label><label><input type="radio" name="src" value="ext" ${payExt ? 'checked' : ''}> از حساب بانکی (مستقیم)</label></div>`;
    else if (type === 'sell') fields = locSel('loc', loc, 'کجا فروختی؟') + assetSel('asset', HOLD_ASSETS, asset, 'چی فروختی؟') +
      `<div id="qwrap"></div><label class="lbl">مبلغ دریافتی (بعد از کارمزد)</label>${tomanInput('amt', E ? (E.in ? E.in.q : E.proceeds) : 0)}
      <label class="lbl">پولش کجا رفت؟</label><div class="radio"><label><input type="radio" name="dst" value="loc" ${!recvExt ? 'checked' : ''}> ریال همین‌جا می‌مونه</label><label><input type="radio" name="dst" value="ext" ${recvExt ? 'checked' : ''}> به حساب بانکی برداشت شد</label></div>`;
    else if (type === 'swap') fields = locSel('loc', loc, 'کجا؟') + `<div class="two"><div>${assetSel('asset', HOLD_ASSETS, asset, 'دادی')}</div><div>${assetSel('asset2', HOLD_ASSETS, E ? E.in.a : 'btc', 'گرفتی')}</div></div>
      <div id="qwrap"></div><label class="lbl">مقدار دریافتی</label><div id="q2wrap"></div>`;
    else if (type === 'transfer') fields = assetSel('asset', HOLD_ASSETS, asset, 'چی؟') + `<div class="two"><div>${locSel('loc', loc, 'از')}</div><div>${locSel('loc2', E ? E.loc2 : (S.locations[1] || S.locations[0]).id, 'به')}</div></div>
      <div id="qwrap"></div><label class="lbl">مقدار رسیده به مقصد</label><div id="q2wrap"></div><p class="hint">تفاوتش کارمزد انتقاله. اگه خالی بذاری، همون مقدار ارسالی حساب می‌شه.</p>`;
    else if (type === 'deposit' || type === 'withdraw') fields = locSel('loc', loc, type === 'deposit' ? 'به کجا واریز کردی؟' : 'از کجا برداشت کردی؟') +
      `<label class="lbl">مبلغ</label>${tomanInput('amt', E ? (E.in || E.out).q : 0)}`;
    else if (type === 'gift_in') fields = locSel('loc', loc, 'کجا نگهش می‌داری؟') + assetSel('asset', assetList, asset, 'چی هدیه گرفتی؟') +
      `<div id="qwrap"></div><div id="costwrap"><label class="lbl">ارزش روز دریافت</label>${tomanInput('cost', E && E.in.a !== 'irr' ? E.cost : 0)}
      <p class="hint">خالی بذاری، با قیمت ثبت‌شده‌ی همون روز حساب می‌شه. سود و زیان از همین ارزش به بعد سنجیده می‌شه.</p></div>`;
    else if (type === 'gift_out') fields = locSel('loc', loc, 'از کجا؟') + assetSel('asset', assetList, asset, 'چی هدیه دادی؟') + `<div id="qwrap"></div>`;
    else if (type === 'open') fields = locSel('loc', loc, 'کجاست؟') + assetSel('asset', assetList, asset, 'چی؟') +
      `<div id="qwrap"></div><div id="costwrap"><label class="lbl">بهای خرید (جمع مبلغی که بابتش پرداخت کردی)</label>${tomanInput('cost', E && E.in.a !== 'irr' ? E.cost : 0)}
      <p class="hint">اگه دقیق یادت نیست، تقریبی بنویس یا <button type="button" class="linkbtn" id="usenow">ارزش امروز</button> رو بزن. سود و زیان از روی همین عدد حساب می‌شه.</p></div>`;
    const html = `${fields}<label class="lbl">تاریخ</label>${dateField('date', E ? E.date : today())}
      <label class="lbl">یادداشت</label><input id="note" value="${esc(E ? E.note : '')}" placeholder="اختیاری">
      <div class="summary" id="sum"></div><div class="errbox" id="err" hidden></div>
      <div class="btnrow"><button class="btn wide" id="save">${E ? 'ذخیره‌ی تغییرات' : 'ثبت'}</button>${E ? `<button class="btn danger" id="del">حذف</button>` : ''}</div>`;
    openSheet(title, html, ov => {
      bindNewLoc(ov);
      const val = n => { const el = $(`[name=${n}]`, ov); return el ? el.value : null; };
      const q1 = () => val('asset') === 'bar' && type !== 'swap' ? (readPieces(ov, 'p') || { q: 0 }).q : readQty(ov, 'q1', val('asset'));
      const renderQty = () => {
        const a = val('asset');
        const q1wrap = $('#qwrap', ov);
        if (!q1wrap) { update(); return; } // واریز و برداشت ریال فیلد مقدار جدا ندارن
        const initQ = E && (E.out || E.in) && ((E.out && E.out.a === a) ? E.out.q : (E.in && E.in.a === a) ? E.in.q : 0);
        const initPieces = E && ((E.out && E.out.pieces) || (E.in && E.in.pieces));
        const lbl = type === 'buy' ? 'مقدار دریافتی (بعد از کارمزد)' : type === 'sell' ? 'مقدار فروخته‌شده' : type === 'swap' ? 'مقدار داده‌شده' : type === 'transfer' ? 'مقدار ارسالی' : type.startsWith('gift') ? 'مقدار هدیه' : 'مقدار';
        if (a === 'irr') q1wrap.innerHTML = `<label class="lbl">مبلغ</label>${tomanInput('q1t', initQ || 0)}`;
        else if (a === 'bar' && type !== 'swap') q1wrap.innerHTML = piecesField('p', initPieces);
        else q1wrap.innerHTML = `<label class="lbl">${lbl}</label>${qtyInput('q1', a, initQ)}`;
        if ($('#q2wrap', ov)) { const a2 = type === 'transfer' ? a : val('asset2'); $('#q2wrap', ov).innerHTML = qtyInput('q2', a2, E && E.in && E.in.a === a2 ? E.in.q : 0); }
        if ($('#costwrap', ov)) $('#costwrap', ov).hidden = a === 'irr';
        bindInputs(q1wrap); if ($('#q2wrap', ov)) bindInputs($('#q2wrap', ov));
        const un = $('#usenow', ov); if (un) un.onclick = () => { const b = build(true); if (!b.op || !b.op.in) return; const v = V.valueRial(b.op.in.a, b.op.in.q, V.latestPrice(S), S.settings); if (v) { $('[name=cost]', ov).value = faNum(Math.round(v / 10)); update(); } else toast('قیمت امروز ثبت نشده.', 'bad'); };
        update();
      };
      // ساخت شیء عملیات از فرم
      function build(silent) {
        const a = val('asset'), date = readDate(ov, 'date'), note = $('#note', ov).value.trim().slice(0, 200);
        const o = { id: E ? E.id : uid(), created: E ? E.created : Date.now(), date, type, loc: val('loc'), note };
        const bar = a === 'bar' && type !== 'swap' ? readPieces(ov, 'p') : null;
        const qa = !a ? 0 : a === 'irr' ? readToman(ov, 'q1t') : bar ? bar.q : readQty(ov, 'q1', a);
        const side = { a, q: qa }; if (bar) side.pieces = bar.pieces;
        if (!o.loc || o.loc === '__new') return { err: 'محل رو انتخاب کن.' };
        if (qa === null) return { err: 'مقدار درست وارد نشده.' };
        if (type === 'buy') {
          const amt = readToman(ov, 'amt'); if (!qa || !amt) return { err: 'مقدار و مبلغ پرداختی لازمه.' };
          o.in = side; if ($('[name=src]:checked', ov).value === 'ext') o.cost = amt; else o.out = { a: 'irr', q: amt };
        } else if (type === 'sell') {
          const amt = readToman(ov, 'amt'); if (!qa || !amt) return { err: 'مقدار و مبلغ دریافتی لازمه.' };
          o.out = side; if ($('[name=dst]:checked', ov).value === 'ext') o.proceeds = amt; else o.in = { a: 'irr', q: amt };
        } else if (type === 'swap') {
          const a2 = val('asset2'); if (a2 === a) return { err: 'دو دارایی باید متفاوت باشن.' };
          const q2 = readQty(ov, 'q2', a2); if (!qa || !q2) return { err: 'هر دو مقدار لازمه.' };
          o.out = side; o.in = { a: a2, q: q2 };
        } else if (type === 'transfer') {
          o.loc2 = val('loc2'); if (!o.loc2 || o.loc2 === '__new') return { err: 'مقصد رو انتخاب کن.' };
          if (o.loc2 === o.loc) return { err: 'مبدأ و مقصد یکی‌ان.' };
          let q2 = bar ? qa : readQty(ov, 'q2', a); if (!q2) q2 = qa;
          if (!qa) return { err: 'مقدار لازمه.' }; if (q2 > qa) return { err: 'مقدار رسیده نمی‌تونه بیشتر از ارسالی باشه.' };
          o.out = side; o.in = { a, q: q2 }; if (bar) o.in.pieces = bar.pieces;
        } else if (type === 'deposit' || type === 'withdraw') {
          const amt = readToman(ov, 'amt'); if (!amt) return { err: 'مبلغ لازمه.' };
          if (type === 'deposit') { o.in = { a: 'irr', q: amt }; o.cost = amt; } else o.out = { a: 'irr', q: amt };
        } else if (type === 'gift_in') {
          if (!qa) return { err: 'مقدار لازمه.' };
          o.in = side;
          if (a === 'irr') o.cost = qa;
          else {
            let c = readToman(ov, 'cost');
            if (!c) { const Pd = V.priceAt(S, date), v = V.valueRial(a, qa, Pd, S.settings); c = v ? Math.round(v) : 0; }
            if (!c && !silent) return { err: 'برای این دارایی قیمتی ثبت نشده؛ ارزش روز دریافت رو وارد کن.', op: o };
            o.cost = c;
          }
        } else if (type === 'gift_out') {
          if (!qa) return { err: 'مقدار لازمه.' };
          o.out = side;
        } else if (type === 'open') {
          if (!qa) return { err: 'مقدار لازمه.' };
          o.in = side; o.cost = a === 'irr' ? qa : readToman(ov, 'cost');
          if (a !== 'irr' && !o.cost && !silent) return { err: 'بهای خرید لازمه (می‌تونی «ارزش امروز» رو بزنی).', op: o };
        }
        return { op: o };
      }
      function check(o) {
        const base = E ? { ...S, ops: S.ops.filter(x => x.id !== E.id) } : S;
        const R = V.replay(base, null, o);
        return R.errors.length ? R.errors[0] : null;
      }
      function update() {
        const b = build(true), sum = $('#sum', ov), err = $('#err', ov);
        err.hidden = true;
        if (!b.op || b.err) { sum.hidden = true; return; }
        const o = b.op, P = V.latestPrice(S);
        let s = '';
        if (type === 'buy' && o.in.q) { const paid = o.out ? o.out.q : o.cost; if (paid) s = `قیمت هر ${faUnit(o.in.a) === 'گرم' ? 'گرم' : faUnit(o.in.a)}: <b>${toman(paid / o.in.q * ASSETS[o.in.a].base)}</b>`; }
        if (type === 'sell' && o.out.q) { const got = o.in ? o.in.q : o.proceeds; if (got) s = `قیمت فروش هر ${faUnit(o.out.a)}: <b>${toman(got / o.out.q * ASSETS[o.out.a].base)}</b>`; }
        if (type === 'swap' && o.out.q && o.in.q) s = `نرخ تبدیل: هر ${faUnit(o.in.a)} برابر <b>${V.fmtQty(Math.round(o.out.q / o.in.q * ASSETS[o.in.a].base), o.out.a)} ${faUnit(o.out.a)}</b>`;
        if (type === 'transfer' && o.out.q > o.in.q) s = `کارمزد انتقال: <b>${qtyTxt(o.out.q - o.in.q, o.out.a)}</b>`;
        if (P && s && o.out && o.out.a !== 'irr' && o.out.q) { const v = V.valueRial(o.out.a, o.out.q, P, S.settings); if (v) s += `<br>ارزش با قیمت امروز: ${toman(v)}`; }
        sum.innerHTML = s; sum.hidden = !s;
        const e = check(o);
        if (e) { err.hidden = false; err.textContent = `موجودی ${ASSETS[e.asset].name} در «${locName(e.loc)}» کافی نیست (${qtyTxt(e.short, e.asset)} کم داره).`; }
      }
      ov.addEventListener('input', update); ov.addEventListener('change', e => { if (e.target.name === 'asset' || e.target.name === 'asset2') renderQty(); else update(); });
      renderQty();
      once($('#save', ov), () => {
        const b = build(false); if (b.err) { toast(b.err, 'bad'); return false; }
        const e = check(b.op);
        if (e) { toast(`موجودی ${ASSETS[e.asset].name} در «${locName(e.loc)}» کافی نیست.`, 'bad'); return false; }
        if (E) S.ops = S.ops.map(x => x.id === E.id ? b.op : x); else S.ops.push(b.op);
        save(); closeAll(); render(); toast(E ? 'ذخیره شد.' : `${OPS[type].t} ثبت شد.`);
      });
      if (E) $('#del', ov).addEventListener('click', () => {
        const rest = { ...S, ops: S.ops.filter(x => x.id !== E.id) };
        const R = V.replay(rest);
        if (R.errors.length) { toast('با حذف این عملیات، موجودی بعضی عملیات‌های بعدی منفی می‌شه. اول اون‌ها رو اصلاح کن.', 'bad'); return; }
        if (!confirm('این عملیات حذف بشه؟')) return;
        S.ops = rest.ops; save(); closeAll(); render(); toast('حذف شد.');
      });
    });
  }

  // ---------- هدف‌ها ----------
  function openGoal(id) {
    const g = id ? S.goals.find(x => x.id === id) : null;
    const kinds = [['gold', 'گرم طلا (۱۸ عیار + شمش)'], ['usd', 'دلار'], ['eur', 'یورو'], ['usdt', 'تتر'], ['btc', 'بیت‌کوین'], ['silver', 'گرم نقره'], ['value', 'ارزش کل دارایی']];
    const html = `<label class="lbl">اسم هدف</label><input id="gname" value="${esc(g ? g.name : '')}" placeholder="مثلاً طلا برای عید">
      <label class="lbl">به چی سنجیده بشه؟</label><select id="gkind">${kinds.map(([k, n]) => `<option value="${k}" ${g && g.kind === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <div id="glenswrap"><label class="lbl">واحد</label><select id="glens">${Object.entries(LENS).map(([k, n]) => `<option value="${k}" ${g && g.lens === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <label class="lbl">مقدار هدف</label><input id="gtarget" inputmode="decimal" value="${g ? faDigits(g.target).replace('.', '٫') : ''}" placeholder="مثلاً ۵۰">
      <div class="btnrow"><button class="btn wide" id="gsave">${g ? 'ذخیره' : 'افزودن هدف'}</button>${g ? `<button class="btn danger" id="gdel">حذف</button>` : ''}</div>`;
    openSheet(g ? 'ویرایش هدف' : 'هدف جدید', html, ov => {
      const sync = () => { $('#glenswrap', ov).hidden = $('#gkind', ov).value !== 'value'; }; sync();
      $('#gkind', ov).addEventListener('change', sync);
      once($('#gsave', ov), () => {
        const name = $('#gname', ov).value.trim().slice(0, 60), target = Number(J.normDigits($('#gtarget', ov).value).replace(/[,٬]/g, '').replace('٫', '.'));
        if (!name || !(target > 0)) { toast('اسم و مقدار هدف لازمه.', 'bad'); return false; }
        const rec = g || { id: uid() }; Object.assign(rec, { name, kind: $('#gkind', ov).value, lens: $('#glens', ov).value, target });
        if (!g) S.goals.push(rec); save(); closeSheet(ov); render(); toast('هدف ذخیره شد.');
      });
      if (g) $('#gdel', ov).addEventListener('click', () => { if (!confirm('این هدف حذف بشه؟')) return; S.goals = S.goals.filter(x => x !== g); save(); closeSheet(ov); render(); });
    });
  }

  function excelSheets(add) {
    if (!S.ops.length && !S.prices.length) return;
    const pf = V.portfolio(S);
    const q = (v, a) => v / ASSETS[a].base;
    add([['دارایی', 'مقدار', 'واحد', 'ارزش (تومان)', 'بهای خرید (تومان)', 'سود/زیان (تومان)', 'سود/زیان (دلار)']].concat(pf.assets.map(x =>
      [ASSETS[x.a].name, x.a === 'irr' ? x.q / 10 : q(x.q, x.a), ASSETS[x.a].unit, x.value === null ? '' : Math.round(x.value / 10), Math.round(x.basisR / 10), x.pnlR === null ? '' : Math.round(x.pnlR / 10), x.pnlU === null ? '' : +x.pnlU.toFixed(2)])),
      'دارایی‌ها', [14, 14, 8, 16, 16, 16, 14]);
    add([['محل', 'دارایی', 'مقدار', 'واحد']].concat(pf.byLoc.flatMap(b => ORDER.filter(a => b.h[a]).map(a => [b.loc.name, ASSETS[a].name, a === 'irr' ? b.h[a] / 10 : q(b.h[a], a), ASSETS[a].unit]))),
      'محل‌های نگهداری', [18, 14, 14, 8]);
    add([['تاریخ', 'نوع', 'محل', 'مقصد', 'دارایی خروجی', 'مقدار خروجی', 'دارایی ورودی', 'مقدار ورودی', 'از حساب بانکی (تومان)', 'به حساب بانکی (تومان)', 'یادداشت']]
      .concat(S.ops.slice().sort(V.opSort).map(o => [o.date, OPS[o.type].t, locName(o.loc), o.loc2 ? locName(o.loc2) : '',
        o.out ? ASSETS[o.out.a].name : '', o.out ? (o.out.a === 'irr' ? o.out.q / 10 : q(o.out.q, o.out.a)) : '',
        o.in ? ASSETS[o.in.a].name : '', o.in ? (o.in.a === 'irr' ? o.in.q / 10 : q(o.in.q, o.in.a)) : '',
        o.cost != null ? o.cost / 10 : '', o.proceeds != null ? o.proceeds / 10 : '', o.note || ''])),
      'عملیات سرمایه', [12, 12, 16, 16, 14, 14, 14, 14, 18, 18, 24]);
    add([['تاریخ', 'طلای ۱۸ (تومان/گرم)', 'دلار (تومان)', 'یورو (تومان)', 'تتر (تومان)', 'بیت‌کوین (دلار)', 'نقره (تومان/گرم)']]
      .concat(S.prices.slice().sort((a, b) => a.date.localeCompare(b.date)).map(p => [p.date, p.gold ? p.gold / 10 : '', p.usd ? p.usd / 10 : '', p.eur ? p.eur / 10 : '', p.usdt ? p.usdt / 10 : '', p.btc || '', p.silver ? p.silver / 10 : ''])),
      'قیمت‌ها', [12, 16, 14, 14, 14, 16, 16]);
  }

  // ---------- API ماژول ----------
  // عدد علامت‌دار در واحد سنجش؛ اگه نرخ اون واحد ثبت نشده، فقط «—»
  const signed = (rial, lz) => { const t = fmtLens(Math.abs(rial), lz, false); return t === '—' ? t : `<bdi dir="ltr">${rial < 0 ? '−' : ''}${t}</bdi>`; };
  function homeCard() {
    const P = V.latestPrice(S), pf = V.portfolio(S), lz = lensName();
    const { owe, owed } = App.debtTotals(), loans = App.loanRemaining();
    if (!S.ops.length && !P) return `<section class="block"><button class="nwcard empty" data-act="goinv"><span class="nwc-l">سرمایه و ارزش خالص</span>
      <span class="nwc-cta">طلا، دلار، تتر، بیت‌کوین… رو اضافه کن تا ارزش خالصت رو ببینی</span></button></section>`;
    const netRial = pf.total - loans - owe + owed;
    const stale = P ? J.diffDays(P.date, today()) : null;
    return `<section class="block"><div class="nwcard">
      <div class="nwc-top"><span class="nwc-l">سرمایه</span>${lensSwitch()}</div>
      <button class="nwc-main" data-act="goinv"><b>${fmtLens(pf.total, lz, false)}</b><small>${LENS[lz]}</small></button>
      <dl class="nwc-rows">
        <div><dt>بدهی وام‌ها و اشخاص</dt><dd>${signed(-(loans + owe), lz)}</dd></div>
        ${owed ? `<div><dt>طلب از اشخاص</dt><dd>${signed(owed, lz)}</dd></div>` : ''}
        <div class="net"><dt>ارزش خالص</dt><dd>${signed(netRial, lz)} ${LENS[lz]}</dd></div>
      </dl>
      <div class="nwc-seal ${stale !== null && stale >= 3 ? 'stale' : ''}"><span>${P ? `قیمت‌ها: ${ago(P.date)}` : 'قیمتی ثبت نشده'}</span><button class="linkbtn" data-act="prices">به‌روزرسانی</button></div>
    </div></section>`;
  }
  function view() {
    const subs = [['sum', 'خلاصه'], ['ops', 'عملیات'], ['an', 'تحلیل']];
    const body = invTab === 'ops' ? opsHtml() : invTab === 'an' ? anHtml() : overviewHtml() + (S.ops.length ? assetsHtml() : '');
    return `<header class="top home-top"><h1>دارایی</h1>${App.headerTools()}</header>
      <div class="chips seg" role="group" aria-label="بخش‌های سرمایه">${subs.map(([k, n]) => `<button class="chip ${invTab === k ? 'on' : ''}" data-act="invt" data-t="${k}" aria-pressed="${invTab === k}">${n}</button>`).join('')}</div>
      ${body}`;
  }
  function settingsHtml() {
    return `<section class="block card-block"><h2>محل‌های نگهداری سرمایه</h2>
      ${S.locations.length ? `<div class="chips wrap">${S.locations.map(l => `<span class="chip tag">${esc(l.name)}<button data-act="dellocname" data-id="${esc(l.id)}" aria-label="ویرایش یا حذف ${esc(l.name)}">${IC.x}</button></span>`).join('')}</div>` : '<p class="note">هنوز محلی تعریف نشده.</p>'}
      <button class="btn small" data-act="locs">افزودن محل</button></section>
    <section class="block card-block"><h2>قیمت شمش</h2>
      <p class="note">اگه شمش رو معمولاً کمی کمتر یا بیشتر از طلای ۱۸ عیار گرمی می‌فروشی، اختلافش رو به درصد بنویس (مثلاً ۲- یعنی ۲٪ کمتر). پیش‌فرض صفره.</p>
      <div class="unitwrap"><input id="baradj" inputmode="decimal" value="${S.settings.barAdj ? dec(S.settings.barAdj, 2) : ''}" placeholder="۰" aria-label="اختلاف قیمت شمش"><span>٪</span></div>
      <button class="btn small" data-act="savebar">ذخیره</button></section>`;
  }
  function looksLikePrices(text) {
    if (/(موجودی|مانده|حساب شما|از حساب|به حساب)/.test(J.normDigits(text || ''))) return false;
    const r = V.parsePrices(text, V.latestPrice(S));
    return V.PRICE_KEYS.some(k => r[k]);
  }
  const acts = {
    lens: b => { S.settings.lens = b.dataset.l; save(); render(); },
    prices: () => openPrices(), locs: openLocs, opchooser: openChooser, goal: b => openGoal(b.dataset.id),
    op: b => openOpForm(b.dataset.type), editop: b => openOpForm(null, b.dataset.id), opf: b => { opFilter = b.dataset.f; render(); },
    asset: b => openAssetDetail(b.dataset.a), loc: b => openLocDetail(b.dataset.id),
    dellocname: b => locMenu(b.dataset.id), invt: b => { invTab = b.dataset.t; render(); window.scrollTo(0, 0); },
    goinv: () => { invTab = 'sum'; App.go('inv'); },
    savebar: () => { const v = Number(J.normDigits($('#baradj').value).replace('٫', '.').replace(/[^\d.\-]/g, '')) || 0; if (Math.abs(v) > 50) { toast('عدد منطقی نیست.', 'bad'); return; } S.settings.barAdj = v; save(); render(); toast('ذخیره شد.'); }
  };
  window.Inv = { bind: st => { S = st; }, view, homeCard, settingsHtml, excelSheets, looksLikePrices, acts,
    openPrices, openOp: t => openOpForm(t), afterRender: root => bindInputs(root) };
})();
