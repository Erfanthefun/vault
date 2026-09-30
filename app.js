/* Vault — اپ همه‌کاره‌ی مالی شخصی: مدیریت روزانه و ماهانه (از FI) + دفتر سرمایه (invest-ui.js) */
(function () {
  'use strict';
  const C = window.Core;
  const { faNum, faDigits, today, ym, MONTHS } = C;
  const KEY = 'vault-v1'; // همون کلید Vault نسخه‌ی ۱، تا داده‌های قبلیش حفظ بشه
  const VERSION = '۹';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let uidN = 0;
  const uid = () => Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 6);
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- آیکون‌ها (SVG؛ جهتشون در راست‌به‌چپ آینه نمی‌شه) ----------
  const svg = (d, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    right: svg('<path d="m9 5 7 7-7 7"/>'),
    left: svg('<path d="m15 5-7 7 7 7"/>'),
    check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    out: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    in: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    paste: svg('<rect x="7" y="4" width="10" height="4" rx="1.5"/><path d="M8 6H6.5A1.5 1.5 0 0 0 5 7.5v11A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 17.5 6H16M9 13h6M9 16.5h4"/>'),
    cal: svg('<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    swap: svg('<path d="M7 7h11l-3-3M17 17H6l3 3"/>'),
    chart: svg('<path d="M5 20V11M12 20V5M19 20v-7"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
    gift: svg('<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M4 13h16M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z"/>'),
    salary: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
    down: svg('<path d="m6 9 6 6 6-6"/>')
  };

  // ---------- ذخیره‌سازی ----------
  const EXPENSE_CATS = ['وام', 'قسط', 'کادو', 'خرید منزل', 'کفش و لباس', 'لوازم جانبی', 'سوپرمارکت', 'قبوض', 'شارژ ساختمان', 'کرایه', 'غذا',
    'آرایشی و بهداشتی', 'طلا', 'آرایشگاه', 'میوه و سبزیجات', 'سفر', 'کافه', 'هزینه‌های خودرو', 'بنزین', 'دارو و درمان', 'اشتراک‌ها', 'سایر'];
  const SEED = {
    banks: ['بلوبانک', 'سامان', 'کارآفرین', 'صادرات'],
    credits: [['اسنپ‌پی اعتباری', 100000000], ['دیجی‌پی اعتباری', 100000000]],   // سقف ۱۰ میلیون تومان = ۱۰۰ میلیون ریال
    bnpl: ['دیجی‌پی', 'اسنپ‌پی'], lenders: ['بلوبانک'], invest: ['وال‌گلد', 'والکس', 'نوبیتکس', 'کاریزما']
  };
  // یک بار برای هر نسخه‌ی داده: فهرست‌های کاربر اضافه می‌شن بدون اینکه چیزی حذف یا بازنویسی بشه
  function seedLists(s) {
    if ((s.settings.seedV || 0) >= 4) return;
    const has = (arr, n) => arr.some(x => (x.name || x) === n);
    for (const n of SEED.banks) if (!has(s.accounts, n)) s.accounts.push({ id: uid(), kind: 'bank', bank: n, num: '', name: n, balance: null, stamp: '' });
    for (const [n, lim] of SEED.credits) if (!has(s.accounts, n)) s.accounts.push({ id: uid(), kind: 'credit', name: n, limit: lim, paid: {} });
    for (const n of SEED.invest) if (!has(s.locations, n)) s.locations.push({ id: uid(), name: n });
    s.lists = s.lists || {};
    s.lists.bnpl = [...new Set([...(s.lists.bnpl || []), ...SEED.bnpl])];
    s.lists.lenders = [...new Set([...(s.lists.lenders || []), ...SEED.lenders])];
    // دسته‌ها: فهرست کاربر + هر دسته‌ای که قبلاً واقعاً استفاده شده
    const used = new Set(s.tx.filter(t => t.type === 'expense' && t.cat).map(t => t.cat).concat(s.loans.map(l => l.cat), s.fixed.map(f => f.cat)).filter(Boolean));
    s.categories.expense = [...new Set([...EXPENSE_CATS, ...[...used].filter(c => !EXPENSE_CATS.includes(c) && !['قسط وام', 'پرداخت ماهانه'].includes(c))])];
    s.settings.seedV = 4;
  }
  function defaults() {
    return {
      v: 2,
      settings: { unit: 'toman', expectedIncome: 0, lastBackup: null, lens: 'toman', barAdj: 0, lock: null, autoPrice: { on: true, skip: [], last: null, err: null } },
      categories: {
        expense: EXPENSE_CATS.slice(),
        income: ['حقوق', 'پروژه', 'سایر درآمد']
      },
      accounts: [], tx: [], loans: [], fixed: [], debts: [], lastCat: {},
      incomes: [], locations: [], prices: [], ops: [], goals: [], lists: {}
    };
  }
  function normalize(d) {
    const s = Object.assign(defaults(), d || {});
    s.settings = Object.assign(defaults().settings, s.settings || {});
    const ap = s.settings.autoPrice && typeof s.settings.autoPrice === 'object' ? s.settings.autoPrice : {};
    s.settings.autoPrice = { on: ap.on !== false, skip: Array.isArray(ap.skip) ? ap.skip.filter(d => typeof d === 'string').slice(-60) : [],
      last: typeof ap.last === 'number' ? ap.last : null, err: typeof ap.err === 'string' ? ap.err : null };
    s.categories = Object.assign(defaults().categories, s.categories || {});
    for (const k of ['accounts', 'tx', 'loans', 'fixed', 'debts', 'incomes', 'locations', 'ops', 'goals']) s[k] = Array.isArray(s[k]) ? s[k].filter(x => x && typeof x === 'object' && x.id) : [];
    s.prices = Array.isArray(s.prices) ? s.prices.filter(p => p && /^\d{4}\/\d{2}\/\d{2}$/.test(p.date || '')) : [];
    s.ops = s.ops.filter(o => /^\d{4}\/\d{2}\/\d{2}$/.test(o.date || '') && (o.in || o.out));
    s.locations = s.locations.filter(l => l.name);
    s.tx = s.tx.filter(t => typeof t.amount === 'number' && /^\d{4}\/\d{2}\/\d{2}$/.test(t.date || ''));
    s.loans = s.loans.filter(l => l.count > 0 && /^\d{4}\/\d{2}\/\d{2}$/.test(l.first || ''));
    s.loans.forEach(l => { l.paid = l.paid || {}; });
    s.fixed.forEach(f => { f.paid = f.paid || {}; });
    s.incomes.forEach(f => { f.paid = f.paid || {}; });
    s.debts.forEach(x => { x.settles = Array.isArray(x.settles) ? x.settles : []; if (!x.asset || !(window.V && V.ASSETS[x.asset])) x.asset = 'irr'; });
    s.lastCat = s.lastCat || {};
    s.lists = s.lists && typeof s.lists === 'object' ? s.lists : {};
    s.accounts.forEach(a => { if (!a.kind) a.kind = 'bank'; if (a.kind === 'credit') a.paid = a.paid || {}; });
    seedLists(s);
    return s;
  }
  let S;
  const bindInv = () => { if (window.Inv) window.Inv.bind(S); };
  function load() {
    try { const raw = localStorage.getItem(KEY); S = normalize(raw ? JSON.parse(raw) : null); }
    catch (e) { S = defaults(); }
    bindInv();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); return true; }
    catch (e) { toast('ذخیره نشد: حافظه‌ی مرورگر در دسترس نیست. از داده‌ها بکاپ بگیر.', 'bad'); return false; }
  }

  // ---------- پول ----------
  const unitLabel = () => S.settings.unit === 'toman' ? 'تومان' : 'ریال';
  const disp = rial => S.settings.unit === 'toman' ? rial / 10 : rial;
  const money = (rial, withUnit = true) => faNum(disp(rial)) + (withUnit ? ' ' + unitLabel() : '');
  const toRial = v => S.settings.unit === 'toman' ? v * 10 : v;

  // ---------- تاریخ ----------
  const monthName = ymStr => MONTHS[+ymStr.split('/')[1] - 1];
  const monthTitle = ymStr => `${monthName(ymStr)} ${faDigits(ymStr.split('/')[0])}`;
  const dateTitle = js => { const { y, m, d } = C.jParse(js); return `${faDigits(d)} ${MONTHS[m - 1]}${y !== C.jParse(today()).y ? ' ' + faDigits(y) : ''}`; };
  const dateFull = js => { const { y, m, d } = C.jParse(js); return `${faDigits(d)} ${MONTHS[m - 1]} ${faDigits(y)}`; };
  function relDay(js) {
    const n = C.diffDays(today(), js);
    if (n === 0) return 'امروز';
    if (n === 1) return 'فردا';
    if (n === -1) return 'دیروز';
    return n > 0 ? `${faDigits(n)} روز دیگر` : `${faDigits(-n)} روز گذشته`;
  }

  // ---------- فیلدهای فرم ----------
  function dateField(name, value, chips) {
    const { y, m, d } = C.jParse(value || today());
    const cy = C.jParse(today()).y;
    let ys = ''; for (let i = Math.min(cy - 4, y); i <= Math.max(cy + 12, y); i++) ys += `<option value="${i}" ${i === y ? 'selected' : ''}>${faDigits(i)}</option>`;
    const ms = MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${n}</option>`).join('');
    let ds = ''; for (let i = 1; i <= 31; i++) ds += `<option value="${i}" ${i === d ? 'selected' : ''}>${faDigits(i)}</option>`;
    return `<div class="datef" data-date="${name}">
      <select data-p="d" aria-label="روز">${ds}</select><select data-p="m" aria-label="ماه">${ms}</select><select data-p="y" aria-label="سال">${ys}</select>
      ${chips ? `<div class="chips mini"><button type="button" class="chip" data-setdate="0">امروز</button><button type="button" class="chip" data-setdate="-1">دیروز</button></div>` : ''}
    </div>`;
  }
  function readDate(root, name) {
    const w = $(`[data-date="${name}"]`, root);
    const y = +$('[data-p=y]', w).value, m = +$('[data-p=m]', w).value;
    const d = Math.min(+$('[data-p=d]', w).value, C.monthLen(y, m));
    return C.jStr(y, m, d);
  }
  function setDate(root, name, js) {
    const w = $(`[data-date="${name}"]`, root); const { y, m, d } = C.jParse(js);
    const ysel = $('[data-p=y]', w);
    if (![...ysel.options].some(o => +o.value === y)) ysel.insertAdjacentHTML('beforeend', `<option value="${y}">${faDigits(y)}</option>`);
    ysel.value = y; $('[data-p=m]', w).value = m; $('[data-p=d]', w).value = d;
  }
  function ymField(name, value, allowEmpty) {
    const cy = C.jParse(today()).y;
    const [y, m] = value ? value.split('/').map(Number) : [0, 0];
    let ys = allowEmpty ? `<option value="">—</option>` : '';
    for (let i = Math.min(cy - 4, y || cy); i <= Math.max(cy + 12, y || cy); i++) ys += `<option value="${i}" ${i === y ? 'selected' : ''}>${faDigits(i)}</option>`;
    const ms = (allowEmpty ? `<option value="">—</option>` : '') + MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${n}</option>`).join('');
    return `<div class="datef ym" data-ym="${name}"><select data-p="m" aria-label="ماه">${ms}</select><select data-p="y" aria-label="سال">${ys}</select></div>`;
  }
  function readYm(root, name) {
    const w = $(`[data-ym="${name}"]`, root);
    const y = $('[data-p=y]', w).value, m = $('[data-p=m]', w).value;
    return y && m ? `${y}/${C.pad(m)}` : null;
  }
  const amountInput = (name, rial, ph) => {
    const shown = rial ? faNum(disp(rial)) : '';
    return `<div class="amtwrap"><input class="amt" name="${name}" inputmode="numeric" autocomplete="off" placeholder="${ph || '۰'}" value="${shown}" data-orig="${rial || ''}" data-init="${shown}"><span>${unitLabel()}</span></div>`;
  };
  function readAmount(root, name) {
    const inp = $(`[name="${name}"]`, root);
    if (inp.dataset.orig && inp.value === inp.dataset.init) return Number(inp.dataset.orig); // مقدار دقیق ریالی دست‌نخورده
    const v = Number(C.normDigits(inp.value).replace(/[^\d]/g, '').slice(0, 15));
    return Math.round(toRial(v || 0));
  }
  const readInt = el => Number(C.normDigits(el.value).replace(/\D/g, '').slice(0, 6)) || 0;

  // ---------- تعهدات ----------
  const findOb = (kind, id) => (kind === 'loan' ? S.loans : kind === 'income' ? S.incomes : kind === 'credit' ? S.accounts : S.fixed).find(x => x.id === id);
  function getOb(kind, id, key) {
    const rec = findOb(kind, id); if (!rec) return null;
    const month = kind === 'loan' ? ym(C.loanDue(rec, +key)) : key;
    const list = kind === 'income' ? C.incomesForMonth(S, month) : kind === 'credit' ? creditItemsForMonth(month) : C.obligationsForMonth(S, month);
    return list.find(o => o.kind === kind && o.id === id && o.key === String(key)) || null;
  }
  function markPaid(kind, id, key, info) {
    const o = findOb(kind, id); if (!o) return;
    o.paid = o.paid || {}; o.paid[String(key)] = info;
  }
  function unmarkPaid(kind, id, key) {
    const o = findOb(kind, id); if (!o || !o.paid) return;
    const info = o.paid[String(key)]; delete o.paid[String(key)];
    if (info && info.txId) {
      const t = S.tx.find(x => x.id === info.txId);
      if (t) { if (t.auto) S.tx = S.tx.filter(x => x !== t); else delete t.link; }
    }
  }
  function unlinkAllFor(id) { S.tx.forEach(t => { if (t.link && t.link.id === id) delete t.link; }); }
  const obLabel = link => {
    const o = findOb(link.kind, link.id); if (!o) return 'تعهد حذف‌شده';
    return link.kind === 'loan' ? `${o.name}، قسط ${faDigits(+link.key + 1)}` : `${o.name}، ${monthTitle(link.key)}`;
  };
  const obDefaultCat = (kind, id) => (findOb(kind, id) || {}).cat || (kind === 'loan' ? 'قسط وام' : kind === 'income' ? 'حقوق' : 'پرداخت ماهانه');
  const isInc = kind => kind === 'income';
  const txTypeFor = kind => kind === 'income' ? 'income' : kind === 'credit' ? 'transfer' : 'expense';

  // ---------- بدهی و طلب ----------
  const debtLeft = d => d.amount - (d.settles || []).reduce((s, x) => s + x.amount, 0);
  const openDebts = () => S.debts.filter(d => debtLeft(d) > 0);
  // بدهی/طلب می‌تونه به هر واحد دارایی باشه (طلا، دلار، …)؛ جمع‌ها با ارزش امروز به ریال
  const dAsset = d => d.asset || 'irr';
  const debtVal = (d, q) => dAsset(d) === 'irr' ? q : window.Inv ? window.Inv.valueNow(dAsset(d), q) : null;
  const debtQty = (d, q, unit = true) => dAsset(d) === 'irr' ? money(q, unit) : window.Inv.qtyTxt(q, dAsset(d));
  const debtShow = (d, q) => {
    if (dAsset(d) === 'irr') return money(q);
    const v = debtVal(d, q);
    return `${esc(debtQty(d, q))} <small class="dval">${v === null ? 'بدون قیمت' : '≈ ' + money(v)}</small>`;
  };
  function debtTotals() {
    let owe = 0, owed = 0, unpriced = 0;
    openDebts().forEach(d => { const v = debtVal(d, debtLeft(d)); if (v === null) { unpriced++; return; } if (d.dir === 'owe') owe += v; else owed += v; });
    return { owe, owed, unpriced };
  }
  const debtTitle = d => (d.dir === 'owe' ? 'بدهکار به ' : 'طلبکار از ') + d.person;

  // ---------- حساب‌ها ----------
  // نام بانک پیامک («بلو»، «بانک سامان»…) به حساب‌های تعریف‌شده وصل می‌شه
  const bankKey = n => String(n || '').replace(/بانک|bank/gi, '').replace(/[\s\u200c]/g, '');
  function accountFor(bank, num) {
    const banks = S.accounts.filter(x => x.kind !== 'credit');
    let a = banks.find(x => x.bank === bank && (x.num || '') === (num || ''));
    if (!a) {
      const k = bankKey(bank);
      a = k && banks.find(x => { const xk = bankKey(x.bank || x.name); return xk && (xk === k || xk.startsWith(k) || k.startsWith(xk)) && (!x.num || !num || x.num === num); });
      if (a && num && !a.num) a.num = num;
    }
    if (!a) { a = { id: uid(), kind: 'bank', bank, num: num || '', name: bank + (num ? ' ' + num : ''), balance: null, stamp: '' }; S.accounts.push(a); }
    return a;
  }
  const bankAccounts = () => S.accounts.filter(a => a.kind !== 'credit');
  const creditAccounts = () => S.accounts.filter(a => a.kind === 'credit');
  // موجودی فعلی = لنگر (پیامک/ورود دستی) ± تراکنش‌های بعدش (Core.accountBalance)
  const accBal = a => C.accountBalance(S, a);
  const curBal = a => { const r = accBal(a); return r ? r.balance : null; };
  const nowStamp = () => { const d = new Date(); return today() + ' ' + C.pad(d.getHours()) + ':' + C.pad(d.getMinutes()); };
  const setAnchor = (a, balance, stamp) => { a.balance = balance; a.stamp = balance === null ? '' : stamp; a.at = Date.now(); };
  const bankTotal = () => bankAccounts().reduce((s, a) => { const b = curBal(a); return s + (b > 0 ? b : 0); }, 0);
  // صورت‌حساب اعتبار خرید: جمع خریدهای اعتباری هر ماه، سررسید روز آخر همون ماه
  function creditItemsForMonth(ymStr, txMap) {
    txMap = txMap || C.txAmountMap(S);
    const [y, m] = ymStr.split('/').map(Number), last = C.jStr(y, m, C.monthLen(y, m)), out = [];
    for (const a of creditAccounts()) {
      const spent = S.tx.filter(t => t.type === 'expense' && t.account === a.id && ym(t.date) === ymStr).reduce((s, t) => s + t.amount, 0);
      const info = a.paid && a.paid[ymStr];
      if (!spent && !info) continue;
      const paidAmt = info && info.txId && txMap.has(info.txId) ? txMap.get(info.txId) : spent;
      out.push({ kind: 'credit', id: a.id, key: ymStr, name: `صورت‌حساب ${a.name}`, sub: 'اعتبار خرید، تسویه آخر ماه',
        estimate: spent, amount: info ? paidAmt : spent, due: last, paid: !!info, variable: false });
    }
    return out;
  }
  // اعتبار مصرف‌شده: صورت‌حساب‌های تسویه‌نشده‌ی همه‌ی ماه‌ها
  function creditUsed(a) {
    const months = [...new Set(S.tx.filter(t => t.type === 'expense' && t.account === a.id).map(t => ym(t.date)))];
    return months.filter(m => !(a.paid && a.paid[m])).reduce((s, m) => s + S.tx.filter(t => t.type === 'expense' && t.account === a.id && ym(t.date) === m).reduce((x, t) => x + t.amount, 0), 0);
  }
  const creditUsedTotal = () => creditAccounts().reduce((s, a) => s + creditUsed(a), 0);
  const accName = id => (S.accounts.find(a => a.id === id) || {}).name || '';
  // انتقال: «از بلوبانک به سامان» / «از بلوبانک» / «به سامان»
  const txAccLabel = t => {
    if (t.type !== 'transfer') return accName(t.account);
    let from = accName(t.account), to = accName(t.to);
    if (!('to' in t)) { const d = t.debt && S.debts.find(x => x.id === t.debt); if (d && d.dir === 'owed') { to = from; from = ''; } }
    return from && to ? `از ${from} به ${to}` : from ? `از ${from}` : to ? `به ${to}` : '';
  };
  const accOpt = (a, sel) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`;
  const accOptions = (sel, withCredit) => `<option value="">بدون حساب</option><optgroup label="حساب بانکی">${bankAccounts().map(a => accOpt(a, sel)).join('')}</optgroup>`
    + (withCredit && creditAccounts().length ? `<optgroup label="اعتبار خرید (تسویه آخر ماه)">${creditAccounts().map(a => accOpt(a, sel)).join('')}</optgroup>` : '')
    + `<option value="__newbank">+ حساب بانکی جدید…</option>`;

  // ---------- UI عمومی ----------
  let toastTimer;
  function toast(msg, kind, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    t.className = 'show ' + (kind || '');
    if (action) $('button', t).onclick = () => { t.className = ''; action.fn(); };
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, action ? 5000 : 2800);
  }
  function openSheet(title, html, mount) {
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grab" aria-hidden="true"></div>
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="iconbtn" data-close aria-label="بستن">${IC.x}</button></div>
      <div class="sheet-body">${html}</div></div>`;
    document.body.appendChild(ov);
    document.body.classList.add('locked');
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('open')));
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) closeSheet(ov); });
    $$('input.amt', ov).forEach(bindAmount);
    $$('[data-setdate]', ov).forEach(b => b.addEventListener('click', () => {
      setDate(ov, b.closest('[data-date]').dataset.date, C.addDays(today(), +b.dataset.setdate));
    }));
    if (mount) mount(ov);
    return ov;
  }
  function closeSheet(ov) {
    ov = ov || $$('.overlay:not(.closing)').pop(); if (!ov || ov.classList.contains('closing')) return;
    ov.classList.add('closing'); ov.classList.remove('open');
    setTimeout(() => { ov.remove(); if (!$('.overlay')) document.body.classList.remove('locked'); }, reduceMotion() ? 0 : 260);
  }
  const closeAll = () => $$('.overlay').forEach(x => closeSheet(x));
  function bindAmount(inp) {
    inp.addEventListener('input', () => {
      const n = C.normDigits(inp.value).replace(/[^\d]/g, '').slice(0, 15);
      inp.value = n ? faNum(Number(n)) : '';
    });
    inp.addEventListener('focus', () => { if (inp.value) setTimeout(() => inp.select(), 0); });
  }
  function once(btn, fn) { // جلوگیری از ثبت دوباره با دو بار لمس؛ تابع می‌تونه async باشه
    btn.addEventListener('click', () => {
      if (btn.disabled) return; btn.disabled = true;
      Promise.resolve().then(fn).then(r => { if (r === false) btn.disabled = false; }, e => { btn.disabled = false; toast('خطا: ' + e.message, 'bad'); });
    });
  }

  // شمارش نرم عدد اصلی بعد از تغییر
  const openFolds = new Set();
  document.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.fold) d.open ? openFolds.add(d.dataset.fold) : openFolds.delete(d.dataset.fold); }, true);
  const foldAttr = key => `data-fold="${key}" ${openFolds.has(key) ? 'open' : ''}`;
  let lastHero = null;
  function animateHero() {
    const el = $('#heroNum'); if (!el) return;
    const to = Number(el.dataset.v);
    const from = lastHero; lastHero = to;
    if (from === null || from === to || reduceMotion()) return;
    const start = performance.now(), dur = 420;
    const ease = x => 1 - Math.pow(1 - x, 3);
    el.classList.add('ticking');
    const step = now => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = faNum(disp(from + (to - from) * ease(p)));
      if (p < 1) requestAnimationFrame(step); else { el.textContent = faNum(disp(to)); el.classList.remove('ticking'); }
    };
    requestAnimationFrame(step);
  }

  // ---------- صفحه‌ها ----------
  let tab = 'home', txMonth = ym(today()), txFilter = 'all', repMonth = ym(today()), obTab = 'loan';

  function render() {
    $$('.tabbar button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
    const v = $('#view');
    const views = { home: homeView, tx: txView, ob: obView, rep: repView, set: setView, inv: () => window.Inv ? window.Inv.view() : '' };
    v.innerHTML = (views[tab] || homeView)();
    if (window.Inv) window.Inv.afterRender(v);
    // هر نمودار اسم عنوانش رو می‌گیره تا VoiceOver بگه چه نموداریه
    $$('svg[role=img]:not([aria-label])', v).forEach(g => { const h = g.closest('figure, section'); const t = h && h.querySelector('h2'); g.setAttribute('aria-label', 'نمودار: ' + (t ? t.textContent.trim() : 'داده‌ها')); });
    $$('input.amt', v).forEach(bindAmount);
    if (tab === 'home') animateHero(); else lastHero = null;
  }
  let prevTab = 'home';
  const SUB = ['rep', 'set'];
  function go(t, push = true) {
    if (t !== tab && !SUB.includes(tab)) prevTab = tab;
    tab = t; render(); window.scrollTo(0, 0);
    if (push) try { history.pushState({ tab: t }, ''); } catch (e) { /* بعضی محیط‌ها */ }
  }
  window.addEventListener('popstate', e => {
    $$('.overlay').forEach(x => x.remove()); document.body.classList.remove('locked');
    go((e.state && e.state.tab) || 'home', false);
  });

  function accountsCard() {
    const banks = bankAccounts(), creds = creditAccounts();
    if (!banks.length && !creds.length) return '';
    const known = banks.filter(a => curBal(a) !== null);
    const accNote = a => { const r = accBal(a); if (!r) return '<em>موجودی ثبت نشده</em>';
      const src = a.stamp ? `موجودی ${dateTitle(a.stamp.slice(0, 10))}` : 'موجودی ثبت‌شده';
      return `<em>${r.n ? `${src}: ${money(r.base, false)}، ${faDigits(r.n)} تراکنش بعدش: <bdi dir="ltr">${r.delta >= 0 ? '+' : '−'}${money(Math.abs(r.delta), false)}</bdi>` : `طبق ${src}`}</em>`; };
    return `<section class="block"><div class="block-head"><h2>حساب‌ها</h2><button class="linkbtn" data-act="goset">ویرایش موجودی</button></div><ul class="accs">
      ${known.length ? `<li class="acc-total"><span>موجودی بانک‌ها</span><b>${money(bankTotal())}</b></li>` : ''}
      ${banks.map(a => { const b = curBal(a); return `<li><span>${esc(a.name)}</span><b class="${b < 0 ? 'neg' : ''}">${b === null ? '—' : money(b)}</b>${accNote(a)}</li>`; }).join('')}
      ${creds.map(a => { const u = creditUsed(a), lim = a.limit || 0, pct = lim ? Math.min(100, u / lim * 100) : 0;
        return `<li class="credit"><span>${esc(a.name)}</span><b>${money(Math.max(0, lim - u))} <small>مانده</small></b>
          <em>${money(u, false)} از ${money(lim, false)} استفاده شده</em><i class="cmeter"><i style="width:${pct}%"></i></i></li>`; }).join('')}
    </ul></section>`;
  }
  const headerTools = () => `<div class="hdr-tools"><button class="iconbtn gear" data-tab="rep" aria-label="گزارش مالی">${IC.chart}</button><button class="iconbtn gear" data-act="goset" aria-label="تنظیمات">${IC.gear}</button></div>`;
  const backBtn = () => `<button class="iconbtn gear" data-act="back" aria-label="برگشت">${IC.right}</button>`;
  function obRow(o) {
    const late = !o.paid && o.due < today();
    const soon = !o.paid && !late && C.diffDays(today(), o.due) <= 3;
    const inc = isInc(o.kind);
    return `<li class="ob ${inc ? 'inc' : ''} ${o.paid ? 'paid' : ''} ${late ? 'late' : ''}">
      <button class="tick" data-act="${o.paid ? 'unpay' : 'quickpay'}" data-k="${o.kind}" data-id="${esc(o.id)}" data-key="${esc(o.key)}"
        aria-label="${o.paid ? (inc ? 'برگرداندن دریافت' : 'برگرداندن پرداخت') : (inc ? 'دریافت' : 'پرداخت')} ${esc(o.name)}" aria-pressed="${o.paid}">${IC.check}</button>
      <button class="ob-body" data-act="pay" data-k="${o.kind}" data-id="${esc(o.id)}" data-key="${esc(o.key)}">
        <span class="ob-main"><strong>${esc(o.name)}</strong><span>${o.sub}، ${dateTitle(o.due)}</span></span>
        <span class="ob-side"><b class="${inc ? 'pos' : ''}">${inc ? '+' : ''}${o.variable && !o.paid ? '<i class="approx">حدود</i> ' : ''}${money(o.amount, false)}</b>
        <em class="${late && !inc ? 'bad' : soon ? 'warn' : ''}">${o.paid ? (inc ? 'دریافت شد' : 'پرداخت شد') : relDay(o.due)}</em></span>
      </button>
    </li>`;
  }

  function homeView() {
    const t = today(), cur = ym(t), st = C.monthStats(S, cur);
    const overdue = C.openObligations(S, cur, -3, -1);
    const overdueSum = overdue.reduce((s, o) => s + o.amount, 0);
    const byDue = (a, b) => a.due.localeCompare(b.due);
    const cf = C.cashFlow(S, cur, t), prevYm = C.addYm(cur, -1), prevCf = C.cashFlow(S, prevYm, t);
    const barMax = Math.max(cf.in, cf.out, 1), barW = v => v ? Math.max(2, Math.round(v / barMax * 100)) : 0;
    const pctTxt = r => `<bdi dir="ltr">${r < 0 ? '−' : ''}${faDigits(Math.round(Math.abs(r) * 100))}٪</bdi>`;
    const cred = creditItemsForMonth(C.addYm(cur, -1)).filter(c => !c.paid).concat(creditItemsForMonth(cur));
    const unpaidList = overdue.concat(st.obs.filter(o => !o.paid), st.inc.filter(i => !i.paid), cred.filter(c => !c.paid)).sort(byDue);
    const paidList = st.obs.filter(o => o.paid).concat(st.inc.filter(i => i.paid), cred.filter(c => c.paid)).sort(byDue);
    const recent = S.tx.slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || (b.created || 0) - (a.created || 0)).slice(0, 4);
    const backupDays = S.settings.lastBackup ? Math.floor((Date.now() - S.settings.lastBackup) / 864e5) : null;
    const hasData = S.tx.length + S.loans.length + S.fixed.length + S.debts.length > 0;
    const needBackup = hasData && (backupDays === null || backupDays >= 7);
    const { owe, owed } = debtTotals();
    const totalLoanDebt = S.loans.reduce((s, l) => s + C.loanSummary(l).remainingAmount, 0);
    return `
    <header class="top home-top"><div><p class="eyebrow"><span class="brand">VAULT</span> ${C.weekday(t)} ${dateTitle(t)}</p><h1>${monthTitle(cur)}</h1></div>${headerTools()}</header>
    <section class="hero cash" aria-labelledby="heroLabel">
      <p class="hero-label" id="heroLabel">جریان نقدی ${monthName(cur)} تا امروز</p>
      <div class="flow">
        <div class="fl in"><span>آمد</span><b><bdi dir="ltr">${cf.in ? '+' : ''}${money(cf.in, false)}</bdi></b></div>
        <div class="fbar" aria-hidden="true"><i class="in" style="width:${barW(cf.in)}%"></i></div>
        ${cf.assumed ? `<p class="fparts">${esc(cf.assumedNames.join('، '))} طبق برنامه حساب شده (روزش رسیده ولی «دریافت شد» نخورده).</p>` : ''}
        <div class="fl out"><span>رفت <i>(قسط، قبض، روزمره)</i></span><b><bdi dir="ltr">${cf.out ? '−' : ''}${money(cf.out, false)}</bdi></b></div>
        <div class="fbar" aria-hidden="true"><i class="out" style="width:${barW(cf.out)}%"></i></div>
        ${cf.out ? `<p class="fparts">قسط ${money(cf.loans, false)}، قبض ${money(cf.bills, false)}، روزمره ${money(cf.daily, false)}</p>` : ''}
      </div>
      <div class="save">
        <p class="hero-label">${cf.net < 0 ? `کسری ${monthName(cur)}` : `پس‌انداز ${monthName(cur)}`}</p>
        <p class="hero-num"><span id="heroNum" data-v="${Math.abs(cf.net)}">${faNum(disp(Math.abs(cf.net)))}</span><small>${unitLabel()}</small></p>
        ${cf.rate !== null || prevCf.rate !== null ? `<p class="hero-sub">${cf.rate !== null ? `${pctTxt(cf.rate)} از درآمد` : ''}${cf.rate !== null && prevCf.rate !== null ? '، ' : ''}${prevCf.rate !== null ? `${monthName(prevYm)}: ${pctTxt(prevCf.rate)}` : ''}</p>` : ''}
        ${!cf.in && !cf.out ? `<p class="hero-sub">هنوز واریز یا برداشتی در ${monthName(cur)} ثبت نشده.</p>` : ''}
      </div>
      ${cf.pending || st.obRemaining || overdueSum ? `<dl class="eq">
        ${cf.pending ? `<div class="incrow"><dt>درآمد در راه</dt><dd>+${money(cf.pending, false)}</dd></div>` : ''}
        ${st.obRemaining ? `<div><dt>تعهدات مانده‌ی ${monthName(cur)}${st.varRemaining ? ' <i>(حدود)</i>' : ''}</dt><dd><bdi dir="ltr">−${money(st.obRemaining, false)}</bdi></dd></div>` : ''}
        ${overdueSum ? `<div class="bad"><dt>عقب‌افتاده از ماه‌های قبل</dt><dd><bdi dir="ltr">−${money(overdueSum, false)}</bdi></dd></div>` : ''}
      </dl>` : ''}
    </section>
    <nav class="quick" aria-label="کارهای سریع">
      <button data-act="add" data-type="expense"><span class="qi out">${IC.out}</span>ثبت برداشت</button>
      <button data-act="add" data-type="income"><span class="qi in">${IC.in}</span>ثبت واریز</button>
      <button data-act="paste"><span class="qi">${IC.paste}</span>چسباندن پیامک یا قیمت</button>
      <button data-act="duelist"><span class="qi">${IC.cal}</span>پرداخت قسط</button>
    </nav>
    ${window.Inv ? window.Inv.homeCard() : ''}
    ${needBackup ? `<div class="banner"><span>${backupDays === null ? 'هنوز از داده‌ها بکاپ نگرفتی.' : `${faDigits(backupDays)} روزه که بکاپ نگرفتی.`} اگه Safari داده‌ها رو پاک کنه یا گوشی عوض بشه، بکاپ تنها راه برگشته.</span><button class="btn small" data-act="backup">بکاپ بگیر</button></div>` : ''}
    <section class="block">
      <div class="block-head"><h2>پیش رو در ${monthName(cur)}</h2>${unpaidList.length ? `<span class="count">${faDigits(unpaidList.length)} مورد</span>` : ''}</div>
      ${unpaidList.length ? `<ul class="oblist">${unpaidList.map(obRow).join('')}</ul>` :
        `<p class="empty">${st.count || st.inc.length ? 'همه‌ی پرداخت‌ها و دریافت‌های این ماه انجام شده.' : 'هنوز قسط، قبض یا درآمد ثابتی ثبت نشده. از تب «برنامه» اضافه‌شون کن تا سررسیدها اینجا بیان.'} ${st.count || st.inc.length ? '' : `<button class="linkbtn" data-act="goob">برنامه</button>`}</p>`}
      ${paidList.length ? `<details class="fold" ${foldAttr('homePaid')}><summary>${IC.down}انجام‌شده‌ها (${faDigits(paidList.length)})</summary><ul class="oblist">${paidList.map(obRow).join('')}</ul></details>` : ''}
    </section>
    <section class="block">
      <div class="block-head"><h2>آخرین تراکنش‌ها</h2>${S.tx.length ? `<button class="linkbtn" data-tab="tx">همه</button>` : ''}</div>
      ${recent.length ? `<ul class="txlist">${recent.map(txRow).join('')}</ul>` : `<p class="empty">هنوز تراکنشی ثبت نشده. با دکمه‌ی + پایین صفحه، اولین برداشت یا واریز رو ثبت کن.</p>`}
    </section>
    ${totalLoanDebt || owe || owed ? `<section class="block"><h2>کل بدهی و طلب</h2><div class="sums three">
      <button class="sum" data-act="goloan"><span>مانده‌ی وام‌ها</span><b>${money(totalLoanDebt, false)}</b></button>
      <button class="sum" data-act="godebt"><span>بدهی به اشخاص</span><b class="${owe ? 'neg' : ''}">${money(owe, false)}</b></button>
      <button class="sum" data-act="godebt"><span>طلب از اشخاص</span><b class="${owed ? 'pos' : ''}">${money(owed, false)}</b></button></div></section>` : ''}
    ${accountsCard()}
    ${!cf.in && cf.out ? `<p class="footnote">واریزی برای ${monthName(cur)} ثبت نشده. حقوق یا درآمدت رو ثبت کن تا پس‌انداز ماه درست حساب بشه.</p>` : ''}
    `;
  }

  // دکمه‌ی راست = ماه قبل (فلش به راست)، دکمه‌ی چپ = ماه بعد (فلش به چپ)
  const monthSwitch = (cur, act) => `<div class="mswitch">
    <button data-act="${act}" data-d="-1" aria-label="ماه قبل">${IC.right}</button>
    <strong>${monthTitle(cur)}</strong>
    <button data-act="${act}" data-d="1" aria-label="ماه بعد">${IC.left}</button></div>`;

  let txQuery = '';
  function txMatches(t, q) {
    if (!q) return true;
    const nq = C.normDigits(q).replace(/[,٬\s]/g, '');
    const hay = [t.note, t.cat, accName(t.account), accName(t.to), obLabelSafe(t)].join(' ');
    if (hay.includes(q.trim())) return true;
    return /^\d{3,}$/.test(nq) && String(Math.round(disp(t.amount))).includes(nq);
  }
  const obLabelSafe = t => t.link ? obLabel(t.link) : '';
  function txListHtml() {
    const q = txQuery.trim();
    const pool = q ? S.tx : S.tx.filter(t => ym(t.date) === txMonth);
    const list = pool.filter(t => (txFilter === 'all' || t.type === txFilter) && txMatches(t, q))
      .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || (b.created || 0) - (a.created || 0));
    const groups = {}; list.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
    if (!list.length) return q ? `<p class="empty">برای «${esc(q)}» تراکنشی پیدا نشد. توضیح، دسته، حساب یا مبلغ رو امتحان کن.</p>`
      : `<p class="empty">توی ${monthTitle(txMonth)} تراکنشی ثبت نشده. با دکمه‌ی + یا «چسباندن پیامک» ثبتش کن.</p>`;
    return (q ? `<p class="note">${faDigits(list.length)} نتیجه در همه‌ی ماه‌ها</p>` : '') + Object.keys(groups).map(dt => {
      const net = groups[dt].reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
      return `<section class="day-group"><h3><span>${C.weekday(dt)} ${dateTitle(dt)}</span>${net ? `<span class="dnet ${net > 0 ? 'pos' : ''}"><bdi dir="ltr">${net > 0 ? '+' : '−'}${money(Math.abs(net), false)}</bdi></span>` : ''}</h3><ul class="txlist">${groups[dt].map(txRow).join('')}</ul></section>`;
    }).join('');
  }
  function txView() {
    const inMonth = S.tx.filter(t => ym(t.date) === txMonth);
    const inc = inMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const out = inMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return `
    <header class="top home-top"><h1>تراکنش‌ها</h1>${headerTools()}</header>
    <div class="searchbox">${IC.search}<input id="txq" type="search" inputmode="search" placeholder="جست‌وجو: توضیح، دسته، حساب یا مبلغ" value="${esc(txQuery)}" aria-label="جست‌وجوی تراکنش‌ها"></div>
    ${txQuery ? '' : monthSwitch(txMonth, 'txm')}
    ${txQuery ? '' : `<div class="sums"><div class="sum"><span>واریز (درآمد)</span><b class="pos">${money(inc)}</b></div><div class="sum"><span>برداشت (خرج)</span><b class="neg">${money(out)}</b></div></div>`}
    <div class="chips seg" role="group" aria-label="فیلتر">${[['all', 'همه'], ['expense', 'برداشت'], ['income', 'واریز'], ['transfer', 'انتقال']].map(([k, n]) =>
      `<button class="chip ${txFilter === k ? 'on' : ''}" data-act="txf" data-f="${k}" aria-pressed="${txFilter === k}">${n}</button>`).join('')}</div>
    <div id="txlist">${txListHtml()}</div>
    <button class="fab" data-act="chooser" aria-label="ثبت تراکنش">${IC.plus}</button>`;
  }
  document.addEventListener('input', e => {
    if (e.target.id !== 'txq') return;
    const had = !!txQuery; txQuery = e.target.value;
    if (!!txQuery !== had) { const pos = e.target.selectionStart; render(); const i = $('#txq'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
    else { const box = $('#txlist'); if (box) box.innerHTML = txListHtml(); }
  });
  function txRow(t) {
    const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
    const title = t.cat || (t.debt ? 'بدهی و طلب' : t.type === 'transfer' ? 'انتقال داخلی' : 'بدون دسته');
    const sub = [t.link ? (t.link.kind === 'income' ? 'درآمد ثابت' : 'قسط/قبض') : '', txAccLabel(t), t.time ? faDigits(t.time) : ''].filter(Boolean).map(esc).join('، ');
    return `<li><button class="txrow" data-act="edit" data-id="${esc(t.id)}">
      ${t.type === 'transfer' ? catIcon(null, 'swap') : catIcon(t.cat || (t.link ? 'قسط' : ''), t.type === 'income' ? 'plus' : 'dots')}
      <span class="tx-main"><strong>${esc(title)}</strong>${t.note ? `<span>${esc(t.note)}</span>` : ''}${sub ? `<span class="meta">${sub}</span>` : ''}</span>
      <b class="${t.type === 'income' ? 'pos' : t.type === 'expense' ? 'neg' : ''}"><bdi dir="ltr">${sign}${money(t.amount, false)}</bdi></b></button></li>`;
  }

  function obView() {
    const cur = ym(today());
    const loanCard = l => {
      const s = C.loanSummary(l); const pct = Math.round(s.paidCount / l.count * 100);
      return `<li><button class="card loan" data-act="loan" data-id="${esc(l.id)}">
        <div class="lc-top"><strong>${esc(l.name)}</strong><span>${esc([l.lender, l.store].filter(x => x && !l.name.includes(x)).join('، '))}</span></div>
        <div class="meter light" aria-hidden="true"><i style="width:${pct}%"></i></div>
        <div class="lc-grid">
          <div><span>قسط ماهانه</span><b>${money(l.amount, false)}</b></div>
          <div><span>پرداخت‌شده</span><b>${faDigits(s.paidCount)} از ${faDigits(l.count)}</b></div>
          <div><span>مانده‌ی بدهی</span><b>${money(s.remainingAmount, false)}</b></div>
          <div><span>${s.next ? 'قسط بعدی' : 'وضعیت'}</span><b class="${s.next && s.next.due < today() ? 'neg' : ''}">${s.next ? dateTitle(s.next.due) : 'تسویه شد'}</b></div>
        </div>
        ${s.remainingCount ? `<p class="lc-end">آخرین قسط: ${dateFull(s.last)}${l.restDay ? `، اقساط روز ${faDigits(l.restDay)} هر ماه` : ''}</p>` : ''}
        ${l.restDay ? `<span class="tag info">خرید قسطی</span>` : ''}
      </button></li>`;
    };
    const activeL = S.loans.filter(l => C.loanSummary(l).remainingCount > 0), doneL = S.loans.filter(l => C.loanSummary(l).remainingCount <= 0);
    const fixedCard = f => {
      const active = (!f.start || cur >= f.start) && (!f.end || cur <= f.end);
      const paid = f.paid && f.paid[cur];
      return `<li><button class="card fixed" data-act="fixed" data-id="${esc(f.id)}">
        <div class="lc-top"><strong>${esc(f.name)}</strong><span>روز ${faDigits(f.day)} هر ماه</span></div>
        <div class="fx-row"><b>${f.variable ? '<i class="approx">حدود</i> ' : ''}${money(f.amount)}</b>
          <em class="${paid ? 'ok' : active ? 'warn' : ''}">${!active ? 'غیرفعال' : paid ? 'این ماه پرداخت شد' : 'این ماه پرداخت نشده'}</em></div>
        ${f.variable ? `<span class="tag">متغیر، پیش‌بینی</span>` : ''}
      </button></li>`;
    };
    const fxActive = S.fixed.filter(f => !f.end || f.end >= cur), fxEnded = S.fixed.filter(f => f.end && f.end < cur);
    const totalDebt = S.loans.reduce((s, l) => s + C.loanSummary(l).remainingAmount, 0);
    const monthly = C.monthStats(S, cur).obTotal;
    const fold = (title, items, key) => items ? `<details class="fold" ${foldAttr(key)}><summary>${IC.down}${title}</summary><ul class="cards">${items}</ul></details>` : '';
    let body = '';
    if (obTab === 'loan') {
      body = (activeL.length ? `<ul class="cards">${activeL.map(loanCard).join('')}</ul>` : `<p class="empty">${doneL.length ? 'وام فعالی نداری.' : 'وامی ثبت نشده. مبلغ قسط، تعداد اقساط و تاریخ اولین قسط رو از قرارداد بردار.'}</p>`)
        + fold(`تسویه‌شده‌ها (${faDigits(doneL.length)})`, doneL.map(loanCard).join(''), 'loansDone')
        + `<button class="btn wide" data-act="newloan">${IC.plus}افزودن وام یا خرید قسطی</button>`;
    } else if (obTab === 'fixed') {
      body = (fxActive.length ? `<ul class="cards">${fxActive.map(fixedCard).join('')}</ul>` : `<p class="empty">قبض‌ها، اشتراک‌ها و هر پرداختی که هر ماه تکرار می‌شه رو اینجا اضافه کن. اگه مبلغش هر ماه فرق می‌کنه، «متغیر» علامتش بزن.</p>`)
        + fold(`پایان‌یافته‌ها (${faDigits(fxEnded.length)})`, fxEnded.map(fixedCard).join(''), 'fixedEnded')
        + `<button class="btn wide" data-act="newfixed">${IC.plus}افزودن پرداخت ماهانه</button>`;
    } else if (obTab === 'income') body = incomeList();
    else body = debtList();
    return `
    <header class="top home-top"><h1>برنامه</h1>${headerTools()}</header>
    ${obTab === 'loan' || obTab === 'fixed' ? `<div class="sums"><div class="sum"><span>تعهد ${monthName(cur)}</span><b>${money(monthly)}</b></div><div class="sum"><span>کل مانده‌ی وام‌ها</span><b>${money(totalDebt)}</b></div></div>` : ''}
    <div class="chips seg" role="group" aria-label="بخش‌های برنامه">${[['income', 'درآمد ثابت'], ['loan', 'اقساط'], ['fixed', 'قبض‌ها'], ['debt', 'بدهی و طلب']].map(([k, n]) =>
      `<button class="chip ${obTab === k ? 'on' : ''}" data-act="obt" data-t="${k}" aria-pressed="${obTab === k}">${n}</button>`).join('')}</div>
    ${body}`;
  }
  function incomeList() {
    const cur = ym(today()), items = C.incomesForMonth(S, cur);
    const card = f => {
      const it = items.find(x => x.id === f.id);
      const active = !!it;
      return `<li><button class="card fixed incard" data-act="income" data-id="${esc(f.id)}">
        <div class="lc-top"><strong>${catIcon(f.cat || 'حقوق')}${esc(f.name)}</strong><span>روز ${faDigits(f.day)} هر ماه</span></div>
        <div class="fx-row"><b class="pos">+${f.variable ? '<i class="approx">حدود</i> ' : ''}${money(f.amount)}</b>
          <em class="${it && it.paid ? 'ok' : active ? 'warn' : ''}">${!active ? 'غیرفعال' : it.paid ? `${monthName(cur)} دریافت شد` : `در انتظار، ${relDay(it.due)}`}</em></div>
        ${f.variable ? `<span class="tag">متغیر، پیش‌بینی</span>` : ''}
      </button></li>`;
    };
    const total = items.reduce((s, x) => s + x.amount, 0);
    return (S.incomes.length ? `<div class="sums"><div class="sum"><span>درآمد ثابت ${monthName(cur)}</span><b class="pos">${money(total)}</b></div><div class="sum"><span>در انتظار</span><b>${money(items.filter(x => !x.paid).reduce((s, x) => s + x.amount, 0))}</b></div></div>
      <ul class="cards">${S.incomes.map(card).join('')}</ul>`
      : `<p class="empty">حقوق، اجاره‌ای که می‌گیری یا هر درآمدی که هر ماه تکرار می‌شه رو اینجا اضافه کن. روز مورد انتظارش رو بگو تا در «پیش رو» بیاد و «مانده برای خرج» حساب بشه.</p>`)
      + `<button class="btn wide" data-act="newincome">${IC.plus}افزودن درآمد ثابت</button>`;
  }
  function openIncomeForm(id) {
    const f = id ? S.incomes.find(x => x.id === id) : null;
    const cur = ym(today()), it = f && C.incomesForMonth(S, cur).find(x => x.id === f.id);
    const cats = withSel(S.categories.income, f && f.cat);
    const html = `
      ${it ? `<button class="btn wide ${it.paid ? 'ghost' : ''}" id="ipay">${it.paid ? `برگرداندن دریافت ${monthName(cur)}` : `${IC.check}ثبت دریافت ${monthName(cur)}`}</button>` : ''}
      <label class="lbl" for="iname">عنوان</label><input id="iname" value="${esc(f ? f.name : '')}" placeholder="مثلاً حقوق شرکت">
      <label class="check"><input type="checkbox" id="ivar" ${f && f.variable ? 'checked' : ''}> مبلغش هر ماه فرق می‌کنه (پیش‌بینی)</label>
      <label class="lbl">${f && f.variable ? 'مبلغ پیش‌بینی ماهانه' : 'مبلغ ماهانه'}</label>${amountInput('iamount', f ? f.amount : 0)}
      <label class="lbl" for="iday">روز مورد انتظار در ماه</label><input id="iday" inputmode="numeric" value="${f ? faDigits(f.day) : ''}" placeholder="۱ تا ۳۱">
      <label class="lbl" for="icat">دسته</label><select id="icat">${cats.map(c => `<option ${c === ((f && f.cat) || 'حقوق') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label class="lbl" for="iacc">به کدوم حساب واریز می‌شه؟</label><select id="iacc">${accOptions(f ? f.account : '')}</select>
      <label class="lbl">از ماه</label>${ymField('istart', f ? f.start : cur)}
      <label class="lbl">تا ماه</label>${ymField('iend', f ? f.end : null, true)}
      <p class="note">اگه پایان مشخصی نداره، «تا ماه» رو خالی بذار.</p>
      <div class="btnrow"><button class="btn wide" id="isave">${f ? 'ذخیره‌ی تغییرات' : 'افزودن درآمد'}</button>${f ? `<button class="btn danger" id="idel">حذف</button>` : ''}</div>`;
    openSheet(f ? f.name : 'درآمد ثابت جدید', html, ov => {
      if (it) $('#ipay', ov).addEventListener('click', () => { closeSheet(ov); if (it.paid) askUnpay('income', f.id, cur); else setTimeout(() => openPay('income', f.id, cur), 200); });
      once($('#isave', ov), () => {
        const name = $('#iname', ov).value.trim(), amount = readAmount(ov, 'iamount'), day = readInt($('#iday', ov));
        const start = readYm(ov, 'istart'), end = readYm(ov, 'iend');
        if (!name || !amount || !(day >= 1 && day <= 31)) { toast('عنوان، مبلغ و روز مورد انتظار (۱ تا ۳۱) لازمه.', 'bad'); return false; }
        if (end && end < start) { toast('«تا ماه» نمی‌تونه قبل از «از ماه» باشه.', 'bad'); return false; }
        const rec = f || { id: uid(), paid: {} };
        Object.assign(rec, { name, amount, day, start, end, variable: $('#ivar', ov).checked, cat: $('#icat', ov).value, account: $('#iacc', ov).value });
        if (!f) S.incomes.push(rec);
        save(); closeSheet(ov); obTab = 'income'; if (tab !== 'ob') go('ob'); else render(); toast(f ? 'ذخیره شد.' : 'درآمد ثابت اضافه شد.');
      });
      if (f) $('#idel', ov).addEventListener('click', () => {
        if (!confirm(`«${f.name}» حذف بشه؟ واریزهایی که قبلاً ثبت شدن می‌مونن.`)) return;
        unlinkAllFor(f.id); S.incomes = S.incomes.filter(x => x !== f); save(); closeSheet(ov); render(); toast('حذف شد.');
      });
    });
  }

  // ---------- مرکز ثبت (+) — الگو: BudgetBakers / Lunch Money
  function openAddHub() {
    const tile = (act, icon, label, extra = '') => `<button class="hubtile" data-act="${act}" ${extra}><span class="qi">${icon}</span><span>${label}</span></button>`;
    const inv = !!window.Inv;
    const html = `
      <h3 class="grp">پول روزانه</h3><div class="hubgrid two-col">
        ${tile('add', IC.out, 'برداشت', 'data-type="expense"')}${tile('add', IC.in, 'واریز', 'data-type="income"')}
        ${tile('paste', IC.paste, 'چسباندن پیامک یا قیمت')}${tile('add', IC.swap, 'انتقال بین حساب‌ها', 'data-type="transfer"')}</div>
      <h3 class="grp">برنامه</h3><div class="hubgrid">
        ${tile('duelist', IC.check, 'پرداخت قسط یا قبض')}${tile('newincome', IC.salary, 'درآمد ثابت (حقوق)')}
        ${tile('newloan', IC.cal, 'وام یا خرید قسطی')}${tile('newfixed', IC.cal, 'قبض ماهانه')}${tile('newdebt', IC.swap, 'بدهی یا طلب', 'data-dir="owe"')}${tile('goob', IC.chart, 'دیدن همه‌ی برنامه')}</div>
      ${inv ? `<h3 class="grp">دارایی</h3><div class="hubgrid">
        ${tile('op', IC.in, 'خرید دارایی', 'data-type="buy"')}${tile('op', IC.out, 'فروش دارایی', 'data-type="sell"')}
        ${tile('op', IC.gift, 'هدیه گرفتم', 'data-type="gift_in"')}${tile('prices', IC.chart, 'به‌روزرسانی قیمت‌ها')}${tile('opchooser', IC.plus, 'عملیات دیگه')}${tile('goinv', IC.salary, 'دیدن دارایی‌ها')}</div>` : ''}`;
    openSheet('ثبت کن', html, ov => {
      // هر انتخاب: اول این ورقه بسته می‌شه، بعد فرم مربوط باز می‌شه
      $('.sheet-body', ov).addEventListener('click', e => { if (e.target.closest('[data-act]')) closeSheet(ov); });
    });
  }

  function debtList() {
    const { owe, owed, unpriced } = debtTotals();
    const open = openDebts().sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const done = S.debts.filter(d => debtLeft(d) <= 0).sort((a, b) => (b.closed || '').localeCompare(a.closed || ''));
    const card = d => {
      const left = debtLeft(d), paid = d.amount - left;
      return `<li><button class="card debt ${d.dir}" data-act="debtd" data-id="${esc(d.id)}">
        <div class="lc-top"><strong>${esc(debtTitle(d))}</strong><span>${left > 0 ? (d.due ? 'موعد ' + dateTitle(d.due) : 'بدون موعد') : 'تسویه شد'}</span></div>
        <div class="fx-row"><b class="${left > 0 ? (d.dir === 'owe' ? 'neg' : 'pos') : ''}">${debtShow(d, left > 0 ? left : d.amount)}</b>${paid > 0 && left > 0 ? `<em>${esc(debtQty(d, paid, false))} از ${esc(debtQty(d, d.amount))} تسویه شده</em>` : ''}</div>
        ${d.note ? `<p class="lc-end">${esc(d.note)}</p>` : ''}
      </button></li>`;
    };
    return `<div class="sums"><div class="sum"><span>بدهی من</span><b class="neg">${money(owe)}</b></div><div class="sum"><span>طلب من</span><b class="pos">${money(owed)}</b></div></div>
      ${S.debts.some(d => dAsset(d) !== 'irr' && debtLeft(d) > 0) ? `<p class="note">طلا، دلار و بقیه‌ی دارایی‌ها با قیمت امروز به تومان حساب شده‌ن.${unpriced ? ` ${faDigits(unpriced)} مورد هنوز قیمت نداره و در جمع نیست.` : ''}</p>` : ''}
      ${open.length ? `<ul class="cards">${open.map(card).join('')}</ul>` : `<p class="empty">بدهی یا طلب بازی نداری.</p>`}
      ${done.length ? `<details class="fold" ${foldAttr('debtsDone')}><summary>${IC.down}تسویه‌شده‌ها (${faDigits(done.length)})</summary><ul class="cards">${done.map(card).join('')}</ul></details>` : ''}
      <div class="btnrow"><button class="btn wide" data-act="newdebt" data-dir="owe">بدهکارم به…</button><button class="btn wide ghost" data-act="newdebt" data-dir="owed">طلبکارم از…</button></div>`;
  }

  // ---------- نمودارها (SVG دست‌ساز؛ زمان از راست به چپ) ----------
  function shortMoney(rial) {
    const v = Math.abs(disp(rial)), sign = rial < 0 ? '−' : '';
    const f = (x, d) => faDigits((+x.toFixed(d)).toString()).replace('.', '٫');
    if (v >= 1e9) return sign + f(v / 1e9, 1) + ' میلیارد';
    if (v >= 1e6) return sign + f(v / 1e6, v >= 1e8 ? 0 : 1) + ' م';
    if (v >= 1e3) return sign + f(v / 1e3, 0) + ' هزار';
    return sign + faNum(v);
  }
  const pct = (x, d = 0) => x === null || x === undefined || !isFinite(x) ? '—' : faDigits((x * 100).toFixed(d)).replace('.', '٫') + '٪';
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * p >= v) return f * p;
    return 10 * p;
  }
  const W = 340, PR = 46, PL = 6, PT = 10, PB = 26;
  function axis(max, H) {
    const ph = H - PT - PB; let g = '';
    for (const f of [0, 0.5, 1]) {
      const y = PT + ph * (1 - f);
      g += `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}"/><text class="ax" x="${W - 2}" y="${y + 4}" text-anchor="end">${f ? shortMoney(max * f) : '۰'}</text>`;
    }
    return g;
  }
  // ستونی (انباشته یا گروهی) + خط اختیاری؛ tips: متن هر ستون برای لمس
  function barChart({ labels, series, stacked = true, line = null, tips, H = 180, labelEvery = 1 }) {
    const n = labels.length, pw = W - PR - PL, ph = H - PT - PB, step = pw / n;
    const tot = i => stacked ? series.reduce((s, se) => s + se.values[i], 0) : Math.max(...series.map(se => se.values[i]));
    const max = niceMax(Math.max(1, ...labels.map((_, i) => tot(i)), ...(line ? line.values : [0])));
    const y = v => PT + ph * (1 - v / max);
    let g = axis(max, H), hits = '';
    labels.forEach((lab, i) => {
      const cx = PL + pw - step * (i + 0.5);
      if (stacked) {
        const bw = Math.min(26, step * 0.58); let acc = 0;
        series.forEach(se => { const v = se.values[i]; if (v > 0) { g += `<rect class="${se.cls}" x="${cx - bw / 2}" y="${y(acc + v)}" width="${bw}" height="${Math.max(1, y(acc) - y(acc + v))}" rx="3"/>`; } acc += v; });
      } else {
        const k = series.length, bw = Math.min(16, step * 0.8 / k);
        series.forEach((se, j) => { const v = se.values[i]; const x = cx + (k / 2 - j - 1) * bw; if (v > 0) g += `<rect class="${se.cls}" x="${x + 1}" y="${y(v)}" width="${bw - 2}" height="${Math.max(1, y(0) - y(v))}" rx="3"/>`; });
      }
      if (i % labelEvery === 0) g += `<text class="ax" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
      hits += `<rect class="hit" x="${cx - step / 2}" y="${PT}" width="${step}" height="${ph}" data-tip="${esc(tips[i])}"/>`;
    });
    if (line) {
      const pts = line.values.map((v, i) => `${PL + pw - step * (i + 0.5)},${y(v)}`);
      g += `<polyline class="ln ${line.cls}" points="${pts.join(' ')}"/>` + line.values.map((v, i) => `<circle class="${line.cls}" cx="${PL + pw - step * (i + 0.5)}" cy="${y(v)}" r="3"/>`).join('');
    }
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img">${g}${hits}</svg>`;
  }
  function lineChart({ labels, series, tips, H = 180, labelEvery = 1, area = false }) {
    const n = labels.length, pw = W - PR - PL, ph = H - PT - PB;
    const max = niceMax(Math.max(1, ...series.flatMap(se => se.values.filter(v => v !== null))));
    const x = i => n === 1 ? PL + pw / 2 : PL + pw - pw * i / (n - 1), y = v => PT + ph * (1 - v / max);
    let g = axis(max, H), hits = '';
    series.forEach(se => {
      const pts = se.values.map((v, i) => v === null ? null : `${x(i)},${y(v)}`).filter(Boolean);
      if (area && pts.length) g += `<polygon class="area ${se.cls}" points="${x(0)},${y(0)} ${pts.join(' ')} ${x(se.values.filter(v => v !== null).length - 1)},${y(0)}"/>`;
      g += `<polyline class="ln ${se.cls} ${se.dash ? 'dash' : ''}" points="${pts.join(' ')}"/>`;
    });
    const step = n > 1 ? pw / (n - 1) : pw;
    labels.forEach((lab, i) => {
      if (lab && i % labelEvery === 0) g += `<text class="ax" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
      hits += `<rect class="hit" x="${x(i) - step / 2}" y="${PT}" width="${step}" height="${ph}" data-tip="${esc(tips[i])}"/>`;
    });
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img">${g}${hits}</svg>`;
  }
  function donut(segs, centerTop, centerBottom) {
    const total = segs.reduce((s, x) => s + x.value, 0) || 1, r = 54, c = 2 * Math.PI * r; let off = 0, g = '';
    segs.forEach(sg => {
      const len = sg.value / total * c;
      g += `<circle class="seg ${sg.cls}" cx="70" cy="70" r="${r}" stroke-dasharray="${Math.max(0, len - 1.5)} ${c}" stroke-dashoffset="${-off}" data-tip="${esc(sg.tip)}"/>`;
      off += len;
    });
    return `<svg class="donut" viewBox="0 0 140 140" role="img"><g transform="rotate(-90 70 70)">${g}</g>
      <text x="70" y="66" text-anchor="middle" class="dc1">${esc(centerTop)}</text><text x="70" y="86" text-anchor="middle" class="dc2">${esc(centerBottom)}</text></svg>`;
  }
  const figure = (title, sub, svgHtml, legend, hint = 'روی نمودار بزن تا عددها رو ببینی') => `<figure class="chart card-block">
    <h2>${title}</h2>${sub ? `<p class="note">${sub}</p>` : ''}${svgHtml}
    ${legend ? `<div class="legend">${legend.map(([cls, name]) => `<span><i class="k ${cls}"></i>${name}</span>`).join('')}</div>` : ''}
    <figcaption class="tip">${hint}</figcaption></figure>`;
  function delta(cur, prev, lowerBetter = true, label = '') {
    if (!prev && !cur) return `<span class="k-s">بدون تغییر</span>`;
    if (!prev) return `<span class="k-s">ماه قبل: ۰</span>`;
    const d = (cur - prev) / prev, up = d > 0, good = lowerBetter ? !up : up;
    if (Math.abs(d) < 0.005) return `<span class="k-s">مثل ${label}</span>`;
    return `<span class="k-s ${good ? 'up-good' : 'up-bad'}">${up ? '▲' : '▼'} ${pct(Math.abs(d))} نسبت به ${label}</span>`;
  }
  const kpi = (label, value, sub, tone = '', help = '') => `<div class="kpi ${tone}" ${help ? `title="${esc(help)}"` : ''}><span class="k-l">${label}</span><b class="k-v">${value}</b>${sub || ''}</div>`;

  function repView() {
    const t = today(), cur = ym(t), K = C.kpis(S, repMonth, t), pm = monthName(K.prev);
    const tone = (v, good, bad, higherBetter = true) => v === null ? '' : higherBetter ? (v >= good ? 'good' : v < bad ? 'bad' : 'warn') : (v <= good ? 'good' : v > bad ? 'bad' : 'warn');
    const V = K.variance, varDiff = V.actual - V.est;
    const cards = [
      kpi('پرداخت به‌موقع', pct(K.onTime.rate), `<span class="k-s">${K.onTime.n ? `${faDigits(K.onTime.ok)} از ${faDigits(K.onTime.n)} پرداخت، ۶ ماه اخیر` : 'هنوز پرداختی ثبت نشده'}</span>`, tone(K.onTime.rate, 0.95, 0.8),
        'درصد اقساط و قبض‌هایی که تا روز سررسید پرداخت شدن'),
      kpi('پیشرفت تعهدات ماه', pct(K.progress), `<span class="k-s">${faDigits(K.paidCount)} از ${faDigits(K.count)} مورد</span>`, K.progress === 1 ? 'good' : ''),
      kpi('بار اقساط ماهانه', shortMoney(K.loanLoad), delta(K.loanLoad, K.loanLoadPrev, true, pm), '', 'جمع اقساط وام‌ها و خریدهای قسطی این ماه'),
      kpi('کل خرج ماه', shortMoney(K.outflow), delta(K.outflow, K.outflowPrev, true, pm), '', 'همه‌ی برداشت‌ها: اقساط، قبض‌ها و خرج روزمره'),
      kpi('خرج روزمره‌ی روزانه', K.days ? shortMoney(K.dailyAvg) : '—', K.isCur && K.days ? `<span class="k-s">با این روند تا آخر ماه: ${shortMoney(K.dailyProjected)}</span>` : `<span class="k-s">میانگین ${faDigits(K.days)} روز</span>`),
      kpi('کل بدهی وام‌ها', shortMoney(K.debtNow), `<span class="k-s">${K.debtPaidThisMonth ? `${shortMoney(K.debtPaidThisMonth)} کم شد در ${monthName(repMonth)}` : 'در این ماه قسطی پرداخت نشده'}</span>`),
      kpi('آزادی از بدهی', K.debtFree ? monthTitle(K.debtFree) : 'بدهی نداری', `<span class="k-s">${K.debtFree ? `${faDigits(Math.max(0, K.monthsToFree))} ماه دیگه، اگه طبق برنامه پیش بری` : ''}</span>`, K.debtFree ? '' : 'good'),
      kpi('آزاد شدن تا ۳ ماه آینده', K.relief.amount ? shortMoney(K.relief.amount) + ' <small>در ماه</small>' : '—', `<span class="k-s">${K.relief.loans.length ? esc(K.relief.loans.slice(0, 3).join('، ')) + (K.relief.loans.length > 3 ? '…' : '') + ' تموم می‌شن' : 'قسطی در این بازه تموم نمی‌شه'}</span>`, K.relief.amount ? 'good' : ''),
      kpi('قبض‌های متغیر نسبت به پیش‌بینی', V.est ? pct(V.actual / V.est) : '—', `<span class="k-s ${V.est ? (varDiff > 0 ? 'up-bad' : 'up-good') : ''}">${V.est ? `${shortMoney(Math.abs(varDiff))} ${varDiff > 0 ? 'بیشتر' : 'کمتر'} از پیش‌بینی` : 'هنوز قبض متغیری پرداخت نشده'}</span>`, '', 'مبلغ واقعی قبض‌های متغیر نسبت به مبلغ پیش‌بینی'),
      kpi('سهم اقساط از خرج', pct(K.loanShare), `<span class="k-s">از کل ${shortMoney(K.outflow)}</span>`)
    ];
    if (K.hasIncome) cards.push(
      kpi('نسبت بدهی به درآمد', pct(K.dti), `<span class="k-s">${K.dti <= 0.36 ? 'سالم (زیر ۳۶٪)' : K.dti <= 0.43 ? 'مرزی (۳۶ تا ۴۳٪)' : 'پرخطر (بالای ۴۳٪)'}</span>`, tone(K.dti, 0.36, 0.43, false), 'اقساط ماه تقسیم بر درآمد'),
      kpi('نرخ پس‌انداز', pct(K.savingsRate), `<span class="k-s">درآمد منهای کل خرج</span>`, tone(K.savingsRate, 0.2, 0)));
    else cards.push(`<div class="kpi muted span2"><span class="k-l">با ثبت درآمد</span><span class="k-s">«نسبت بدهی به درآمد» و «نرخ پس‌انداز» هم محاسبه می‌شن.</span></div>`);

    // ۱) تعهدات ۱۲ ماه آینده
    const fc = C.obligationForecast(S, cur, 12);
    const fcChart = barChart({ labels: fc.map(f => monthName(f.ym).slice(0, 3)), labelEvery: 2,
      series: [{ cls: 'c1', values: fc.map(f => f.loans) }, { cls: 'c2', values: fc.map(f => f.fixed) }, { cls: 'c3', values: fc.map(f => f.variable) }],
      tips: fc.map(f => `${monthTitle(f.ym)}: جمع ${money(f.total)} (اقساط ${shortMoney(f.loans)}، ثابت ${shortMoney(f.fixed)}، متغیر ${shortMoney(f.variable)})`) });
    const drop = fc.length > 1 ? fc[0].total - Math.min(...fc.slice(1).map(f => f.total)) : 0;
    // ۲) روند بدهی
    const full = C.debtProjection(S, cur, 240), long = full.length > 25;
    const stepP = full.length > 37 ? Math.ceil((full.length - 1) / 36) : 1;
    const pr = full.filter((p, i) => i === 0 || i % stepP === 0 || i === full.length - 1);
    const yearsSpan = long ? +full[full.length - 1].ym.slice(0, 4) - +cur.slice(0, 4) : 0;
    const prLabels = pr.map((p, i) => {
      if (i === 0) return 'الان';
      if (!long) return i % 3 === 0 ? monthName(p.ym).slice(0, 3) : '';
      const y = +p.ym.slice(0, 4), py = +pr[i - 1].ym.slice(0, 4);
      return y !== py && (yearsSpan <= 8 || y % 2 === 0) ? faDigits(y) : '';
    });
    const prChart = pr.length > 1 ? lineChart({ labels: prLabels, area: true,
      series: [{ cls: 'c1', values: pr.map(p => p.total) }],
      tips: pr.map((p, i) => i === 0 ? `الان: ${money(p.total)} بدهی` : `پایان ${monthTitle(p.ym)}: ${money(p.total)}`) }) : '';
    // ۳) خرج ماه به ماه
    const months = []; for (let i = 0; i < 6; i++) months.push(C.addYm(repMonth, -i));
    const outs = months.map(m => C.monthOutflow(S, m)), incs = months.map(m => C.monthStats(S, m).income);
    const hasInc = incs.some(v => v > 0);
    const mmChart = barChart({ labels: months.map(m => monthName(m).slice(0, 3)),
      series: [{ cls: 'c1', values: outs.map(o => o.loans) }, { cls: 'c2', values: outs.map(o => o.bills) }, { cls: 'c4', values: outs.map(o => o.daily) }],
      line: hasInc ? { cls: 'c5', values: incs } : null,
      tips: months.map((m, i) => `${monthTitle(m)}: خرج ${money(outs[i].total)}${hasInc ? `، درآمد ${money(incs[i])}` : ''}`) });
    // ۴) خرج تجمعی: این ماه در برابر ماه قبل
    const cA = C.cumulativeByDay(S, repMonth), cB = C.cumulativeByDay(S, K.prev), L = Math.max(cA.length, cB.length);
    const lastDay = K.isCur ? K.days : cA.length;
    const cumChart = lineChart({ labels: Array.from({ length: L }, (_, i) => (i + 1) % 5 === 0 || i === 0 ? faDigits(i + 1) : ''),
      series: [{ cls: 'c6', dash: true, values: Array.from({ length: L }, (_, i) => i < cB.length ? cB[i] : null) },
               { cls: 'c1', values: Array.from({ length: L }, (_, i) => i < cA.length && i < lastDay ? cA[i] : null) }],
      tips: Array.from({ length: L }, (_, i) => `تا روز ${faDigits(i + 1)}: ${monthName(repMonth)} ${i < lastDay && i < cA.length ? shortMoney(cA[i]) : '—'}، ${pm} ${i < cB.length ? shortMoney(cB[i]) : '—'}`) });
    // ۵) ترکیب خرج بر اساس دسته + مقایسه با ماه قبل
    const catA = C.categoryTotals(S, repMonth), catB = C.categoryTotals(S, K.prev);
    const rows = Object.entries(catA).sort((a, b) => b[1] - a[1]);
    const top = rows.slice(0, 5), rest = rows.slice(5).reduce((s, r) => s + r[1], 0);
    const segs = top.map(([c, v], i) => ({ cls: 'c' + (i + 1), value: v, name: c })).concat(rest ? [{ cls: 'c6', value: rest, name: 'بقیه' }] : []);
    const sumA = rows.reduce((s, r) => s + r[1], 0);
    segs.forEach(sg => { sg.tip = `${sg.name}: ${money(sg.value)} (${pct(sg.value / sumA)})`; });
    const catTable = rows.map(([c, v]) => {
      const p = catB[c] || 0, d = p ? (v - p) / p : null;
      return `<li><span>${esc(c)}</span><b>${shortMoney(v)}</b><em class="${d === null ? '' : d > 0 ? 'up-bad' : 'up-good'}">${d === null ? 'جدید' : (d > 0 ? '▲ ' : '▼ ') + pct(Math.abs(d))}</em></li>`;
    }).join('');
    // ۶) پیش‌بینی در برابر واقعی
    const vItems = V.items;
    const vChart = vItems.length ? barChart({ labels: vItems.map(o => o.name.slice(0, 8)), stacked: false,
      series: [{ cls: 'c6', values: vItems.map(o => o.estimate) }, { cls: 'c1', values: vItems.map(o => o.paid ? o.amount : 0) }],
      tips: vItems.map(o => `${o.name}: پیش‌بینی ${money(o.estimate)}${o.paid ? `، واقعی ${money(o.amount)}` : '، هنوز پرداخت نشده'}`) }) : '';
    // ۷) سهم هر وام از بدهی
    const debts = S.loans.map(l => ({ l, r: C.loanSummary(l).remainingAmount })).filter(x => x.r > 0).sort((a, b) => b.r - a.r);
    const dMax = debts.length ? debts[0].r : 1, dSum = debts.reduce((s, x) => s + x.r, 0);

    return `
    <header class="top home-top sub"><div class="hdr-back">${backBtn()}<h1>گزارش مالی</h1></div><button class="iconbtn gear" data-act="goset" aria-label="تنظیمات">${IC.gear}</button></header>
    ${monthSwitch(repMonth, 'repm')}
    <section class="kpis" aria-label="شاخص‌ها">${cards.join('')}</section>
    ${figure('تعهدات ۱۲ ماه آینده', drop > 0 ? `تا ${monthName(fc.find(f => f.total === Math.min(...fc.slice(1).map(x => x.total))).ym)} ماهانه ${shortMoney(drop)} سبک‌تر می‌شی.` : 'پیش‌بینی اقساط و پرداخت‌های ماهانه از همین ماه.', fcChart, [['c1', 'اقساط'], ['c2', 'پرداخت ثابت'], ['c3', 'متغیر (پیش‌بینی)']])}
    ${prChart ? figure('روند کاهش بدهی وام‌ها', K.debtFree ? `با پرداخت طبق برنامه، ${monthTitle(K.debtFree)} بدهی صفر می‌شه.` : '', prChart, null) : ''}
    ${figure('خرج ماه به ماه', 'شش ماه منتهی به ' + monthTitle(repMonth), mmChart, [['c1', 'اقساط'], ['c2', 'قبض و ثابت'], ['c4', 'روزمره']].concat(hasInc ? [['c5', 'درآمد']] : []))}
    ${figure(`خرج تجمعی: ${monthName(repMonth)} در برابر ${pm}`, 'اینکه در هر روز ماه تا اون لحظه چقدر خرج شده.', cumChart, [['c1', monthName(repMonth)], ['c6', pm]])}
    <figure class="chart card-block"><h2>ترکیب خرج ${monthName(repMonth)}</h2>
      ${rows.length ? `<div class="donutwrap">${donut(segs, shortMoney(sumA), 'کل خرج')}<div class="legend col">${segs.map(sg => `<span><i class="k ${sg.cls}"></i>${esc(sg.name)} <b>${pct(sg.value / sumA)}</b></span>`).join('')}</div></div>
      <h3 class="subh">مقایسه‌ی هر دسته با ${pm}</h3><ul class="cmp">${catTable}</ul>
      <figcaption class="tip">روی حلقه بزن تا عددها رو ببینی</figcaption>` : `<p class="empty">خرجی برای این ماه ثبت نشده.</p>`}</figure>
    ${vChart ? figure(`پیش‌بینی در برابر واقعی، ${monthName(repMonth)}`, 'پرداخت‌های متغیر: مبلغ پیش‌بینی و مبلغی که واقعاً پرداخت شد.', vChart, [['c6', 'پیش‌بینی'], ['c1', 'واقعی']]) : ''}
    ${debts.length ? `<section class="card-block chart"><h2>سهم هر وام از بدهی</h2><ul class="catbars">${debts.map(x => `<li><div><span>${esc(x.l.name)}</span><b>${shortMoney(x.r)} <small>${pct(x.r / dSum)}</small></b></div><i style="width:${Math.max(2, x.r / dMax * 100)}%"></i></li>`).join('')}</ul></section>` : ''}
    <section class="block card-block"><h2>خروجی اکسل</h2>
      <p class="note">شاخص‌ها، تراکنش‌ها، خلاصه‌ی ماهانه، خرج هر دسته، وام‌ها، پرداخت‌های ماهانه و بدهی و طلب، هر کدوم در یک شیت.</p>
      <div class="formrow"><label>از</label>${ymField('xfrom', C.addYm(cur, -2))}</div>
      <div class="formrow"><label>تا</label>${ymField('xto', cur)}</div>
      <button class="btn wide" data-act="excel">ساخت فایل اکسل</button>
    </section>
    <section class="block card-block" id="calsec"><h2>یادآورها در تقویم آیفون</h2>
      <p class="note">همه‌ی اقساط، پرداخت‌های ماهانه و موعد بدهی‌های پرداخت‌نشده‌ی ۱۲ ماه آینده، با یک لمس به تقویم «مالی» اضافه می‌شن. یادآورهای قبلی هم خودکار پاک و جایگزین می‌شن.</p>
      <button class="btn wide" data-act="cal">${IC.cal}افزودن به تقویم</button>
      ${SHORTCUT_GUIDE}
      <button class="btn wide ghost small-top" data-act="ics">فایل تقویم (روش جایگزین)</button>
    </section>`;
  }

  const listEditor = (key, title, note) => `<section class="block card-block"><h2>${title}</h2><p class="note">${note}</p>
    <div class="chips wrap">${(S.lists[key] || []).map((n, i) => `<span class="chip tag">${esc(n)}<button data-act="dellist" data-key="${key}" data-i="${i}" aria-label="حذف ${esc(n)}">${IC.x}</button></span>`).join('')}</div>
    <div class="addcat"><input id="newlist-${key}" placeholder="مورد جدید" aria-label="${title}: مورد جدید"><button class="btn small" data-act="addlist" data-key="${key}">افزودن</button></div></section>`;
  function setView() {
    const chipsFor = type => S.categories[type].map((c, i) => `<span class="chip tag">${esc(c)}<button data-act="delcat" data-type="${type}" data-i="${i}" aria-label="حذف ${esc(c)}">${IC.x}</button></span>`).join('');
    const days = S.settings.lastBackup ? Math.floor((Date.now() - S.settings.lastBackup) / 864e5) : null;
    return `
    <header class="top home-top sub"><div class="hdr-back">${backBtn()}<h1>تنظیمات</h1></div></header>
    <section class="block card-block"><h2>واحد نمایش مبالغ</h2>
      <div class="chips seg">${[['toman', 'تومان'], ['rial', 'ریال']].map(([k, n]) => `<button class="chip ${S.settings.unit === k ? 'on' : ''}" data-act="unit" data-u="${k}" aria-pressed="${S.settings.unit === k}">${n}</button>`).join('')}</div>
      <p class="note">داده‌ها همیشه به ریال ذخیره می‌شن؛ این فقط نمایش و ورود مبلغ رو عوض می‌کنه.</p>
    </section>
    <section class="block card-block"><h2>درآمد ماهانه‌ی پیش‌بینی (اختیاری)</h2>
      ${amountInput('expected', S.settings.expectedIncome)}
      <p class="note">پیش‌فرض صفره و اپ فقط اقساط و تعهدات رو حساب می‌کنه. اگه عددی بذاری، «پول آزاد این ماه» هم نشون داده می‌شه.</p>
      <button class="btn small" data-act="saveexp">ذخیره</button>
    </section>
    <section class="block card-block"><h2>دسته‌های خرج</h2><div class="chips wrap">${chipsFor('expense')}</div>
      <div class="addcat"><input id="newcat-expense" placeholder="دسته‌ی جدید" aria-label="دسته‌ی خرج جدید"><button class="btn small" data-act="addcat" data-type="expense">افزودن</button></div></section>
    <section class="block card-block"><h2>دسته‌های درآمد</h2><div class="chips wrap">${chipsFor('income')}</div>
      <div class="addcat"><input id="newcat-income" placeholder="دسته‌ی جدید" aria-label="دسته‌ی درآمد جدید"><button class="btn small" data-act="addcat" data-type="income">افزودن</button></div></section>
    <section class="block card-block"><h2>حساب‌های بانکی</h2>
      <p class="note">موجودی هر حساب جزو دارایی‌های ریالی و ارزش خالص حساب می‌شه. هر برداشت، واریز یا انتقالی که با این حساب ثبت کنی خودکار ازش کم یا بهش اضافه می‌شه. پیامکی که موجودی داره، یا عددی که اینجا وارد کنی، نقطه‌ی شروع تازه می‌شه.</p>
      <ul class="listed">${bankAccounts().map(a => `<li><input data-accname="${esc(a.id)}" value="${esc(a.name)}" aria-label="نام حساب">
        <div class="unitwrap sm"><input class="amt" data-accbal="${esc(a.id)}" inputmode="numeric" value="${curBal(a) !== null ? faNum(disp(curBal(a))) : ''}" placeholder="موجودی" aria-label="موجودی ${esc(a.name)}"><span>${unitLabel()}</span></div>
        <button class="iconbtn sm" data-act="delacc" data-id="${esc(a.id)}" aria-label="حذف ${esc(a.name)}">${IC.x}</button></li>`).join('')}</ul>
      <div class="addcat"><input id="newbank" placeholder="بانک جدید" aria-label="بانک جدید"><button class="btn small" data-act="addbank">افزودن</button></div>
      <button class="btn small" data-act="saveacc">ذخیره‌ی نام‌ها و موجودی‌ها</button></section>
    <section class="block card-block"><h2>اعتبار خرید (تسویه آخر ماه)</h2>
      <p class="note">خریدی که با این اعتبارها ثبت کنی خرج همون روزه؛ آخر ماه صورت‌حسابش در «پیش رو» میاد و تسویه‌ش به‌صورت انتقال ثبت می‌شه تا دوبار خرج حساب نشه.</p>
      <ul class="listed">${creditAccounts().map(a => `<li><input data-accname="${esc(a.id)}" value="${esc(a.name)}" aria-label="نام اعتبار">
        <div class="unitwrap sm"><input class="amt" data-acclim="${esc(a.id)}" inputmode="numeric" value="${a.limit ? faNum(disp(a.limit)) : ''}" placeholder="سقف" aria-label="سقف ${esc(a.name)}"><span>سقف</span></div>
        <button class="iconbtn sm" data-act="delacc" data-id="${esc(a.id)}" aria-label="حذف ${esc(a.name)}">${IC.x}</button></li>`).join('')}</ul>
      <div class="addcat"><input id="newcredit" placeholder="اعتبار جدید" aria-label="اعتبار جدید"><button class="btn small" data-act="addcredit">افزودن</button></div>
      <button class="btn small" data-act="saveacc">ذخیره</button></section>
    ${listEditor('bnpl', 'پلتفرم‌های خرید قسطی', 'توی فرم خرید قسطی به‌عنوان «پلتفرم» پیشنهاد می‌شن.')}
    ${listEditor('lenders', 'وام‌دهنده‌ها', 'توی فرم وام بانکی به‌عنوان «وام‌دهنده» پیشنهاد می‌شن.')}
    <section class="block card-block"><h2>خرید قسطی (اسنپ‌پی، دیجی‌پی…)</h2>
      <p class="note">قسط اول روز خرید پرداخت می‌شه و اقساط بعدی روز ثابتی از ماه‌های بعد. معمولاً روز ۱. این عدد برای خریدهای قسطی جدید پیش‌فرض می‌شه و توی فرم هر خرید قابل تغییره.</p>
      <div class="unitwrap"><input id="bnplday" inputmode="numeric" value="${faDigits(bnplDay())}" aria-label="روز سررسید اقساط بعدی"><span>روز ماه</span></div>
      <button class="btn small" data-act="savebnpl">ذخیره</button></section>
    ${window.Inv ? window.Inv.settingsHtml() : ''}
    <section class="block card-block"><h2>قفل</h2>
      <p class="note">${S.settings.lock ? 'قفل روشنه. اپ موقع باز شدن و بعد از یک دقیقه دور بودن، رمز می‌خواد.' : 'با یه رمز عددی، اپ موقع باز شدن قفل می‌شه تا کسی که گوشیت دستشه اطلاعات مالیت رو نبینه.'}</p>
      <div class="btnrow"><button class="btn small" data-act="setlock">${S.settings.lock ? 'تغییر رمز' : 'تنظیم رمز'}</button>${S.settings.lock ? `<button class="btn small danger" data-act="dellock">برداشتن قفل</button>` : ''}</div></section>
    <section class="block card-block"><h2>بکاپ</h2>
      <p class="note">${days === null ? 'هنوز بکاپی گرفته نشده.' : days === 0 ? 'آخرین بکاپ: امروز.' : `آخرین بکاپ: ${faDigits(days)} روز پیش.`} بکاپ رو با رمز بگیر تا اگه فایل دست کسی افتاد، قابل خوندن نباشه. بکاپ‌های FI هم اینجا قابل بازگردانی‌ان.</p>
      <div class="btnrow"><button class="btn" data-act="backup">گرفتن بکاپ</button><label class="btn ghost">بازگردانی از فایل<input type="file" accept=".json,application/json" id="restore" hidden></label></div>
    </section>
    <section class="block card-block help"><h2>راهنما</h2>${HELP}</section>
    <section class="block"><button class="btn danger wide" data-act="wipe">پاک کردن همه‌ی داده‌ها</button></section>
    <p class="ver"><b>VAULT</b> نسخه‌ی ${VERSION}، همه‌ی داده‌ها فقط روی همین گوشی</p>`;
  }

  const SHORTCUT_GUIDE = `<details class="fold guide" data-fold="scguide"><summary>${IC.down}راه‌اندازی یک‌باره (حدود ۵ دقیقه)</summary>
    <ol class="steps">
      <li>در اپ <bdi class="en">Calendar</bdi>، پایین صفحه <bdi class="en">Calendars</bdi> و بعد <bdi class="en">Add Calendar</bdi> رو بزن و یه تقویم به اسم <b>مالی</b> بساز.</li>
      <li>اپ <bdi class="en">Shortcuts</bdi> رو باز کن، <bdi class="en">+</bdi> رو بزن و اسم میان‌بُر رو دقیقاً <bdi class="en">Vault Calendar</bdi> بذار.</li>
      <li>این اکشن‌ها رو به ترتیب اضافه کن (با جست‌وجوی اسمشون):
        <ol>
          <li><bdi class="en">Get Clipboard</bdi></li>
          <li><bdi class="en">Get Dictionary from Input</bdi></li>
          <li><bdi class="en">Get Dictionary Value</bdi>
            <ul><li>کلید (<bdi class="en">Key</bdi>) رو بنویس <bdi class="en">events</bdi></li></ul></li>
          <li><bdi class="en">Find Calendar Events</bdi>
            <ul><li>فیلتر اول: <bdi class="en">Calendar is</bdi> مالی</li><li>فیلتر دوم: <bdi class="en">Start Date is in the next 2 years</bdi></li></ul></li>
          <li><bdi class="en">Remove Events</bdi>
            <ul><li>گزینه‌ی <bdi class="en">Confirm Before Deleting</bdi> رو خاموش کن</li></ul></li>
          <li><bdi class="en">Repeat with Each</bdi>، ورودیش رو خروجی مرحله‌ی ۳ (<bdi class="en">Dictionary Value</bdi>) بذار. داخل حلقه:
            <ul>
              <li><bdi class="en">Get Dictionary Value</bdi> از <bdi class="en">Repeat Item</bdi>، کلید <bdi class="en">title</bdi></li>
              <li><bdi class="en">Get Dictionary Value</bdi> از <bdi class="en">Repeat Item</bdi>، کلید <bdi class="en">start</bdi></li>
              <li><bdi class="en">Get Dictionary Value</bdi> از <bdi class="en">Repeat Item</bdi>، کلید <bdi class="en">end</bdi></li>
              <li><bdi class="en">Add New Event</bdi> با این تنظیمات:
                <ul><li>عنوان: مقدار <bdi class="en">title</bdi></li><li>تقویم (<bdi class="en">Calendar</bdi>): مالی</li>
                <li>شروع (<bdi class="en">Start Date</bdi>): مقدار <bdi class="en">start</bdi></li><li>پایان (<bdi class="en">End Date</bdi>): مقدار <bdi class="en">end</bdi></li>
                <li>هشدار (<bdi class="en">Alert</bdi>) رو بذار روی <bdi class="en">1 day before</bdi></li></ul></li>
            </ul></li>
          <li>بعد از <bdi class="en">End Repeat</bdi>، اکشن <bdi class="en">Show Notification</bdi> با متن «یادآورها به‌روز شد»</li>
        </ol></li>
      <li>بار اول که اجرا بشه، آیفون برای دسترسی به کلیپ‌بورد و تقویم اجازه می‌خواد؛ <bdi class="en">Always Allow</bdi> رو بزن.</li>
    </ol>
    <p class="note">از این به بعد هر وقت قسطی پرداخت کردی یا وام جدیدی اضافه کردی، «افزودن به تقویم» رو دوباره بزن تا تقویم به‌روز بشه.</p>
  </details>`;

  const HELP = `
  <details class="fold"><summary>${IC.down}ثبت از روی پیامک بانک</summary>
    <p>متن پیامک بانک رو کپی کن، در اپ «چسباندن پیامک» رو بزن. مبلغ، نوع (برداشت یا واریز)، تاریخ و مانده خودکار پر می‌شن و فقط دسته رو انتخاب می‌کنی.</p></details>
  <details class="fold"><summary>${IC.down}ویجت دکمه‌های سریع</summary>
    <p>در Shortcuts میان‌بُرهایی بساز که فقط اکشن Open URLs دارن، با آدرس اپ و یکی از این انتهاها: <code>#out</code> برای ثبت برداشت، <code>#in</code> برای ثبت واریز، <code>#paste</code> برای چسباندن پیامک و <code>#pay</code> برای پرداخت قسط. <code>#new</code> با یک دکمه می‌پرسه برداشت یا واریز. اگه لینک‌ها به‌جای اپ داخل Safari باز شدن، از خود آیکون اپ استفاده کن.</p></details>
  <details class="fold"><summary>${IC.down}پرداخت‌های متغیر</summary>
    <p>برای قبض‌ها و صورت‌حساب‌هایی که مبلغشون هر ماه فرق می‌کنه، مبلغ پیش‌بینی گذاشته می‌شه. موقع پرداخت، مبلغ واقعی رو وارد کن؛ از اون به بعد همه‌ی جمع‌ها با مبلغ واقعی حساب می‌شن.</p></details>
  <details class="fold"><summary>${IC.down}یادآور اقساط در تقویم</summary>
    <p>در تب گزارش، پایین صفحه، «افزودن به تقویم» رو بزن. بار اول باید میان‌بُر <code>Vault Calendar</code> رو در Shortcuts بسازی؛ راهنمای قدم‌به‌قدمش همون‌جا زیر دکمه هست.</p></details>`;

  // ---------- آیکون و رنگ دسته‌ها ----------
  const CI = {
    cart: '<path d="M4 5h2l2.2 10h9.3l2-7H7.1"/><circle cx="10" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
    cup: '<path d="M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 4v2M11.5 4v2"/>',
    car: '<path d="M5 16V11l2-4h10l2 4v5M5 16h14M7.5 16v2M16.5 16v2M4 11h16"/><circle cx="8" cy="13.5" r=".8"/><circle cx="16" cy="13.5" r=".8"/>',
    bolt: '<path d="M13 3 6 13h5l-1 8 7-10h-5z"/>', bag: '<path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    ticket: '<path d="M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 0 0-4V4H4zM14 4v16"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M4 13h16M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z"/>',
    home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>', dots: '<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>',
    work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>', pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', bank: '<path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 17h2"/>', spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3"/>',
    shirt: '<path d="M8 4 4 7l2 3 2-1v11h8V9l2 1 2-3-4-3a4 4 0 0 1-8 0z"/>', coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>'
  };
  Object.assign(CI, {
    building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M11 21v-3h2v3"/>',
    fuel: '<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M5 10h9M14 8l3 3v6a1.5 1.5 0 0 0 3 0V9l-2-2"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7"/>', plane: '<path d="M10 14 3 11l1-2 8 1 5-6 2 1-3 7 5 3-1 2-6-2-3 5-2-1z"/>',
    scissors: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5 20 18M8 15.5 20 6"/>', repeat: '<path d="M4 12a7 7 0 0 1 12-5l2 2M20 12a7 7 0 0 1-12 5l-2-2M18 4v5h-5M6 20v-5h5"/>',
    headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H4zM17 14h3v5h-3z"/>', pill: '<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="M9 8l6 9"/>'
  });
  const CAT_MAP = [
    [/شارژ\s*ساختمان|ساختمان/, 'building', 90], [/بنزین|سوخت/, 'fuel', 15], [/میوه|سبزی/, 'leaf', 120], [/سفر/, 'plane', 195],
    [/آرایشگاه/, 'scissors', 310], [/اشتراک/, 'repeat', 265], [/لوازم\s*جانبی/, 'headset', 240], [/دارو|درمان/, 'pill', 350],
    [/^قسط$/, 'bank', 225], [/خرید\s*منزل/, 'home', 100], [/کفش/, 'shirt', 260], [/خودرو/, 'car', 210], [/^غذا$/, 'cup', 25],
    [/سوپر|خوراک|خواربار|میوه|نان/, 'cart', 150], [/رستوران|کافه|غذا|فست/, 'cup', 25], [/حمل|تاکسی|اسنپ|تپسی|کرایه|بنزین|سوخت|ماشین/, 'car', 210],
    [/قبض|قبوض|شارژ|برق|آب|گاز/, 'bolt', 45], [/خرید|کیف|لوازم/, 'bag', 280], [/سلامت|دارو|پزشک|دکتر|بیمه/, 'heart', 350],
    [/تفریح|سینما|سفر|بازی/, 'ticket', 320], [/هدیه|کادو/, 'gift', 330], [/خانه|اجاره|منزل/, 'home', 100], [/حقوق|دستمزد/, 'work', 140],
    [/پروژه|فریلنس/, 'pen', 190], [/وام|قسط|بانک/, 'bank', 225], [/تلفن|نت|اینترنت|ایرانسل|همراه/, 'phone', 200],
    [/آرایش|زیبایی|آرایشگاه/, 'spark', 300], [/لباس|پوشاک/, 'shirt', 260], [/طلا|سکه|سرمایه/, 'coin', 42], [/درآمد/, 'plus', 140], [/^سایر/, 'dots', 220]
  ];
  function catMeta(name) {
    const n = name || '';
    for (const [re, i, h] of CAT_MAP) if (re.test(n)) return { i, h };
    let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return { i: null, h, letter: n.trim().charAt(0) || '؟' };
  }
  const catIcon = (name, fallback) => {
    const m = name ? catMeta(name) : { i: fallback || 'dots', h: 220 };
    return `<span class="cat-ic" style="--h:${m.h}" aria-hidden="true">${m.i ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${CI[m.i]}</svg>` : esc(m.letter)}</span>`;
  };
  // پرکاربردها اول: تعداد استفاده در ۹۰ روز اخیر
  function catOrder(type, list) {
    const since = C.addDays(today(), -90), n = {};
    S.tx.forEach(t => { if (t.type === type && t.date >= since && t.cat) n[t.cat] = (n[t.cat] || 0) + 1; });
    return list.map((c, i) => [c, i]).sort((a, b) => (n[b[0]] || 0) - (n[a[0]] || 0) || a[1] - b[1]).map(x => x[0]);
  }

  // ---------- فرم تراکنش ----------
  const withSel = (list, sel) => sel && !list.includes(sel) ? [sel, ...list] : list;
  const catChips = (type, selected) => catOrder(type, withSel(S.categories[type] || [], selected)).map(c => `<button type="button" class="chip cattile ${c === selected ? 'on' : ''}" data-cat="${esc(c)}" aria-pressed="${c === selected}">${catIcon(c)}<span>${esc(c)}</span></button>`).join('');
  function linkOptions(current) {
    const obs = C.openObligations(S, ym(today()), -3, 1);
    let opts = `<option value="">— نه، خرج روزمره است —</option>`;
    if (current) opts += `<option value="${esc(current.kind + '|' + current.id + '|' + current.key)}" selected>${esc(obLabel(current))} (فعلی)</option>`;
    opts += obs.map(o => `<option value="${esc(o.kind + '|' + o.id + '|' + o.key)}">${esc(o.name)}، ${o.sub}، ${money(o.amount)}</option>`).join('');
    return opts;
  }
  function incLinkOptions(current) {
    const cur = ym(today()); let items = [];
    for (const m of [C.addYm(cur, -1), cur, C.addYm(cur, 1)]) items = items.concat(C.incomesForMonth(S, m).filter(i => !i.paid));
    let opts = `<option value="">— نه، واریز جداست —</option>`;
    if (current) opts += `<option value="${esc(current.kind + '|' + current.id + '|' + current.key)}" selected>${esc(obLabel(current))} (فعلی)</option>`;
    return opts + items.map(o => `<option value="${esc(o.kind + '|' + o.id + '|' + o.key)}">${esc(o.name)}، ${monthTitle(o.key)}، ${money(o.amount)}</option>`).join('');
  }
  const typeTitle = (t, type) => t ? 'ویرایش تراکنش' : type === 'income' ? 'ثبت واریز' : type === 'transfer' ? 'ثبت انتقال' : 'ثبت برداشت';

  function openTxForm(opts = {}) {
    const t = opts.id ? S.tx.find(x => x.id === opts.id) : null;
    if (opts.id && !t) return;
    const p = opts.prefill || {};
    const data = t ? { ...t } : { type: opts.type || p.type || 'expense', amount: p.amount || 0, date: p.date || today(), time: p.time || '', note: p.note || '', account: p.accountId || '', cat: '' };
    // انتقال: account = از حساب، to = به حساب. انتقال قدیمی بدون to = برداشت از account (دریافت طلب = واریز به account)
    if (t && t.type === 'transfer' && !('to' in t)) {
      const d = t.debt && S.debts.find(x => x.id === t.debt);
      if (d && d.dir === 'owed') { data.to = t.account; data.account = ''; } else data.to = '';
    }
    data.to = data.to || '';
    let type = data.type, cat = t ? (t.cat || '') : (S.lastCat[type] || '');
    const dupe = p.sms && S.tx.find(x => x.amount === p.amount && x.date === p.date && (x.time || '') === (p.time || '') && x.account === p.accountId);
    const catType = () => type === 'transfer' ? 'expense' : type;
    const html = `
      ${p.sms ? `<p class="smsinfo">از پیامک ${esc(p.bank)}${p.balance != null ? `، مانده ${money(p.balance)}` : ''}</p>` : ''}
      ${dupe ? `<p class="alert">یه تراکنش با همین مبلغ و زمان قبلاً ثبت شده. احتمالاً این پیامک تکراریه.</p>` : ''}
      <div class="chips seg" id="ttype" role="group" aria-label="نوع">${[['expense', 'برداشت (خرج)'], ['income', 'واریز (درآمد)'], ['transfer', 'انتقال داخلی']].map(([k, n]) => `<button type="button" class="chip ${type === k ? 'on' : ''}" data-t="${k}" aria-pressed="${type === k}">${n}</button>`).join('')}</div>
      <p class="note tnote" ${type === 'transfer' ? '' : 'hidden'}>جابه‌جایی پول بین حساب‌های خودت؛ در درآمد و خرج حساب نمی‌شه.</p>
      <label class="lbl">مبلغ</label>${amountInput('amount', data.amount)}
      <label class="lbl">تاریخ</label>${dateField('date', data.date, true)}
      <div id="catwrap" ${type === 'transfer' ? 'hidden' : ''}><label class="lbl">دسته</label><div class="catgrid" id="cats">${catChips(catType(), cat)}</div></div>
      <div id="linkwrap" ${type === 'expense' ? '' : 'hidden'}><label class="lbl" for="link">مربوط به قسط یا قبض؟</label><select id="link">${linkOptions(t && t.link && t.link.kind !== 'income' ? t.link : null)}</select></div>
      <div id="inclinkwrap" ${type === 'income' && S.incomes.length ? '' : 'hidden'}><label class="lbl" for="inclink">مربوط به درآمد ثابت؟</label><select id="inclink">${incLinkOptions(t && t.link && t.link.kind === 'income' ? t.link : null)}</select></div>
      <label class="lbl" for="acc" id="acclbl">${type === 'transfer' ? 'از حساب' : 'حساب یا اعتبار'}</label><select id="acc">${accOptions(data.account, type === 'expense')}</select>
      <div id="towrap" ${type === 'transfer' ? '' : 'hidden'}><label class="lbl" for="acc2">به حساب</label><select id="acc2">${accOptions(data.to, false)}</select>
        <p class="note">برای خرید طلا یا ارز، یا پرداخت به کسی، «بدون حساب» رو بذار: فقط از مبدأ کم می‌شه.</p></div>
      <label class="lbl" for="note">توضیح</label><input id="note" value="${esc(data.note)}" placeholder="${type === 'income' ? 'مثلاً حقوق مهر' : 'مثلاً خرید هفتگی'}">
      <div class="btnrow"><button class="btn wide" id="savetx">${t ? 'ذخیره‌ی تغییرات' : 'ثبت'}</button>${t ? `<button class="btn danger" id="deltx">حذف</button>` : ''}</div>`;
    openSheet(typeTitle(t, type), html, ov => {
      $('#ttype', ov).addEventListener('click', e => {
        const b = e.target.closest('[data-t]'); if (!b) return;
        const prev = type; type = b.dataset.t; cat = S.lastCat[type] || '';
        const a1 = $('#acc', ov), a2 = $('#acc2', ov);
        if (type === 'transfer' && prev === 'income' && !a2.value) { a2.value = a1.value; a1.value = ''; }      // واریز → انتقال: حساب مقصد می‌شه
        if (prev === 'transfer' && type === 'income' && !a1.value && a2.value) a1.value = a2.value;
        $('#towrap', ov).hidden = type !== 'transfer'; $('#acclbl', ov).textContent = type === 'transfer' ? 'از حساب' : 'حساب یا اعتبار';
        $$('#ttype .chip', ov).forEach(c => { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', c === b); });
        $('#cats', ov).innerHTML = catChips(catType(), cat);
        $('#catwrap', ov).hidden = type === 'transfer'; $('#linkwrap', ov).hidden = type !== 'expense'; $('#inclinkwrap', ov).hidden = !(type === 'income' && S.incomes.length);
        $('.tnote', ov).hidden = type !== 'transfer';
        $('#note', ov).placeholder = type === 'income' ? 'مثلاً حقوق مهر' : type === 'transfer' ? 'مثلاً از خاورمیانه به بلو' : 'مثلاً خرید هفتگی';
        $('.sheet-head h2', ov).textContent = typeTitle(t, type);
        const accSel = $('#acc', ov), keep = accSel.value; accSel.innerHTML = accOptions(keep, type === 'expense'); if ([...accSel.options].some(o => o.value === keep)) accSel.value = keep;
      });
      $('#cats', ov).addEventListener('click', e => {
        const b = e.target.closest('[data-cat]'); if (!b) return;
        cat = b.dataset.cat; $$('#cats .chip', ov).forEach(c => { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', c === b); });
      });
      if (!t && !p.amount) setTimeout(() => { const i = $('[name=amount]', ov); if (i) i.focus(); }, 300);
      once($('#savetx', ov), () => {
        const amount = readAmount(ov, 'amount');
        if (!amount) { toast('مبلغ رو وارد کن.', 'bad'); return false; }
        const cacc = type === 'expense' && S.accounts.find(a => a.id === $('#acc', ov).value && a.kind === 'credit');
        if (cacc && cacc.limit) {
          const used = creditUsed(cacc) - (t && t.account === cacc.id && t.type === 'expense' ? t.amount : 0);
          if (used + amount > cacc.limit && !confirm(`با این خرید از سقف ${cacc.name} (${money(cacc.limit)}) بیشتر می‌شه. باز هم ثبت بشه؟`)) return false;
        }
        const from = $('#acc', ov).value, to = type === 'transfer' ? $('#acc2', ov).value : '';
        if (type === 'transfer' && to && to === from) { toast('حساب مبدأ و مقصد یکی‌ان.', 'bad'); return false; }
        const rec = t || { id: uid(), created: Date.now() };
        const oldLink = t && t.link ? { ...t.link } : null;
        Object.assign(rec, { type, amount, date: readDate(ov, 'date'), time: data.time || '', cat: type === 'transfer' ? '' : cat,
          account: from, note: $('#note', ov).value.trim() });
        if (type === 'transfer') rec.to = to; else delete rec.to;
        const lv = type === 'expense' ? $('#link', ov).value : type === 'income' ? $('#inclink', ov).value : '';
        const newLink = lv ? (([kind, id, key]) => ({ kind, id, key }))(lv.split('|')) : null;
        const same = oldLink && newLink && oldLink.kind === newLink.kind && oldLink.id === newLink.id && oldLink.key === newLink.key;
        if (oldLink && !same) {
          const o = findOb(oldLink.kind, oldLink.id);
          if (o && o.paid && o.paid[oldLink.key] && o.paid[oldLink.key].txId === rec.id) delete o.paid[oldLink.key];
          delete rec.link; delete rec.auto;
        }
        if (newLink && !same) {
          const o = findOb(newLink.kind, newLink.id);
          const prev = o && o.paid && o.paid[newLink.key];
          if (prev && prev.txId && prev.txId !== rec.id) { const pt = S.tx.find(x => x.id === prev.txId); if (pt) { if (pt.auto) S.tx = S.tx.filter(x => x !== pt); else delete pt.link; } }
          rec.link = newLink; markPaid(newLink.kind, newLink.id, newLink.key, { date: rec.date, txId: rec.id });
        }
        if (!t) S.tx.push(rec);
        if (cat && type !== 'transfer') S.lastCat[type] = cat;
        // موجودی پیامک = نقطه‌ی شروع تازه‌ی همون حساب (حتی اگه تراکنش «انتقال» ثبت بشه)
        const smsAcc = p.sms && p.balance != null && (p.accountId || rec.account);
        if (smsAcc) {
          const a = S.accounts.find(x => x.id === smsAcc); const stamp = rec.date + ' ' + (rec.time || '00:00');
          if (a && (!a.stamp || stamp >= a.stamp)) setAnchor(a, p.balance, stamp);
        }
        save(); closeSheet(ov); render();
        toast(t ? 'تغییرات ذخیره شد.' : 'ثبت شد.');
      });
      if (t) $('#deltx', ov).addEventListener('click', () => {
        if (!confirm('این تراکنش حذف بشه؟')) return;
        deleteTx(t); save(); closeSheet(ov); render(); toast('حذف شد.');
      });
    });
  }
  function deleteTx(t) {
    if (t.link) { const o = findOb(t.link.kind, t.link.id); if (o && o.paid && o.paid[t.link.key] && o.paid[t.link.key].txId === t.id) delete o.paid[t.link.key]; }
    if (t.debt) { const d = S.debts.find(x => x.id === t.debt); if (d) { d.settles = (d.settles || []).filter(x => x.txId !== t.id); if (debtLeft(d) > 0) delete d.closed; } }
    S.tx = S.tx.filter(x => x !== t);
  }

  function openChooser() {
    openSheet('ثبت تراکنش', `<nav class="quick big">
      <button data-pick="expense"><span class="qi out">${IC.out}</span>برداشت</button>
      <button data-pick="income"><span class="qi in">${IC.in}</span>واریز</button>
      <button data-pick="paste" class="span2"><span class="qi">${IC.paste}</span>چسباندن پیامک (خودش تشخیص می‌ده)</button></nav>`, ov => {
      $('.quick', ov).addEventListener('click', e => {
        const b = e.target.closest('[data-pick]'); if (!b) return;
        closeSheet(ov);
        if (b.dataset.pick === 'paste') openPaste(); else openTxForm({ type: b.dataset.pick });
      });
    });
  }

  function openPaste() {
    const html = `
      <p class="note">متن پیامک بانک یا پیام قیمت‌ها (طلا، دلار، تتر، بیت‌کوین…) رو کپی کن و «چسباندن» رو بزن. اپ خودش تشخیص می‌ده کدومه.</p>
      <button class="btn wide" id="clip">${IC.paste}چسباندن از کلیپ‌بورد</button>
      <textarea id="smstext" rows="7" placeholder="یا متن پیامک رو اینجا بچسبون" aria-label="متن پیامک"></textarea>
      <button class="btn wide ghost" id="parse">بررسی متن</button>`;
    openSheet('چسباندن پیامک یا قیمت', html, ov => {
      const go2 = () => {
        const txt = $('#smstext', ov).value;
        if (window.Inv && window.Inv.looksLikePrices(txt)) { closeSheet(ov); setTimeout(() => window.Inv.openPrices(txt), 200); return; }
        const r = C.parseSMS(txt);
        if (!r) { toast('متنی وارد نشده.', 'bad'); return; }
        if (r.error) toast(r.error + ' مبلغ رو دستی وارد کن.', 'bad');
        const acc = accountFor(r.bank, r.account); save();
        closeSheet(ov);
        openTxForm({ prefill: { ...r, accountId: acc.id, sms: true } });
      };
      $('#clip', ov).addEventListener('click', async () => {
        try {
          const txt = await navigator.clipboard.readText();
          $('#smstext', ov).value = txt;
          if (txt.trim()) go2(); else toast('کلیپ‌بورد خالیه.', 'bad');
        } catch (e) { toast('دسترسی به کلیپ‌بورد داده نشد. متن رو دستی بچسبون.', 'bad'); $('#smstext', ov).focus(); }
      });
      $('#parse', ov).addEventListener('click', go2);
    });
  }

  // ---------- پرداخت ----------
  function openDueList() {
    const body = () => {
      const cur = ym(today()), list = C.openObligations(S, cur, -3, 1);
      if (!list.length) return `<p class="empty">مورد پرداخت‌نشده‌ای نمونده.</p>`;
      const groups = [['عقب‌افتاده', list.filter(o => ym(o.due) < cur)], [monthName(cur) + ' (این ماه)', list.filter(o => ym(o.due) === cur)],
        [monthName(C.addYm(cur, 1)) + ' (ماه بعد)', list.filter(o => ym(o.due) > cur)]];
      return groups.filter(g => g[1].length).map(([t, l]) => `<h3 class="grp">${t}</h3><ul class="oblist">${l.map(obRow).join('')}</ul>`).join('');
    };
    openSheet('پرداخت قسط یا قبض', body(), ov => { ov._refresh = () => { $('.sheet-body', ov).innerHTML = body(); }; });
  }
  // پرداخت یک‌لمسی برای مبلغ ثابت؛ مورد متغیر مبلغ واقعی رو می‌پرسه
  function quickPay(kind, id, key) {
    const o = getOb(kind, id, key); if (!o || o.paid) return;
    if (o.variable) { openPay(kind, id, key); return; }
    const t = { id: uid(), created: Date.now(), type: txTypeFor(kind), amount: o.estimate, date: today(), time: '', cat: kind === 'credit' ? '' : obDefaultCat(kind, id),
      account: kind === 'credit' ? '' : (findOb(kind, id) || {}).account || '', note: kind === 'credit' ? `تسویه‌ی ${o.name.replace('صورت‌حساب ', '')}، ${monthTitle(key)}` : `${o.name}، ${o.sub}`, link: { kind, id, key: String(key) }, auto: true };
    S.tx.push(t); markPaid(kind, id, key, { date: t.date, txId: t.id });
    save(); refreshSheets(); render();
    toast(`${o.name}: ${money(o.estimate)} ${isInc(kind) ? 'دریافت شد' : 'پرداخت شد'}.`, '', { label: 'برگرداندن', fn: () => { unmarkPaid(kind, id, key); save(); refreshSheets(); render(); } });
  }
  // ورقه‌های باز (لیست سررسیدها، جزئیات وام) بعد از هر تغییر همون لحظه تازه می‌شن
  function refreshSheets() { $$('.overlay:not(.closing)').forEach(ov => { if (ov._refresh) ov._refresh(); }); }
  function askUnpay(kind, id, key) {
    const o = getOb(kind, id, key); if (!o) return;
    if (!confirm(isInc(kind) ? `دریافت «${o.name}» برگرده به «در انتظار»؟ تراکنش واریزش هم حذف می‌شه.` : `پرداخت «${o.name}» برگرده به پرداخت‌نشده؟ تراکنش برداشتش هم حذف می‌شه.`)) return;
    unmarkPaid(kind, id, key); save(); refreshSheets(); render(); toast('برگردانده شد.');
  }
  function openPay(kind, id, key) {
    const o = getOb(kind, id, key); if (!o) return;
    if (o.paid) { askUnpay(kind, id, key); return; }
    const inc = isInc(kind), ttype = txTypeFor(kind);
    const recent = S.tx.filter(t => t.type === ttype && !t.link && Math.abs(C.diffDays(t.date, today())) <= 45)
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);
    const html = `
      <p class="payhead"><strong>${esc(o.name)}</strong><span>${o.sub}، ${inc ? 'تاریخ مورد انتظار' : 'سررسید'} ${dateFull(o.due)}</span></p>
      ${o.variable ? `<p class="smsinfo">مبلغ پیش‌بینی: ${money(o.estimate)}. مبلغ واقعی رو وارد کن.</p>` : ''}
      <label class="check"><input type="checkbox" id="already"> قبلاً به‌عنوان ${inc ? 'واریز' : 'برداشت'} ثبتش کردم</label>
      <div id="newpay">
        <label class="lbl">${o.variable ? 'مبلغ واقعی' : inc ? 'مبلغ دریافتی' : 'مبلغ پرداختی'}</label>${amountInput('amount', o.estimate)}
        <label class="lbl">${inc ? 'تاریخ دریافت' : 'تاریخ پرداخت'}</label>${dateField('date', today(), true)}
        <label class="lbl" for="acc">${inc ? 'به حساب' : 'از حساب'}</label><select id="acc">${accOptions((findOb(kind, id) || {}).account || '')}</select>
      </div>
      <div id="pickpay" hidden>
        <label class="lbl" for="pick">کدوم تراکنش؟</label>
        <select id="pick"><option value="">فقط علامت بزن، به تراکنشی وصل نکن</option>${recent.map(t => `<option value="${esc(t.id)}">${dateTitle(t.date)}، ${money(t.amount)}${t.note ? '، ' + esc(t.note) : ''}</option>`).join('')}</select>
      </div>
      <button class="btn wide" id="dopay">${IC.check}${inc ? 'ثبت دریافت' : 'ثبت پرداخت'}</button>`;
    openSheet(inc ? 'ثبت دریافت درآمد' : 'ثبت پرداخت', html, ov => {
      if (o.variable) setTimeout(() => { const i = $('[name=amount]', ov); if (i) { i.focus(); i.select(); } }, 300);
      $('#already', ov).addEventListener('change', e => { $('#newpay', ov).hidden = e.target.checked; $('#pickpay', ov).hidden = !e.target.checked; });
      once($('#dopay', ov), () => {
        if ($('#already', ov).checked) {
          const tt = S.tx.find(x => x.id === $('#pick', ov).value);
          if (tt) { tt.link = { kind, id, key: String(key) }; markPaid(kind, id, key, { date: tt.date, txId: tt.id }); }
          else markPaid(kind, id, key, { date: today() });
        } else {
          const amount = readAmount(ov, 'amount'); if (!amount) { toast('مبلغ رو وارد کن.', 'bad'); return false; }
          const tt = { id: uid(), created: Date.now(), type: ttype, amount, date: readDate(ov, 'date'), time: '', cat: kind === 'credit' ? '' : obDefaultCat(kind, id),
            account: $('#acc', ov).value, note: `${o.name}، ${o.sub.replace('، پیش‌بینی', '')}`, link: { kind, id, key: String(key) }, auto: true };
          S.tx.push(tt); markPaid(kind, id, key, { date: tt.date, txId: tt.id });
        }
        save(); closeSheet(ov); refreshSheets(); render(); toast(inc ? 'دریافت ثبت شد.' : 'پرداخت ثبت شد.');
      });
    });
  }

  // ---------- وام ----------
  // نوع اقساط: وام بانکی (هر ماه همون روز) یا خرید قسطی (قسط اول روز خرید، بقیه روز ثابتی از ماه‌های بعد)
  const BNPL_RE = /(اسنپ\s*‌?\s*پی|دیجی\s*‌?\s*پی|تارا|ازکی|لندو|قسطی|bnpl|snapp\s*pay|digi\s*pay)/i;
  const bnplDay = () => S.settings.bnplDay || 1;
  // یک فهرست با دو گروه؛ گروه نوعِ فعلی اول. انتخاب از گروه دیگه، نوع رو عوض می‌کنه.
  const lenderOptions = (list, sel) => {
    const grp = (k, label) => { const items = (S.lists[k] || []).slice(); if (k === list && sel && !items.includes(sel) && !(S.lists.bnpl || []).concat(S.lists.lenders || []).includes(sel)) items.unshift(sel);
      return items.length ? `<optgroup label="${label}">${items.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>` : ''; };
    const order = list === 'bnpl' ? [['bnpl', 'پلتفرم خرید قسطی'], ['lenders', 'وام‌دهنده']] : [['lenders', 'وام‌دهنده'], ['bnpl', 'پلتفرم خرید قسطی']];
    return `<option value="">— انتخاب کن —</option>` + order.map(([k, l]) => grp(k, l)).join('') + `<option value="__newlender">+ مورد جدید…</option>`;
  };
  function openLoanForm(id) {
    const l = id ? S.loans.find(x => x.id === id) : null;
    let type = l ? (l.restDay ? 'bnpl' : 'bank') : 'bank', typeTouched = !!l;
    const html = `
      <div class="chips seg" id="ltype" role="group" aria-label="نوع اقساط">${[['bank', 'وام بانکی'], ['bnpl', 'خرید قسطی (اسنپ‌پی، دیجی‌پی…)']].map(([k, n]) => `<button type="button" class="chip ${type === k ? 'on' : ''}" data-t="${k}" aria-pressed="${type === k}">${n}</button>`).join('')}</div>
      <label class="lbl" for="llender" id="llenderlbl">وام‌دهنده</label><select id="llender" data-list="${type === 'bnpl' ? 'bnpl' : 'lenders'}">${lenderOptions(type === 'bnpl' ? 'bnpl' : 'lenders', l ? l.lender : '')}</select>
      <div id="storewrap"><label class="lbl" for="lstore">فروشگاه</label><input id="lstore" value="${esc(l && l.store ? l.store : '')}" placeholder="مثلاً دیجی‌کالا یا فروشگاه موبایل"></div>
      <label class="lbl" for="lname">نام <span class="was">(اختیاری برای خرید قسطی)</span></label><input id="lname" value="${esc(l ? l.name : '')}" placeholder="مثلاً وام مسکن یا گوشی جدید">
      <label class="lbl">مبلغ هر قسط</label>${amountInput('lamount', l ? l.amount : 0)}
      <label class="lbl" for="lcount">تعداد کل اقساط</label><input id="lcount" inputmode="numeric" value="${l ? faDigits(l.count) : ''}" placeholder="مثلاً ۴">
      <label class="lbl" id="lfirstlbl">تاریخ</label>${dateField('lfirst', l ? l.first : today())}
      <div id="restwrap"><label class="lbl" for="lrest">اقساط بعدی روز چندم ماه‌ان؟</label><input id="lrest" inputmode="numeric" value="${faDigits(l && l.restDay ? l.restDay : bnplDay())}"></div>
      <p class="summary" id="lprev" aria-live="polite"></p>
      <label class="lbl" for="lcat">دسته‌ی خرج</label><select id="lcat">${withSel(['وام', ...S.categories.expense.filter(c => c !== 'وام')], l && l.cat).map(c => `<option ${c === ((l && l.cat) || 'وام') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      ${!l ? `<label class="lbl" for="lpaid">چند قسط تا حالا پرداخت شده؟</label><input id="lpaid" inputmode="numeric" placeholder="۰">
        <label class="check" id="firsttxwrap"><input type="checkbox" id="firsttx"> برداشت قسط اول (روز خرید) رو هم در تراکنش‌ها ثبت کن</label>` : ''}
      <div class="btnrow"><button class="btn wide" id="lsave">${l ? 'ذخیره‌ی تغییرات' : 'افزودن'}</button>${l ? `<button class="btn danger" id="ldel">حذف</button>` : ''}</div>`;
    openSheet(l ? `ویرایش ${l.name}` : 'وام یا خرید قسطی جدید', html, ov => {
      const draft = () => ({ first: readDate(ov, 'lfirst'), count: Math.min(600, readInt($('#lcount', ov)) || 0), restDay: type === 'bnpl' ? Math.min(31, Math.max(1, readInt($('#lrest', ov)) || 1)) : undefined });
      const sync = () => {
        $$('#ltype .chip', ov).forEach(c => { c.classList.toggle('on', c.dataset.t === type); c.setAttribute('aria-pressed', c.dataset.t === type); });
        $('#lfirstlbl', ov).textContent = type === 'bnpl' ? 'تاریخ خرید (قسط اول همون روزه)' : 'تاریخ سررسید اولین قسط';
        $('#restwrap', ov).hidden = type !== 'bnpl'; $('#storewrap', ov).hidden = type !== 'bnpl';
        const ls = $('#llender', ov), want = type === 'bnpl' ? 'bnpl' : 'lenders';
        if (ls.dataset.list !== want) { const keep = ls.value; ls.dataset.list = want; ls.innerHTML = lenderOptions(want, keep === '__newlender' ? '' : keep); }
        $('#llenderlbl', ov).textContent = type === 'bnpl' ? 'پلتفرم خرید قسطی' : 'وام‌دهنده';
        if (!l) {
          $('#firsttxwrap', ov).hidden = type !== 'bnpl';
          if (type === 'bnpl' && !$('#lpaid', ov).dataset.touched) $('#lpaid', ov).value = '۱';
          if (type === 'bank' && !$('#lpaid', ov).dataset.touched) $('#lpaid', ov).value = '';
          const recent = C.diffDays(readDate(ov, 'lfirst'), today()) <= 7;
          if (!$('#firsttx', ov).dataset.touched) $('#firsttx', ov).checked = type === 'bnpl' && recent;
        }
        const d = draft(), box = $('#lprev', ov);
        if (!d.count) { box.textContent = type === 'bnpl' ? 'قسط اول روز خرید؛ اقساط بعدی روز ' + faDigits(d.restDay || bnplDay()) + ' ماه‌های بعد.' : 'اقساط بعدی هر ماه همین روز؛ اگه ماهی این روز رو نداشت، آخرین روز همون ماه.'; return; }
        const r = { ...d }, dates = [];
        for (let i = 0; i < d.count; i++) dates.push(C.loanDue(r, i));
        const show = dates.length <= 5 ? dates : dates.slice(0, 3).concat(['…', dates[dates.length - 1]]);
        box.innerHTML = `<b>تاریخ اقساط:</b> ${show.map(x => x === '…' ? '…' : dateTitle(x)).join('، ')}`;
      };
      $('#ltype', ov).addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; type = b.dataset.t; typeTouched = true; sync(); });
      $('#lname', ov).addEventListener('input', e => { if (!typeTouched && BNPL_RE.test(e.target.value) && type !== 'bnpl') { type = 'bnpl'; sync(); } });
      $('#llender', ov).addEventListener('change', e => {
        const v = e.target.value;
        if ((S.lists.bnpl || []).includes(v) && type !== 'bnpl') { type = 'bnpl'; typeTouched = true; sync(); }
        else if ((S.lists.lenders || []).includes(v) && !(S.lists.bnpl || []).includes(v) && type !== 'bank') { type = 'bank'; typeTouched = true; sync(); }
      });
      if (!l) { $('#lpaid', ov).addEventListener('input', e => { e.target.dataset.touched = '1'; }); $('#firsttx', ov).addEventListener('change', e => { e.target.dataset.touched = '1'; }); }
      ov.addEventListener('input', sync); ov.addEventListener('change', e => { if (e.target.closest('[data-date="lfirst"]') || e.target.id === 'lrest') sync(); });
      $$('[data-setdate]', ov).forEach(b => b.addEventListener('click', () => setTimeout(sync, 0)));
      sync();
      once($('#lsave', ov), () => {
        const lender = $('#llender', ov).value === '__newlender' ? '' : $('#llender', ov).value.trim(), store = type === 'bnpl' ? $('#lstore', ov).value.trim().slice(0, 40) : '';
        const name = ($('#lname', ov).value.trim() || (type === 'bnpl' ? [lender, store].filter(Boolean).join('، ') : '')).slice(0, 60);
        const amount = readAmount(ov, 'lamount'), count = readInt($('#lcount', ov));
        if (!name || !amount || !count || count > 600) { toast(type === 'bnpl' ? 'پلتفرم یا نام، مبلغ قسط و تعداد اقساط (۱ تا ۶۰۰) لازمه.' : 'نام، مبلغ قسط و تعداد اقساط (۱ تا ۶۰۰) لازمه.', 'bad'); return false; }
        const d = draft();
        const rec = l || { id: uid(), paid: {} };
        Object.assign(rec, { name, lender, amount, count, first: d.first, cat: $('#lcat', ov).value });
        if (store) rec.store = store; else delete rec.store;
        if (d.restDay) rec.restDay = d.restDay; else delete rec.restDay;
        if (!l) {
          const pc = Math.min(count, readInt($('#lpaid', ov)));
          for (let i = 0; i < pc; i++) rec.paid[i] = { date: C.loanDue(rec, i), prior: true };
          if (type === 'bnpl' && pc >= 1 && $('#firsttx', ov).checked) { // قسط اول روز خرید: برداشتش هم ثبت بشه
            const t = { id: uid(), created: Date.now(), type: 'expense', amount, date: rec.first, time: '', cat: rec.cat,
              account: '', note: `${name}، قسط ۱ از ${faDigits(count)}`, link: { kind: 'loan', id: rec.id, key: '0' }, auto: true };
            S.tx.push(t); rec.paid[0] = { date: rec.first, txId: t.id };
          }
          S.loans.push(rec);
        } else Object.keys(rec.paid).forEach(k => { if (+k >= count) unmarkPaid('loan', rec.id, k); });
        save(); closeAll(); obTab = 'loan'; if (tab !== 'ob') go('ob'); else render(); toast(l ? 'ذخیره شد.' : `${type === 'bnpl' ? 'خرید قسطی' : 'وام'} اضافه شد.`);
      });
      if (l) $('#ldel', ov).addEventListener('click', () => {
        if (!confirm(`«${l.name}» و سابقه‌ی اقساطش حذف بشه؟ تراکنش‌هایی که ثبت شدن می‌مونن.`)) return;
        unlinkAllFor(l.id); S.loans = S.loans.filter(x => x !== l); save(); closeAll(); render(); toast('حذف شد.');
      });
    });
  }
  function loanDetailHtml(l) {
    const s = C.loanSummary(l), t = today();
    let rows = '';
    for (let i = 0; i < l.count; i++) {
      const due = C.loanDue(l, i), paid = l.paid && l.paid[i];
      rows += `<li class="${paid ? 'paid' : due < t ? 'late' : ''}"><button data-inst="${i}">
        <span class="n">${faDigits(i + 1)}</span><span>${dateFull(due)}</span>
        <em>${paid ? (paid.prior ? 'پرداخت‌شده (قبلی)' : 'پرداخت شد') : due < t ? 'عقب‌افتاده' : ''}</em></button></li>`;
    }
    return `
      <div class="sums"><div class="sum"><span>مانده‌ی بدهی</span><b>${money(s.remainingAmount)}</b></div><div class="sum"><span>اقساط باقی‌مانده</span><b>${faDigits(s.remainingCount)} از ${faDigits(l.count)}</b></div></div>
      ${l.total ? `<p class="note">مبلغ کل: ${money(l.total)}</p>` : ''}
      <p class="note">روی هر قسط بزن تا پرداختش رو ثبت کنی یا برگردونیش.</p>
      <ul class="inst">${rows}</ul>
      <button class="btn wide ghost" data-ledit>ویرایش</button>`;
  }
  function openLoanDetail(id) {
    const l0 = S.loans.find(x => x.id === id); if (!l0) return;
    openSheet(l0.name, loanDetailHtml(l0), ov => {
      const body = $('.sheet-body', ov);
      ov._refresh = () => { const l = S.loans.find(x => x.id === id); if (!l) { closeSheet(ov); return; } const top = ov.querySelector('.sheet').scrollTop; body.innerHTML = loanDetailHtml(l); ov.querySelector('.sheet').scrollTop = top; };
      const nextLi = $('.inst li:not(.paid)', ov); if (nextLi) setTimeout(() => nextLi.scrollIntoView({ block: 'center' }), 60);
      body.addEventListener('click', e => {
        const l = S.loans.find(x => x.id === id); if (!l) return;
        if (e.target.closest('[data-ledit]')) { openLoanForm(l.id); return; }
        const b = e.target.closest('[data-inst]'); if (!b) return;
        const i = b.dataset.inst;
        if (l.paid && l.paid[i]) {
          if (!confirm('این قسط به «پرداخت‌نشده» برگرده؟')) return;
          unmarkPaid('loan', l.id, i); save(); refreshSheets(); render();
        } else openPay('loan', l.id, i);
      });
    });
  }

  // ---------- پرداخت ماهانه ----------
  function openFixedForm(id) {
    const f = id ? S.fixed.find(x => x.id === id) : null;
    const cur = ym(today()), activeNow = f && (!f.start || cur >= f.start) && (!f.end || cur <= f.end);
    const paid = f && f.paid && f.paid[cur];
    const html = `
      ${activeNow ? `<button class="btn wide ${paid ? 'ghost' : ''}" id="fpay">${paid ? 'برگرداندن پرداخت این ماه' : `${IC.check}ثبت پرداخت ${monthName(cur)}`}</button>` : ''}
      <label class="lbl" for="fname">عنوان</label><input id="fname" value="${esc(f ? f.name : '')}" placeholder="مثلاً ایرانسل یا اجاره">
      <label class="check"><input type="checkbox" id="fvar" ${f && f.variable ? 'checked' : ''}> مبلغش هر ماه فرق می‌کنه (متغیر / پیش‌بینی)</label>
      <label class="lbl" id="famtlbl">${f && f.variable ? 'مبلغ پیش‌بینی ماهانه' : 'مبلغ ماهانه'}</label>${amountInput('famount', f ? f.amount : 0)}
      <label class="lbl" for="fday">روز سررسید در ماه</label><input id="fday" inputmode="numeric" value="${f ? faDigits(f.day) : ''}" placeholder="۱ تا ۳۱">
      <label class="lbl" for="fcat">دسته‌ی خرج</label><select id="fcat">${withSel(['پرداخت ماهانه', ...S.categories.expense.filter(c => c !== 'پرداخت ماهانه')], f && f.cat).map(c => `<option ${c === ((f && f.cat) || 'پرداخت ماهانه') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label class="lbl">از ماه</label>${ymField('fstart', f ? f.start : cur)}
      <label class="lbl">تا ماه</label>${ymField('fend', f ? f.end : null, true)}
      <p class="note">اگه پایان مشخصی نداره، «تا ماه» رو خالی بذار.</p>
      <div class="btnrow"><button class="btn wide" id="fsave">${f ? 'ذخیره‌ی تغییرات' : 'افزودن'}</button>${f ? `<button class="btn danger" id="fdel">حذف</button>` : ''}</div>`;
    openSheet(f ? f.name : 'پرداخت ماهانه‌ی جدید', html, ov => {
      $('#fvar', ov).addEventListener('change', e => { $('#famtlbl', ov).textContent = e.target.checked ? 'مبلغ پیش‌بینی ماهانه' : 'مبلغ ماهانه'; });
      if (activeNow) $('#fpay', ov).addEventListener('click', () => {
        closeSheet(ov);
        if (paid) askUnpay('fixed', f.id, cur); else setTimeout(() => openPay('fixed', f.id, cur), 200);
      });
      once($('#fsave', ov), () => {
        const name = $('#fname', ov).value.trim(), amount = readAmount(ov, 'famount'), day = readInt($('#fday', ov));
        const start = readYm(ov, 'fstart'), end = readYm(ov, 'fend');
        if (!name || !amount || !(day >= 1 && day <= 31)) { toast('عنوان، مبلغ و روز سررسید (۱ تا ۳۱) لازمه.', 'bad'); return false; }
        if (end && end < start) { toast('«تا ماه» نمی‌تونه قبل از «از ماه» باشه.', 'bad'); return false; }
        const rec = f || { id: uid(), paid: {} };
        Object.assign(rec, { name, amount, day, start, end, variable: $('#fvar', ov).checked, cat: $('#fcat', ov).value });
        if (!f) S.fixed.push(rec);
        save(); closeSheet(ov); obTab = 'fixed'; render(); toast(f ? 'ذخیره شد.' : 'اضافه شد.');
      });
      if (f) $('#fdel', ov).addEventListener('click', () => {
        if (!confirm(`«${f.name}» حذف بشه؟ تراکنش‌هایی که ثبت شدن می‌مونن.`)) return;
        unlinkAllFor(f.id); S.fixed = S.fixed.filter(x => x !== f); save(); closeSheet(ov); render(); toast('حذف شد.');
      });
    });
  }

  // ---------- بدهی و طلب ----------
  function openDebtForm(id, dir) {
    const d = id ? S.debts.find(x => x.id === id) : null;
    dir = d ? d.dir : dir || 'owe';
    let asset = d ? dAsset(d) : 'irr';
    const people = [...new Set(S.debts.map(x => x.person))];
    const html = `
      <div class="chips seg" id="ddir" role="group">${[['owe', 'بدهکارم به'], ['owed', 'طلبکارم از']].map(([k, n]) => `<button type="button" class="chip ${dir === k ? 'on' : ''}" data-d="${k}" aria-pressed="${dir === k}">${n}</button>`).join('')}</div>
      <label class="lbl" for="dperson">شخص</label><input id="dperson" list="dpeople" value="${esc(d ? d.person : '')}" placeholder="نام">
      <datalist id="dpeople">${people.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      <label class="lbl">به چه واحدی؟</label>
      <div class="chips seg wrap" id="dasset" role="group" aria-label="واحد بدهی یا طلب">${(window.Inv ? window.Inv.DEBT_ASSETS : ['irr']).map(a => `<button type="button" class="chip ${asset === a ? 'on' : ''}" data-a="${a}" aria-pressed="${asset === a}">${esc(window.Inv ? window.Inv.debtAssetName(a) : 'تومان')}</button>`).join('')}</div>
      <div id="dirr" ${asset === 'irr' ? '' : 'hidden'}><label class="lbl">مبلغ</label>${amountInput('damount', d && asset === 'irr' ? d.amount : 0)}</div>
      <div id="dqw" ${asset === 'irr' ? 'hidden' : ''}><label class="lbl" for="dqty" id="dqlbl">مقدار (${esc(asset === 'irr' ? '' : window.Inv.faUnit(asset))})</label>
        <input id="dqty" inputmode="decimal" autocomplete="off" dir="ltr" value="${d && asset !== 'irr' ? esc(window.Inv.plainQty(d.amount, asset)) : ''}" placeholder="مثلاً ۵٫۲۵"></div>
      <label class="lbl">تاریخ</label>${dateField('ddate', d ? d.date : today(), true)}
      <label class="check"><input type="checkbox" id="hasdue" ${d && d.due ? 'checked' : ''}> موعد تسویه داره</label>
      <div id="duewrap" ${d && d.due ? '' : 'hidden'}><label class="lbl">موعد تسویه</label>${dateField('ddue', d && d.due ? d.due : C.addMonths(today(), 1))}</div>
      <label class="lbl" for="dnote">توضیح</label><input id="dnote" value="${esc(d ? d.note : '')}" placeholder="اختیاری">
      <div class="btnrow"><button class="btn wide" id="dsave">${d ? 'ذخیره‌ی تغییرات' : 'ثبت'}</button>${d ? `<button class="btn danger" id="ddel">حذف</button>` : ''}</div>`;
    openSheet(d ? 'ویرایش' : 'بدهی یا طلب جدید', html, ov => {
      $('#ddir', ov).addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; dir = b.dataset.d; $$('#ddir .chip', ov).forEach(c => { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', c === b); }); });
      $('#hasdue', ov).addEventListener('change', e => { $('#duewrap', ov).hidden = !e.target.checked; });
      $('#dasset', ov).addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; asset = b.dataset.a;
        $$('#dasset .chip', ov).forEach(c => { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', c === b); });
        $('#dirr', ov).hidden = asset !== 'irr'; $('#dqw', ov).hidden = asset === 'irr';
        if (asset !== 'irr') $('#dqlbl', ov).textContent = `مقدار (${window.Inv.faUnit(asset)})`; });
      if (!d) setTimeout(() => { const i = $('#dperson', ov); if (i) i.focus(); }, 300);
      once($('#dsave', ov), () => {
        const person = $('#dperson', ov).value.trim();
        const amount = asset === 'irr' ? readAmount(ov, 'damount') : V.parseQty($('#dqty', ov).value, asset);
        if (!person || !amount) { toast(asset === 'irr' ? 'نام شخص و مبلغ لازمه.' : 'نام شخص و مقدار لازمه.', 'bad'); return false; }
        if (d && d.settles.length && asset !== dAsset(d)) { toast('این مورد تسویه‌ی ثبت‌شده داره؛ واحدش رو نمی‌شه عوض کرد.', 'bad'); return false; }
        const rec = d || { id: uid(), settles: [] };
        Object.assign(rec, { dir, person, amount, asset, date: readDate(ov, 'ddate'), due: $('#hasdue', ov).checked ? readDate(ov, 'ddue') : null, note: $('#dnote', ov).value.trim() });
        if (debtLeft(rec) > 0) delete rec.closed; else if (!rec.closed) rec.closed = today();
        if (!d) S.debts.push(rec);
        save(); closeAll(); obTab = 'debt'; render(); toast(d ? 'ذخیره شد.' : 'ثبت شد.');
      });
      if (d) $('#ddel', ov).addEventListener('click', () => {
        if (!confirm(`«${debtTitle(d)}» حذف بشه؟`)) return;
        S.tx.forEach(t => { if (t.debt === d.id) delete t.debt; });
        S.ops.forEach(o => { if (o.debt === d.id) delete o.debt; });
        S.debts = S.debts.filter(x => x !== d); save(); closeAll(); render(); toast('حذف شد.');
      });
    });
  }
  function openDebtDetail(id) {
    const d = S.debts.find(x => x.id === id); if (!d) return;
    const left = debtLeft(d), verb = d.dir === 'owe' ? 'پرداخت' : 'دریافت';
    const isIrr = dAsset(d) === 'irr';
    const hist = (d.settles || []).map((x, i) => `<li><span>${dateFull(x.date)}${x.opId ? ' <small class="dval">در دارایی</small>' : ''}</span><b>${isIrr ? money(x.amount) : esc(debtQty(d, x.amount))}</b><button class="iconbtn sm" data-undo="${i}" aria-label="حذف این ${verb}">${IC.x}</button></li>`).join('');
    const html = `
      <div class="sums"><div class="sum"><span>${isIrr ? 'کل مبلغ' : 'کل مقدار'}</span><b>${debtShow(d, d.amount)}</b></div><div class="sum"><span>باقی‌مانده</span><b class="${left > 0 ? (d.dir === 'owe' ? 'neg' : 'pos') : ''}">${debtShow(d, Math.max(left, 0))}</b></div></div>
      <p class="note">از ${dateFull(d.date)}${d.due ? `، موعد ${dateFull(d.due)}` : ''}${d.note ? `، ${esc(d.note)}` : ''}</p>
      ${left > 0 && !isIrr ? `${window.Inv.debtSettleHtml(d, left)}
        <label class="lbl">تاریخ</label>${dateField('sdate', today(), true)}
        <button class="btn wide" id="settle">ثبت ${verb}</button>` : ''}
      ${left > 0 && isIrr ? `
        <label class="lbl">مبلغ ${verb}</label>${amountInput('samount', left)}
        <p class="note">برای تسویه‌ی بخشی از مبلغ، عدد رو کمتر کن.</p>
        <label class="lbl">تاریخ</label>${dateField('sdate', today(), true)}
        <label class="lbl" for="sacc">${d.dir === 'owe' ? 'از حساب' : 'به حساب'}</label><select id="sacc">${accOptions('')}</select>
        <label class="check"><input type="checkbox" id="stx" checked> در تراکنش‌ها هم ثبت بشه (به‌عنوان انتقال)</label>
        <button class="btn wide" id="settle">ثبت ${verb}</button>` : ''}
      ${hist ? `<h3 class="subh">سابقه‌ی ${verb}‌ها</h3><ul class="settles">${hist}</ul>` : ''}
      <button class="btn wide ghost" id="dedit">ویرایش</button>`;
    openSheet(debtTitle(d), html, ov => {
      if (left > 0 && !isIrr) {
        window.Inv.debtSettleBind(ov);
        once($('#settle', ov), () => {
          const date = readDate(ov, 'sdate'), r = window.Inv.debtSettleBuild(ov, d, left, date);
          if (r.err) { toast(r.err, 'bad'); return false; }
          const rec = { amount: r.q, date };
          if (r.op) { S.ops.push(r.op); rec.opId = r.op.id; }
          d.settles.push(rec);
          if (debtLeft(d) <= 0) d.closed = date;
          save(); closeAll(); render(); toast(debtLeft(d) <= 0 ? 'تسویه شد.' : `${verb} ثبت شد.`);
        });
      }
      if (left > 0 && isIrr) once($('#settle', ov), () => {
        const amount = Math.min(readAmount(ov, 'samount'), left); if (!amount) { toast('مبلغ رو وارد کن.', 'bad'); return false; }
        const date = readDate(ov, 'sdate'), rec = { amount, date };
        if ($('#stx', ov).checked) {
          const acc = $('#sacc', ov).value;
          const t = { id: uid(), created: Date.now(), type: 'transfer', amount, date, time: '', cat: '', account: d.dir === 'owe' ? acc : '', to: d.dir === 'owe' ? '' : acc,
            note: `${d.dir === 'owe' ? 'پرداخت بدهی به' : 'دریافت طلب از'} ${d.person}`, debt: d.id };
          S.tx.push(t); rec.txId = t.id;
        }
        d.settles.push(rec);
        if (debtLeft(d) <= 0) d.closed = date;
        save(); closeAll(); render(); toast(debtLeft(d) <= 0 ? 'تسویه شد.' : `${verb} ثبت شد.`);
      });
      $$('[data-undo]', ov).forEach(b => b.addEventListener('click', () => {
        if (!confirm(`این ${verb} حذف بشه؟`)) return;
        const [x] = d.settles.splice(+b.dataset.undo, 1);
        if (x && x.txId) S.tx = S.tx.filter(t => t.id !== x.txId);
        if (x && x.opId) S.ops = S.ops.filter(o => o.id !== x.opId);
        if (debtLeft(d) > 0) delete d.closed;
        save(); closeSheet(ov); render(); setTimeout(() => openDebtDetail(d.id), 280);
      }));
      $('#dedit', ov).addEventListener('click', () => openDebtForm(d.id));
    });
  }

  // ---------- خروجی‌ها ----------
  async function shareFile(blob, name, type) {
    const file = new File([blob], name, { type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return true;
  }
  const typeFa = { expense: 'برداشت (خرج)', income: 'واریز (درآمد)', transfer: 'انتقال داخلی' };

  let xlsxLoading = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    return xlsxLoading || (xlsxLoading = new Promise((res, rej) => {
      const sc = document.createElement('script'); sc.src = 'xlsx.full.min.js';
      sc.onload = () => res(); sc.onerror = () => { xlsxLoading = null; rej(new Error('load')); }; document.head.appendChild(sc);
    }));
  }
  function exportExcel() {
    if (!window.XLSX) { toast('در حال آماده کردن اکسل…'); loadXLSX().then(exportExcel, () => toast('کتابخانه‌ی اکسل بارگذاری نشد. یک بار با اینترنت اپ رو باز کن.', 'bad')); return; }
    const root = $('#view'), hasRange = $('[data-ym="xfrom"]', root);
    let from = hasRange ? readYm(root, 'xfrom') : C.addYm(ym(today()), -5), to = hasRange ? readYm(root, 'xto') : ym(today());
    if (from > to) [from, to] = [to, from];
    const months = []; for (let m = from; m <= to && months.length < 240; m = C.addYm(m, 1)) months.push(m);
    const inRange = t => ym(t.date) >= from && ym(t.date) <= to;
    const txs = S.tx.filter(inRange).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const X = window.XLSX, wb = X.utils.book_new();
    const add = (rows, name, widths) => { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, name); };
    const r4 = x => x === null || !isFinite(x) ? '' : Math.round(x * 10000) / 10000;
    add([['ماه', 'کل خرج (ریال)', 'اقساط', 'قبض و ثابت', 'روزمره', 'درآمد', 'بار اقساط', 'پیشرفت تعهدات', 'پرداخت به‌موقع (۶ ماه)', 'سهم اقساط از خرج', 'نسبت بدهی به درآمد', 'نرخ پس‌انداز', 'متغیرها: واقعی به پیش‌بینی']]
      .concat(months.map(m => { const k = C.kpis(S, m, today());
        return [monthTitle(m), k.outflow, k.outParts.loans, k.outParts.bills, k.outParts.daily, k.income, k.loanLoad, r4(k.progress), r4(k.onTime.rate), r4(k.loanShare), r4(k.dti), r4(k.savingsRate), r4(k.variance.est ? k.variance.actual / k.variance.est : null)]; })),
      'شاخص‌ها', [14, 16, 14, 14, 14, 14, 14, 14, 18, 16, 18, 12, 18]);
    add([['تاریخ', 'ساعت', 'نوع', 'دسته', 'مبلغ (ریال)', 'مبلغ (تومان)', 'حساب', 'توضیح', 'مربوط به']]
      .concat(txs.map(t => [t.date, t.time || '', typeFa[t.type], t.cat || '', t.amount, t.amount / 10, txAccLabel(t), t.note || '', t.link ? obLabel(t.link) : ''])),
      'تراکنش‌ها', [12, 7, 14, 16, 16, 14, 22, 32, 26]);
    add([['ماه', 'درآمد (ریال)', 'کل تعهدات', 'تعهدات پرداخت‌شده', 'تعهدات مانده', 'خرج روزمره', 'کل خرج']]
      .concat(months.map(m => { const s = C.monthStats(S, m); return [monthTitle(m), s.income, s.obTotal, s.obPaid, s.obRemaining, s.variable, s.obPaid + s.variable]; })),
      'خلاصه ماهانه', [16, 16, 16, 18, 16, 16, 16]);
    const catOf = t => t.link ? 'اقساط و تعهدات' : (t.cat || 'سایر');
    const exp = txs.filter(t => t.type === 'expense');
    const cats = [...new Set(exp.map(catOf))];
    add([['دسته'].concat(months.map(monthTitle), ['جمع'])].concat(cats.map(c => {
      const vals = months.map(m => exp.filter(t => ym(t.date) === m && catOf(t) === c).reduce((s, t) => s + t.amount, 0));
      return [c].concat(vals, [vals.reduce((a, b) => a + b, 0)]);
    })), 'خرج هر دسته', [18].concat(months.map(() => 14), [16]));
    add([['نام', 'نوع', 'بانک/سرویس', 'مبلغ قسط (ریال)', 'تعداد کل', 'پرداخت‌شده', 'باقی‌مانده', 'مانده‌ی بدهی (ریال)', 'اولین قسط', 'آخرین قسط', 'قسط بعدی']]
      .concat(S.loans.map(l => { const s = C.loanSummary(l); return [l.name, l.restDay ? `خرید قسطی (روز ${l.restDay})` : 'وام بانکی', l.lender || '', l.amount, l.count, s.paidCount, s.remainingCount, s.remainingAmount, l.first, s.last, s.next ? s.next.due : 'تسویه']; })),
      'وام‌ها', [22, 16, 16, 16, 9, 10, 10, 18, 12, 12, 12]);
    add([['عنوان', 'نوع', 'مبلغ ماهانه/پیش‌بینی (ریال)', 'روز سررسید', 'از ماه', 'تا ماه']].concat(S.fixed.map(f => [f.name, f.variable ? 'متغیر' : 'ثابت', f.amount, f.day, f.start || '', f.end || ''])),
      'پرداخت‌های ماهانه', [26, 8, 22, 11, 10, 10]);
    const xq = (d, q) => dAsset(d) === 'irr' ? q : Number(window.Inv.plainQty(q, dAsset(d)));
    add([['نوع', 'شخص', 'واحد', 'مقدار/مبلغ', 'تسویه‌شده', 'باقی‌مانده', 'ارزش امروز باقی‌مانده (ریال)', 'تاریخ', 'موعد', 'توضیح']]
      .concat(S.debts.map(d => { const left = Math.max(debtLeft(d), 0), v = debtVal(d, left);
        return [d.dir === 'owe' ? 'بدهکارم به' : 'طلبکارم از', d.person, dAsset(d) === 'irr' ? 'ریال' : window.Inv.debtAssetName(dAsset(d)),
          xq(d, d.amount), xq(d, d.amount - left), xq(d, left), v === null ? '' : v, d.date, d.due || '', d.note || '']; })),
      'بدهی و طلب', [12, 18, 12, 14, 14, 14, 20, 12, 12, 30]);
    if (S.incomes.length) add([['عنوان', 'نوع', 'مبلغ ماهانه (ریال)', 'روز مورد انتظار', 'دسته', 'از ماه', 'تا ماه']].concat(S.incomes.map(f => [f.name, f.variable ? 'متغیر' : 'ثابت', f.amount, f.day, f.cat || '', f.start || '', f.end || ''])),
      'درآمدهای ثابت', [22, 8, 18, 14, 14, 10, 10]);
    if (window.Inv) window.Inv.excelSheets(add);
    wb.Workbook = { Views: [{ RTL: true }] };
    const buf = X.write(wb, { bookType: 'xlsx', type: 'array' });
    const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    shareFile(new Blob([buf], { type: mime }), `vault-${from.replace('/', '-')}_${to.replace('/', '-')}.xlsx`, mime);
  }

  // سررسیدهای پرداخت‌نشده‌ی ۱۲ ماه آینده + موعد بدهی و طلب
  function upcomingItems() {
    const t = today(), cur = ym(t), map = C.txAmountMap(S);
    let obs = [];
    for (let i = 0; i <= 12; i++) obs = obs.concat(C.obligationsForMonth(S, C.addYm(cur, i), map));
    obs = obs.filter(o => !o.paid && o.due >= t);
    for (let i = 0; i <= 12; i++) obs = obs.concat(C.incomesForMonth(S, C.addYm(cur, i), map).filter(o => !o.paid && o.due >= t).map(o => ({ ...o, name: 'دریافت ' + o.name })));
    openDebts().filter(d => d.due && d.due >= t).forEach(d => obs.push({ kind: 'debt', id: d.id, key: 'd', due: d.due,
      name: debtTitle(d) + (dAsset(d) === 'irr' ? '' : ` (${debtQty(d, debtLeft(d))})`), sub: d.dir === 'owe' ? 'موعد پرداخت بدهی' : 'موعد دریافت طلب',
      amount: debtVal(d, debtLeft(d)) || 0, variable: dAsset(d) !== 'irr' }));
    return obs.sort((a, b) => a.due.localeCompare(b.due));
  }
  const SHORTCUT_NAME = 'Vault Calendar';
  const openURL = u => (window.__fiOpenURL || (x => { window.location.href = x; }))(u);
  // داده‌ی میان‌بُر Shortcuts: JSON ساده با تاریخ میلادی که Shortcuts مستقیم می‌فهمه
  function calendarPayload() {
    const g = js => { const x = C.toG(js); return `${x.gy}-${C.pad(x.gm)}-${C.pad(x.gd)}`; };
    return { app: 'Vault', events: upcomingItems().map(o => ({
      title: `${o.kind === 'loan' ? 'قسط ' : ''}${o.name}: ${o.kind === 'income' ? '+' : ''}${o.variable ? 'حدود ' : ''}${money(o.amount)}`,
      start: `${g(o.due)} 09:00`, end: `${g(o.due)} 09:30`,
      notes: `${o.sub}، سررسید ${dateFull(o.due)} (Vault)` })) };
  }
  async function sendToCalendar() {
    const data = calendarPayload();
    if (!data.events.length) { toast('سررسید یا موعد بازی در ۱۲ ماه آینده نیست.', 'bad'); return; }
    const text = JSON.stringify(data);
    try { await navigator.clipboard.writeText(text); }
    catch (e) { // اگه کپی خودکار نشد، متن رو نشون بده تا دستی کپی بشه
      openSheet('کپی دستی', `<p class="note">کپی خودکار انجام نشد. داخل کادر بزن، Select All و Copy رو بزن، بعد «اجرای میان‌بُر».</p>
        <textarea id="caltext" rows="6" readonly>${esc(text)}</textarea><button class="btn wide" id="runsc">اجرای میان‌بُر</button>`, ov => {
        $('#caltext', ov).addEventListener('focus', e => e.target.select());
        $('#runsc', ov).addEventListener('click', () => { closeSheet(ov); openURL('shortcuts://run-shortcut?name=' + encodeURIComponent(SHORTCUT_NAME)); });
      });
      return;
    }
    toast(`${faDigits(data.events.length)} سررسید کپی شد؛ Shortcuts باز می‌شه…`);
    setTimeout(() => openURL('shortcuts://run-shortcut?name=' + encodeURIComponent(SHORTCUT_NAME)), 350);
  }

  function exportICS() {
    const obs = upcomingItems();
    if (!obs.length) { toast('سررسید یا موعد بازی در ۱۲ ماه آینده نیست.', 'bad'); return; }
    const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const fold = line => { const out = []; let s = line; while (s.length > 36) { out.push(s.slice(0, 36)); s = ' ' + s.slice(36); } out.push(s); return out.join('\r\n'); };
    const gd = js => { const g = C.toG(js); return `${g.gy}${C.pad(g.gm)}${C.pad(g.gd)}`; };
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//vault//fa', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:مالی'];
    obs.forEach(o => {
      const amt = (o.variable ? 'حدود ' : '') + money(o.amount);
      lines.push('BEGIN:VEVENT', `UID:${o.kind}-${o.id}-${String(o.key).replace('/', '')}@hesab`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${gd(o.due)}`, `DTEND;VALUE=DATE:${gd(C.addDays(o.due, 1))}`,
        fold(`SUMMARY:${icsText(`${o.kind === 'loan' ? 'قسط ' : ''}${o.name} - ${amt}`)}`),
        fold(`DESCRIPTION:${icsText(`${o.sub} - سررسید ${dateFull(o.due)}`)}`),
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsText('سه روز دیگه: ' + o.name)}`), 'TRIGGER:-P2DT15H', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsText('امروز سررسید ' + o.name)}`), 'TRIGGER:PT9H', 'END:VALARM',
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    shareFile(new Blob([lines.join('\r\n')], { type: 'text/calendar' }), 'vault-yadavar.ics', 'text/calendar');
  }

  // ---------- رمزنگاری، بکاپ و قفل ----------
  const enc = new TextEncoder();
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function sha(text) { return b64(await crypto.subtle.digest('SHA-256', enc.encode(text))); }
  async function deriveKey(pass, salt) {
    const km = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptJSON(obj, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(pass, salt), enc.encode(JSON.stringify(obj)));
    return { vault: 2, enc: 'AES-GCM/PBKDF2-SHA256', salt: b64(salt), iv: b64(iv), data: b64(data) };
  }
  async function decryptJSON(pkg, pass) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(pkg.iv) }, await deriveKey(pass, unb64(pkg.salt)), unb64(pkg.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  function backup() {
    openSheet('گرفتن بکاپ', `<p class="note">با رمز، فایل بکاپ رمزنگاری می‌شه (AES-256) و بدون رمز قابل خوندن نیست. رمز رو جای امن نگه دار؛ بدون اون بکاپ قابل بازگردانی نیست.</p>
      <label class="lbl" for="b1">رمز بکاپ</label><input id="b1" type="password" autocomplete="new-password">
      <label class="lbl" for="b2">تکرار رمز</label><input id="b2" type="password" autocomplete="new-password">
      <button class="btn wide" id="bgo">ساخت بکاپ رمزدار</button><button class="btn wide ghost" id="bplain">بکاپ بدون رمز</button>`, ov => {
      const finish = async (obj, suffix) => {
        const ok = await shareFile(new Blob([JSON.stringify(obj)], { type: 'application/json' }), `vault-backup-${today().replace(/\//g, '-')}${suffix}.json`, 'application/json');
        if (ok) { S.settings.lastBackup = Date.now(); save(); closeSheet(ov); render(); toast('بکاپ ساخته شد.'); }
      };
      once($('#bgo', ov), async () => {
        const a = $('#b1', ov).value, b = $('#b2', ov).value;
        if (a.length < 6) { toast('رمز بکاپ حداقل ۶ کاراکتر باشه.', 'bad'); return false; }
        if (a !== b) { toast('دو رمز یکی نیستن.', 'bad'); return false; }
        await finish(await encryptJSON(S, a), '-locked');
      });
      once($('#bplain', ov), async () => { if (!confirm('فایل بدون رمز برای هر کسی که بهش دسترسی داشته باشه قابل خوندنه. ادامه می‌دی؟')) return false; await finish(S, ''); });
    });
  }
  function restore(file) {
    const r = new FileReader();
    r.onload = async () => {
      try {
        let d = JSON.parse(r.result);
        if (d && d.enc) {
          const pass = prompt('این بکاپ رمزداره. رمزش رو وارد کن:'); if (pass === null) return;
          try { d = await decryptJSON(d, pass); } catch (e) { toast('رمز اشتباهه یا فایل خراب شده.', 'bad'); return; }
        }
        if (!d || typeof d !== 'object' || !(Array.isArray(d.tx) || Array.isArray(d.ops))) throw new Error('bad');
        const n = [];
        if (Array.isArray(d.tx)) n.push(`${faDigits(d.tx.length)} تراکنش`, `${faDigits((d.loans || []).length)} وام`);
        if (Array.isArray(d.ops)) n.push(`${faDigits(d.ops.length)} عملیات سرمایه`);
        if (!confirm(`بکاپ شامل ${n.join('، ')} است. جایگزین همه‌ی داده‌های فعلی بشه؟`)) return;
        const lock = S.settings.lock;
        S = normalize(d); if (!S.settings.lock) S.settings.lock = lock;
        save(); bindInv(); lastHero = null; go('home'); toast('داده‌ها بازگردانی شد.');
      } catch (e) { toast('این فایل بکاپ معتبر نیست.', 'bad'); }
    };
    r.readAsText(file);
  }
  let hiddenAt = 0;
  function showLock() {
    if (!S.settings.lock || $('#lock')) return;
    const el = document.createElement('div'); el.id = 'lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="box"><div class="mark">VAULT</div><h2>قفله</h2><p>رمزت رو وارد کن</p>
      <input id="pin" type="password" inputmode="numeric" autocomplete="off" aria-label="رمز"><button class="btn wide" id="unlock">باز کردن</button><div class="err" id="pinerr" role="alert"></div></div>`;
    document.body.appendChild(el);
    const pin = $('#pin', el); setTimeout(() => pin.focus(), 100);
    const tryIt = async () => {
      if (!S.settings.lock) { el.remove(); return; }
      const h = await sha(S.settings.lock.salt + ':' + C.normDigits(pin.value));
      if (h === S.settings.lock.hash) el.remove(); else { $('#pinerr', el).textContent = 'رمز اشتباهه.'; pin.value = ''; }
    };
    $('#unlock', el).addEventListener('click', tryIt);
    pin.addEventListener('keydown', e => { if (e.key === 'Enter') tryIt(); });
  }
  function openSetLock() {
    openSheet('رمز قفل', `<p class="note">یه رمز عددی ۴ تا ۸ رقمی. اگه فراموشش کنی، تنها راه برگشت پاک کردن داده‌های سایت و بازگردانی بکاپه.</p>
      <label class="lbl" for="p1">رمز جدید</label><input id="p1" type="password" inputmode="numeric">
      <label class="lbl" for="p2">تکرار رمز</label><input id="p2" type="password" inputmode="numeric">
      <button class="btn wide" id="psave">ذخیره‌ی رمز</button>`, ov => {
      once($('#psave', ov), async () => {
        const a = C.normDigits($('#p1', ov).value), b = C.normDigits($('#p2', ov).value);
        if (!/^\d{4,8}$/.test(a)) { toast('رمز باید ۴ تا ۸ رقم باشه.', 'bad'); return false; }
        if (a !== b) { toast('دو رمز یکی نیستن.', 'bad'); return false; }
        const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
        S.settings.lock = { salt, hash: await sha(salt + ':' + a) }; save(); closeSheet(ov); render(); toast('قفل فعال شد.');
      });
    });
  }

  // ---------- رویدادها ----------
  document.addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { go(tb.dataset.tab); return; }
    const tipEl = e.target.closest('[data-tip]');
    if (tipEl) {
      const fig = tipEl.closest('.chart'); if (!fig) return;
      $$('.sel', fig).forEach(x => x.classList.remove('sel')); tipEl.classList.add('sel');
      const cap = $('.tip', fig); if (cap) { cap.textContent = tipEl.dataset.tip; cap.classList.add('on'); }
      return;
    }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, k = b.dataset.k, id = b.dataset.id, key = b.dataset.key;
    const acts = {
      add: () => openTxForm({ type: b.dataset.type }), paste: openPaste, duelist: openDueList, chooser: openChooser,
      pay: () => openPay(k, id, key), quickpay: () => quickPay(k, id, key), unpay: () => askUnpay(k, id, key),
      edit: () => openTxForm({ id }),
      goob: () => go('ob'), goloan: () => { obTab = 'loan'; go('ob'); }, godebt: () => { obTab = 'debt'; go('ob'); },
      txm: () => { txMonth = C.addYm(txMonth, +b.dataset.d); render(); },
      repm: () => { repMonth = C.addYm(repMonth, +b.dataset.d); render(); },
      txf: () => { txFilter = b.dataset.f; render(); }, obt: () => { obTab = b.dataset.t; render(); },
      newloan: () => openLoanForm(), newfixed: () => openFixedForm(),
      loan: () => openLoanDetail(id), fixed: () => openFixedForm(id),
      newdebt: () => openDebtForm(null, b.dataset.dir), debtd: () => openDebtDetail(id),
      excel: exportExcel, ics: exportICS, cal: sendToCalendar, backup, goset: () => go('set'),
      savebnpl: () => { const v = readInt($('#bnplday')); if (!(v >= 1 && v <= 31)) { toast('روز باید بین ۱ تا ۳۱ باشه.', 'bad'); return; } S.settings.bnplDay = v; save(); toast('ذخیره شد.'); },
      back: () => { if (history.state && history.state.tab && history.length > 1) history.back(); else go(prevTab); },
      addhub: openAddHub, newincome: () => openIncomeForm(), income: () => openIncomeForm(id),
      setlock: openSetLock, dellock: () => { if (!confirm('قفل برداشته بشه؟')) return; S.settings.lock = null; save(); render(); toast('قفل برداشته شد.'); },
      unit: () => { S.settings.unit = b.dataset.u; save(); lastHero = null; render(); },
      saveexp: () => { S.settings.expectedIncome = readAmount($('#view'), 'expected'); save(); toast('ذخیره شد.'); },
      addcat: () => { const inp = $('#newcat-' + b.dataset.type); const v = inp.value.trim().slice(0, 40); if (!v) return;
        if (!S.categories[b.dataset.type].includes(v)) S.categories[b.dataset.type].push(v); save(); render(); },
      delcat: () => { S.categories[b.dataset.type].splice(+b.dataset.i, 1); save(); render(); },
      saveacc: () => {
        $$('[data-accname]').forEach(i => { const ac = S.accounts.find(x => x.id === i.dataset.accname); if (ac && i.value.trim()) ac.name = i.value.trim().slice(0, 40); });
        $$('[data-accbal]').forEach(i => { const ac = S.accounts.find(x => x.id === i.dataset.accbal); if (!ac) return; const raw = C.normDigits(i.value).trim(), v = raw.replace(/\D/g, '');
          const cur = curBal(ac), dv = v === '' ? null : (/^[-−]/.test(raw) ? -1 : 1) * Number(v);
          if (dv === (cur === null ? null : Math.round(disp(cur)))) return; // بدون تغییر (حتی با گرد شدن ریال به تومان)
          setAnchor(ac, dv === null ? null : toRial(dv), nowStamp()); });
        $$('[data-acclim]').forEach(i => { const ac = S.accounts.find(x => x.id === i.dataset.acclim); if (!ac) return; const v = C.normDigits(i.value).replace(/\D/g, ''); ac.limit = v ? toRial(Number(v)) : 0; });
        save(); render(); toast('ذخیره شد.'); },
      addbank: () => { const n = ($('#newbank').value || '').trim().slice(0, 40); if (!n) return; S.accounts.push({ id: uid(), kind: 'bank', bank: n, num: '', name: n, balance: null, stamp: '' }); save(); render(); },
      addcredit: () => { const n = ($('#newcredit').value || '').trim().slice(0, 40); if (!n) return; S.accounts.push({ id: uid(), kind: 'credit', name: n, limit: 0, paid: {} }); save(); render(); },
      addlist: () => { const k = b.dataset.key, n = ($('#newlist-' + k).value || '').trim().slice(0, 40); if (!n) return; S.lists[k] = [...new Set([...(S.lists[k] || []), n])]; save(); render(); },
      dellist: () => { const k = b.dataset.key; (S.lists[k] || []).splice(+b.dataset.i, 1); save(); render(); },
      delacc: () => { if (!confirm('این حساب حذف بشه؟ تراکنش‌هاش می‌مونن ولی دیگه به حسابی وصل نیستن.')) return;
        S.tx.forEach(t => { if (t.account === id) t.account = ''; }); S.accounts = S.accounts.filter(x => x.id !== id); save(); render(); },
      wipe: () => { if (prompt('برای پاک کردن همه‌چیز، کلمه‌ی «پاک» رو بنویس. این کار برگشت‌پذیر نیست.') !== 'پاک') return;
        const lock = S.settings.lock; S = normalize(defaults()); S.settings.lock = lock; save(); bindInv(); lastHero = null; go('home'); toast('همه‌ی داده‌ها پاک شد. فهرست بانک‌ها و پلتفرم‌ها دوباره آماده‌ست.'); }
    };
    if (acts[a]) acts[a]();
    else if (window.Inv && window.Inv.acts[a]) window.Inv.acts[a](b, e);
  });
  document.addEventListener('change', e => {
    const sel = e.target;
    if (sel.tagName === 'SELECT' && sel.value === '__newbank') {
      const n = (prompt('اسم حساب بانکی جدید:') || '').trim().slice(0, 40);
      if (!n) { sel.value = ''; return; }
      const a = { id: uid(), kind: 'bank', bank: n, num: '', name: n, balance: null, stamp: '' }; S.accounts.push(a); save();
      const credit = [...sel.querySelectorAll('optgroup')].length > 1;
      sel.innerHTML = accOptions(a.id, credit); sel.value = a.id; toast(`حساب «${n}» اضافه شد.`);
    }
    if (sel.tagName === 'SELECT' && sel.value === '__newlender') {
      const list = sel.dataset.list, n = (prompt(list === 'bnpl' ? 'اسم پلتفرم خرید قسطی:' : 'اسم وام‌دهنده:') || '').trim().slice(0, 40);
      if (!n) { sel.value = ''; return; }
      S.lists[list] = [...new Set([...(S.lists[list] || []), n])]; save();
      sel.innerHTML = lenderOptions(list, n); sel.value = n; sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  document.addEventListener('change', e => { if (e.target.id === 'restore' && e.target.files[0]) { restore(e.target.files[0]); e.target.value = ''; } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('.overlay')) closeSheet(); });

  // لینک‌های مستقیم برای ویجت Shortcuts
  function route() {
    const raw = location.hash.replace('#', '');
    if (!raw) return;
    history.replaceState({ tab: 'home' }, '', location.pathname + location.search);
    const [h, qs] = raw.split('?');
    const q = new URLSearchParams(qs || '');
    const a = Number(C.normDigits(q.get('a') || '').replace(/\D/g, '').slice(0, 15));
    const pre = { note: (q.get('n') || '').slice(0, 200) }; if (a) pre.amount = Math.round(toRial(a));
    $$('.overlay').forEach(x => x.remove()); document.body.classList.remove('locked');
    go('home');
    if (h === 'add' || h === 'out') openTxForm({ type: 'expense', prefill: pre });
    else if (h === 'income' || h === 'in') openTxForm({ type: 'income', prefill: pre });
    else if (h === 'new') openChooser();
    else if (h === 'paste') openPaste();
    else if (h === 'pay') openDueList();
    else if (window.Inv && (h === 'prices' || h === 'buy' || h === 'sell')) { go('inv'); if (h === 'prices') window.Inv.openPrices(); else window.Inv.openOp(h); }
  }
  window.addEventListener('hashchange', route);
  // بعد از برگشتن به اپ (مثلاً روز بعد) تاریخ «امروز» تازه بشه
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (S.settings.lock && hiddenAt && Date.now() - hiddenAt > 60000) showLock();
    if (!$('.overlay')) render();
    if (window.Inv) window.Inv.pullPrices();
  });

  // ---------- شروع ----------
  // رابط مشترک برای ماژول سرمایه (invest-ui.js)
  window.App = { save, render: () => render(), go, headerTools: () => headerTools(), catIcon, bankTotal, curBal, creditUsedTotal, bankAccounts, money, openSheet, closeSheet, closeAll, toast, once, esc, $, $$, uid, shareFile, today,
    get tab() { return tab; }, debtTotals, loanRemaining: () => S.loans.reduce((s, l) => s + C.loanSummary(l).remainingAmount, 0) };
  try { history.replaceState({ tab: 'home' }, ''); } catch (e) { /* */ }
  load(); render(); showLock(); route();
  if (window.Inv) window.Inv.pullPrices();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__hesab = window.__vault = { get state() { return S; }, encryptJSON, decryptJSON }; // برای تست
})();
