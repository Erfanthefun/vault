/* هسته‌ی منطقی اپ: تقویم شمسی، قالب‌بندی، پارسر پیامک، محاسبه‌ی تعهدات */
(function (root) {
  'use strict';

  // ---------- تقویم شمسی (الگوریتم jalaali) ----------
  const div = (a, b) => ~~(a / b);
  const mod = (a, b) => a - ~~(a / b) * b;
  const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function jalCal(jy, withoutLeap) {
    const bl = BREAKS.length, gy = jy + 621;
    let leapJ = -14, jp = BREAKS[0], jm, jump = 0, leap, n, i;
    for (i = 1; i < bl; i++) {
      jm = BREAKS[i]; jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (withoutLeap) return { gy, march };
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }
  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  }
  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }
  function j2d(jy, jm, jd) {
    const r = jalCal(jy, true);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy, false);
    let k = jdn - g2d(gy, 3, r.march), jm, jd;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy, jm, jd }; }
      k -= 186;
    } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
    jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
    return { jy, jm, jd };
  }
  const isLeapJ = jy => jalCal(jy, false).leap === 0;
  const monthLen = (jy, jm) => jm <= 6 ? 31 : jm <= 11 ? 30 : (isLeapJ(jy) ? 30 : 29);

  const pad = n => String(n).padStart(2, '0');
  const jStr = (y, m, d) => `${y}/${pad(m)}/${pad(d)}`;
  const jParse = s => { const [y, m, d] = s.split('/').map(Number); return { y, m, d }; };

  function toJ(date) {
    const j = d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
    return jStr(j.jy, j.jm, j.jd);
  }
  function toG(js) {
    const { y, m, d } = jParse(js);
    return d2g(j2d(y, m, d)); // {gy, gm, gd}
  }
  const today = () => toJ(new Date());
  const ym = js => js.slice(0, 7);

  // افزودن n ماه، با محدود کردن روز به طول ماه مقصد
  function addMonths(js, n, dayWanted) {
    const { y, m, d } = jParse(js);
    let t = (y * 12 + (m - 1)) + n;
    const ny = Math.floor(t / 12), nm = (t % 12) + 1;
    const want = dayWanted || d;
    return jStr(ny, nm, Math.min(want, monthLen(ny, nm)));
  }
  function addYm(ymStr, n) {
    const [y, m] = ymStr.split('/').map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}/${pad((t % 12) + 1)}`;
  }
  function addDays(js, n) {
    const { y, m, d } = jParse(js);
    const j = d2j(j2d(y, m, d) + n);
    return jStr(j.jy, j.jm, j.jd);
  }
  function diffDays(a, b) { // b - a
    const A = jParse(a), B = jParse(b);
    return j2d(B.y, B.m, B.d) - j2d(A.y, A.m, A.d);
  }
  const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  function weekday(js) { const g = toG(js); return WEEKDAYS[new Date(g.gy, g.gm - 1, g.gd).getDay()]; }

  // ---------- اعداد و قالب‌بندی ----------
  function normDigits(s) {
    return String(s || '')
      .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/٬|،/g, ',');
  }
  const faDigits = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const nf = new Intl.NumberFormat('en-US');
  const faNum = n => faDigits(nf.format(Math.round(n))).replace(/,/g, '٬');

  // ---------- پارسر پیامک بانک ----------
  const num = s => Number(String(s).replace(/,/g, ''));

  function inferYear(month, refJ) {
    const r = jParse(refJ || today());
    return month > r.m + 1 ? r.y - 1 : r.y;
  }

  function parseSMS(raw, refJ) {
    const text = normDigits(raw).trim();
    if (!text) return null;
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const out = { bank: '', account: '', type: '', amount: 0, balance: null, date: '', time: '', note: '' };

    const timeM = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/m);
    if (timeM) out.time = `${pad(timeM[1])}:${timeM[2]}`;

    if (/بلو/.test(text)) {
      out.bank = 'بلو';
      const a = text.match(/([\d,]+)\s*ریال\s*(از|به)\s*حساب/);
      if (a) out.amount = num(a[1]);
      if (/برداشت|پرید|کسر/.test(text)) out.type = 'expense';
      else if (/واریز|نشست/.test(text)) out.type = 'income';
      else if (a) out.type = a[2] === 'از' ? 'expense' : 'income';
      const b = text.match(/موجودی\s*:?\s*([\d,]+)/);
      if (b) out.balance = num(b[1]);
      const d = text.match(/(1[34]\d\d)[.\/-](\d{1,2})[.\/-](\d{1,2})/);
      if (d) out.date = jStr(+d[1], +d[2], +d[3]);
      const title = lines[1] && !/\d/.test(lines[1]) ? lines[1] : '';
      out.note = title;
    } else if (/خاورمیانه/.test(text)) {
      out.bank = 'خاورمیانه';
      const acc = text.match(/(\d{3}\/\d{5,})/);
      if (acc) out.account = acc[1];
      const a = text.match(/^([+-])\s*([\d,]+)\s*$/m);
      if (a) { out.amount = num(a[2]); out.type = a[1] === '-' ? 'expense' : 'income'; }
      const b = text.match(/مانده\s*:?\s*(-?[\d,]+)/);
      if (b) out.balance = num(b[1]);
      const dl = lines.find(l => /^\d{2}\/\d{2}$/.test(l));
      if (dl) { const [mm, dd] = dl.split('/').map(Number); out.date = jStr(inferYear(mm, refJ), mm, dd); }
      out.note = lines.filter(l =>
        !/خاورمیانه/.test(l) && !/^[+-]\s*[\d,]+$/.test(l) && !/^\d{3}\/\d+$/.test(l) &&
        !/^\d{2}\/\d{2}$/.test(l) && !/^\d{1,2}:\d{2}$/.test(l) && !/^مانده/.test(l)).join(' - ');
    } else {
      // حالت عمومی برای بانک‌های دیگر
      out.bank = lines[0] && !/\d/.test(lines[0]) ? lines[0].slice(0, 30) : 'بانک';
      const signed = text.match(/(?:^|\s)([+-])\s*([\d,]{3,})/m);
      if (signed) { out.amount = num(signed[2]); out.type = signed[1] === '-' ? 'expense' : 'income'; }
      if (!out.amount) {
        const cleaned = text.replace(/(موجودی|مانده)\s*:?\s*-?[\d,]+/g, '');
        const m = cleaned.match(/([\d]{1,3}(?:,\d{3})+|\d{4,})\s*(?:ریال)?/);
        if (m) out.amount = num(m[1]);
      }
      if (!out.type) {
        if (/برداشت|خرید|انتقال از|کسر|پرداخت/.test(text)) out.type = 'expense';
        else if (/واریز|انتقال به حساب شما|نشست|دریافت/.test(text)) out.type = 'income';
      }
      const b = text.match(/(?:موجودی|مانده)\s*:?\s*(-?[\d,]+)/);
      if (b) out.balance = num(b[1]);
      const full = text.match(/(1[34]\d\d)[.\/-](\d{1,2})[.\/-](\d{1,2})/);
      if (full) out.date = jStr(+full[1], +full[2], +full[3]);
      else {
        const s = text.match(/(?:^|\s)(\d{2})\/(\d{2})(?:\s|$)/m);
        if (s && +s[1] <= 12) out.date = jStr(inferYear(+s[1], refJ), +s[1], +s[2]);
      }
    }
    if (!out.date) out.date = refJ || today();
    if (!out.amount) return { ...out, error: 'مبلغ در متن پیامک پیدا نشد.' };
    if (!out.type) out.type = 'expense';
    return out;
  }

  // ---------- تعهدات: اقساط و پرداخت‌های ماهانه ----------
  function txAmountMap(state) { const m = new Map(); for (const t of state.tx) m.set(t.id, t.amount); return m; }
  // سررسید قسط i: وام بانکی = هر ماه همون روزِ قسط اول. خرید قسطی (restDay): قسط اول روز خرید، بقیه روز restDay ماه‌های بعد
  function loanDue(loan, i) {
    if (loan.restDay && i > 0) {
      const [y, m] = addYm(ym(loan.first), i).split('/').map(Number);
      return jStr(y, m, Math.min(loan.restDay, monthLen(y, m)));
    }
    return addMonths(loan.first, i, jParse(loan.first).d);
  }

  // هر تعهد: amount = مبلغ واقعی اگه پرداخت شده، وگرنه مبلغ اسمی/پیش‌بینی
  function obligationsForMonth(state, ymStr, txMap) {
    txMap = txMap || txAmountMap(state);
    const [y, m] = ymStr.split('/').map(Number);
    const paidAmount = (info, nominal) => info.txId && txMap.has(info.txId) ? txMap.get(info.txId) : nominal;
    const list = [];
    for (const l of state.loans) {
      const [fy, fm] = l.first.split('/').map(Number);
      const i = (y * 12 + m) - (fy * 12 + fm);
      if (i < 0 || i >= l.count) continue;
      const info = l.paid && l.paid[i];
      list.push({ kind: 'loan', id: l.id, key: String(i), name: l.name, sub: `قسط ${faDigits(i + 1)} از ${faDigits(l.count)}`,
        estimate: l.amount, amount: info ? paidAmount(info, l.amount) : l.amount, due: loanDue(l, i), paid: !!info, variable: false });
    }
    for (const f of state.fixed) {
      if (f.start && ymStr < f.start) continue;
      if (f.end && ymStr > f.end) continue;
      const info = f.paid && f.paid[ymStr];
      list.push({ kind: 'fixed', id: f.id, key: ymStr, name: f.name, sub: f.variable ? 'متغیر، پیش‌بینی' : 'پرداخت ماهانه',
        estimate: f.amount, amount: info ? paidAmount(info, f.amount) : f.amount, due: jStr(y, m, Math.min(f.day, monthLen(y, m))),
        paid: !!info, variable: !!f.variable });
    }
    return list.sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
  }

  // واریزهای بی‌پیوندی که در واقع همون درآمد ثابت‌اند (مثلاً حقوق با «ثبت واریز» بدون انتخاب درآمد ثابت).
  // شرط: تا ۱۰ روز فاصله از روز مورد انتظار و مبلغ تا ۲۰٪ نزدیک (یا هم‌دسته). هر واریز فقط به یک ماهِ یک درآمد؛
  // نزدیک‌ترین مبلغ و تاریخ اول. کاربر می‌تونه با noMatch یه واریز رو از این کار بیرون بذاره. داده عوض نمی‌شه.
  function incomeMatches(state) {
    const out = new Map(), used = new Set(), incs = state.incomes || [];
    if (!incs.length) return out;
    const refd = new Set();
    const mark = paid => Object.values(paid || {}).forEach(i => { if (i && i.txId) refd.add(i.txId); });
    (state.loans || []).forEach(l => mark(l.paid)); (state.fixed || []).forEach(f => mark(f.paid)); incs.forEach(f => mark(f.paid));
    const cands = [];
    for (const t of state.tx) {
      if (t.type !== 'income' || t.link || t.debt || t.noMatch || refd.has(t.id)) continue;
      const tym = ym(t.date);
      for (const f of incs) for (const m of [addYm(tym, -1), tym, addYm(tym, 1)]) {
        if ((f.start && m < f.start) || (f.end && m > f.end) || (f.paid && f.paid[m])) continue;
        const [y, mo] = m.split('/').map(Number), due = jStr(y, mo, Math.min(f.day, monthLen(y, mo)));
        const dist = Math.abs(diffDays(t.date, due)); if (dist > 10) continue;
        const near = !!f.amount && Math.abs(t.amount - f.amount) <= f.amount * 0.2;
        if (!near && !(f.cat && t.cat === f.cat)) continue;
        cands.push({ key: f.id + '|' + m, tx: t, dist, near: near ? 1 : 0, gap: Math.abs(t.amount - f.amount) });
      }
    }
    cands.sort((a, b) => (b.near - a.near) || a.dist - b.dist || a.gap - b.gap);
    for (const c of cands) if (!out.has(c.key) && !used.has(c.tx.id)) { out.set(c.key, c.tx); used.add(c.tx.id); }
    return out;
  }

  // درآمدهای ثابت ماه (حقوق، اجاره‌ای که می‌گیری…): amount = مبلغ واقعی اگه دریافت شده، وگرنه مبلغ مورد انتظار
  function incomesForMonth(state, ymStr, txMap, matches) {
    txMap = txMap || txAmountMap(state); matches = matches || incomeMatches(state);
    const [y, m] = ymStr.split('/').map(Number), out = [];
    for (const f of (state.incomes || [])) {
      if (f.start && ymStr < f.start) continue;
      if (f.end && ymStr > f.end) continue;
      const info = f.paid && f.paid[ymStr];
      const auto = !info && matches.get(f.id + '|' + ymStr);
      const got = info ? (info.txId && txMap.has(info.txId) ? txMap.get(info.txId) : f.amount) : auto ? auto.amount : f.amount;
      out.push({ kind: 'income', id: f.id, key: ymStr, name: f.name, sub: f.variable ? 'درآمد متغیر، پیش‌بینی' : 'درآمد ثابت',
        estimate: f.amount, amount: got, due: jStr(y, m, Math.min(f.day, monthLen(y, m))), paid: !!info || !!auto, variable: !!f.variable,
        auto: auto ? { txId: auto.id, date: auto.date } : null });
    }
    return out.sort((a, b) => a.due.localeCompare(b.due));
  }

  // تعهدات پرداخت‌نشده در بازه‌ی چند ماه اطراف ماه مرجع
  function openObligations(state, refYm, fromOffset, toOffset) {
    const map = txAmountMap(state); let all = [];
    for (let i = fromOffset; i <= toOffset; i++) all = all.concat(obligationsForMonth(state, addYm(refYm, i), map));
    return all.filter(o => !o.paid);
  }

  function monthStats(state, ymStr) {
    const map = txAmountMap(state);
    const txs = state.tx.filter(t => ym(t.date) === ymStr);
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const inc = incomesForMonth(state, ymStr, map);
    const incReceived = inc.filter(i => i.paid).reduce((s, i) => s + i.amount, 0);
    const incPending = inc.filter(i => !i.paid).reduce((s, i) => s + i.amount, 0);
    const planned = income + incPending; // درآمد ثبت‌شده + درآمدهای ثابتی که هنوز نرسیده
    const variable = txs.filter(t => t.type === 'expense' && !t.link).reduce((s, t) => s + t.amount, 0);
    const obs = obligationsForMonth(state, ymStr, map);
    const sum = arr => arr.reduce((s, o) => s + o.amount, 0);
    const unpaid = obs.filter(o => !o.paid), paid = obs.filter(o => o.paid);
    const obTotal = sum(obs), obPaid = sum(paid), obRemaining = sum(unpaid);
    const expected = (state.settings && state.settings.expectedIncome) || 0;
    const base = Math.max(planned, expected);
    return { income, expected, base, hasIncome: base > 0, usedExpected: expected > planned, variable, obs, inc, incReceived, incPending, planned,
      obTotal, obPaid, obRemaining, count: obs.length, paidCount: paid.length,
      loanRemaining: sum(unpaid.filter(o => o.kind === 'loan')),
      fixedRemaining: sum(unpaid.filter(o => o.kind === 'fixed' && !o.variable)),
      varRemaining: sum(unpaid.filter(o => o.variable)),
      free: base - obTotal - variable };
  }

  function loanSummary(loan) {
    const paidCount = Object.keys(loan.paid || {}).filter(k => +k < loan.count).length;
    const remainingCount = Math.max(0, loan.count - paidCount);
    let next = null;
    for (let i = 0; i < loan.count; i++) if (!(loan.paid || {})[i]) { next = { i, due: loanDue(loan, i) }; break; }
    return { paidCount, remainingCount, remainingAmount: remainingCount * loan.amount, last: loanDue(loan, loan.count - 1), next };
  }

  // ---------- شاخص‌ها (KPI) و داده‌ی نمودارها ----------
  const ymIndex = s => { const [y, m] = s.split('/').map(Number); return y * 12 + m - 1; };

  // خرج یک ماه به تفکیک: اقساط وام، پرداخت‌های ماهانه، خرج روزمره
  function monthOutflow(state, ymStr) {
    const o = { loans: 0, bills: 0, daily: 0, total: 0 };
    for (const t of state.tx) {
      if (t.type !== 'expense' || ym(t.date) !== ymStr) continue;
      if (t.link && t.link.kind === 'loan') o.loans += t.amount;
      else if (t.link) o.bills += t.amount;
      else o.daily += t.amount;
      o.total += t.amount;
    }
    return o;
  }
  // جریان نقدی ماه، بر اساس ماهِ هر تعهد/درآمد (همون‌طور که کاربر فکر می‌کنه):
  // رفت = همه‌ی قسط‌ها و قبض‌های پرداخت‌شده‌ی این ماه (با مبلغ واقعی؛ «پرداخت‌شده‌ی قبلی» و تیک بدون تراکنش هم حساب می‌شن)
  //       + برداشت‌های این ماه که به هیچ تعهدی وصل نیستن (روزمره)
  // آمد  = درآمدهای ثابت دریافت‌شده‌ی این ماه + درآمدهای ثابتی که روزشون رسیده ولی تیک نخورده‌ن (assumed)
  //       + واریزهای این ماه که به درآمد ثابتی وصل نیستن. انتقال داخلی حساب نمی‌شه.
  function cashFlow(state, ymStr, todayStr) {
    const map = txAmountMap(state), refd = new Set();
    const mark = paid => Object.values(paid || {}).forEach(i => { if (i && i.txId) refd.add(i.txId); });
    state.loans.forEach(l => mark(l.paid)); state.fixed.forEach(f => mark(f.paid)); (state.incomes || []).forEach(f => mark(f.paid));
    const matches = incomeMatches(state); for (const t of matches.values()) refd.add(t.id);
    const obs = obligationsForMonth(state, ymStr, map).filter(o => o.paid);
    const loans = obs.filter(o => o.kind === 'loan').reduce((s, o) => s + o.amount, 0);
    const bills = obs.filter(o => o.kind !== 'loan').reduce((s, o) => s + o.amount, 0);
    const txs = state.tx.filter(t => ym(t.date) === ymStr && !refd.has(t.id));
    const daily = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const other = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const inc = incomesForMonth(state, ymStr, map, matches);
    const got = inc.filter(i => i.paid).reduce((s, i) => s + i.amount, 0);
    const due = inc.filter(i => !i.paid && todayStr && i.due <= todayStr);
    const assumed = due.reduce((s, i) => s + i.amount, 0);
    const pending = inc.filter(i => !i.paid && !(todayStr && i.due <= todayStr)).reduce((s, i) => s + i.amount, 0);
    const tin = got + assumed + other, out = loans + bills + daily, net = tin - out;
    return { in: tin, out, loans, bills, daily, net, rate: tin > 0 ? net / tin : null, assumed, assumedNames: due.map(i => i.name), pending };
  }
  function categoryTotals(state, ymStr) {
    const m = {};
    for (const t of state.tx) if (t.type === 'expense' && ym(t.date) === ymStr) { const c = t.cat || 'سایر'; m[c] = (m[c] || 0) + t.amount; }
    return m;
  }
  function cumulativeByDay(state, ymStr) {
    const [y, m] = ymStr.split('/').map(Number), len = monthLen(y, m), arr = new Array(len).fill(0);
    for (const t of state.tx) if (t.type === 'expense' && ym(t.date) === ymStr) arr[Math.min(len, jParse(t.date).d) - 1] += t.amount;
    for (let i = 1; i < len; i++) arr[i] += arr[i - 1];
    return arr;
  }
  // اقساط پرداخت‌نشده‌ی هر وام که سررسیدشون بعد از ماه داده‌شده است
  function unpaidAfter(loan, ymStr) {
    let n = 0; const lim = ymIndex(ymStr);
    for (let i = 0; i < loan.count; i++) if (!(loan.paid || {})[i] && ymIndex(ym(loanDue(loan, i))) > lim) n++;
    return n;
  }
  // روند بدهی: نقطه‌ی اول = مانده‌ی واقعی الان؛ بعد با فرض پرداخت طبق برنامه
  function debtProjection(state, curYm, maxMonths) {
    const pts = [{ ym: curYm, now: true, total: state.loans.reduce((s, l) => s + loanSummary(l).remainingAmount, 0) }];
    for (let k = 0; k < maxMonths; k++) {
      const m = addYm(curYm, k);
      const total = state.loans.reduce((s, l) => s + unpaidAfter(l, m) * l.amount, 0);
      pts.push({ ym: m, total });
      if (!total) break;
    }
    return pts;
  }
  function debtFreeYm(state) {
    let last = null;
    for (const l of state.loans) for (let i = l.count - 1; i >= 0; i--) if (!(l.paid || {})[i]) { const m = ym(loanDue(l, i)); if (!last || m > last) last = m; break; }
    return last;
  }
  function obligationForecast(state, curYm, n) {
    const map = txAmountMap(state), out = [];
    for (let k = 0; k < n; k++) {
      const m = addYm(curYm, k), f = { ym: m, loans: 0, fixed: 0, variable: 0 };
      for (const o of obligationsForMonth(state, m, map)) f[o.kind === 'loan' ? 'loans' : o.variable ? 'variable' : 'fixed'] += o.amount;
      f.total = f.loans + f.fixed + f.variable; out.push(f);
    }
    return out;
  }
  // اقساطی که در n ماه آینده تموم می‌شن و پول ماهانه آزاد می‌کنن
  function reliefWithin(state, curYm, n) {
    const lim = addYm(curYm, n - 1); let amount = 0; const loans = [];
    for (const l of state.loans) {
      const s = loanSummary(l); if (!s.remainingCount) continue;
      const last = ym(s.last);
      if (last >= curYm && last <= lim) { amount += l.amount; loans.push(l.name); }
    }
    return { amount, loans };
  }
  // پرداخت به‌موقع: پرداخت‌های ثبت‌شده (نه «قبلی») که تاریخشون ≤ سررسید بوده
  function onTimeRate(state, fromYm, toYm) {
    let n = 0, ok = 0;
    for (const l of state.loans) for (const k of Object.keys(l.paid || {})) {
      const info = l.paid[k]; if (!info || info.prior || +k >= l.count) continue;
      const due = loanDue(l, +k), m = ym(due); if (m < fromYm || m > toYm) continue;
      n++; if ((info.date || '') <= due) ok++;
    }
    for (const f of state.fixed) for (const k of Object.keys(f.paid || {})) {
      const info = f.paid[k]; if (!info || k < fromYm || k > toYm || !/^\d{4}\/\d{2}\/\d{2}$/.test(info.date || '')) continue;
      const [y, m] = k.split('/').map(Number), due = jStr(y, m, Math.min(f.day, monthLen(y, m)));
      n++; if (info.date <= due) ok++;
    }
    return { n, ok, rate: n ? ok / n : null };
  }
  function varianceOfVariable(state, ymStr) {
    const items = obligationsForMonth(state, ymStr).filter(o => o.variable);
    const paid = items.filter(o => o.paid);
    return { items, est: paid.reduce((s, o) => s + o.estimate, 0), actual: paid.reduce((s, o) => s + o.amount, 0), paidCount: paid.length };
  }
  function kpis(state, ymStr, todayStr) {
    const prev = addYm(ymStr, -1), st = monthStats(state, ymStr), stp = monthStats(state, prev);
    const out = monthOutflow(state, ymStr), outp = monthOutflow(state, prev);
    const [y, m] = ymStr.split('/').map(Number), len = monthLen(y, m);
    const curYm = ym(todayStr), isCur = ymStr === curYm, isFuture = ymStr > curYm;
    const days = isCur ? jParse(todayStr).d : isFuture ? 0 : len;
    const loanOb = st.obs.filter(o => o.kind === 'loan').reduce((s, o) => s + o.amount, 0);
    const loanObPrev = stp.obs.filter(o => o.kind === 'loan').reduce((s, o) => s + o.amount, 0);
    const debtNow = state.loans.reduce((s, l) => s + loanSummary(l).remainingAmount, 0);
    const free = debtFreeYm(state);
    // درآمد = «آمد» همون جریان نقدی صفحه‌ی خانه (درآمد ثابت تیک‌خورده یا رسیده + واریزهای آزاد)؛
    // اگه هنوز چیزی نرسیده، درآمد پیش‌بینی تنظیمات
    const cf = cashFlow(state, ymStr, todayStr);
    const expected = (state.settings && state.settings.expectedIncome) || 0;
    const income = cf.in > 0 ? cf.in : expected;
    return {
      ym: ymStr, prev, days, len, isCur,
      progress: st.count ? st.obPaid / st.obTotal : null, paidCount: st.paidCount, count: st.count,
      onTime: onTimeRate(state, addYm(ymStr, -5), ymStr),
      loanLoad: loanOb, loanLoadPrev: loanObPrev,
      outflow: out.total, outflowPrev: outp.total, outParts: out,
      dailyAvg: days ? out.daily / days : 0, dailyProjected: days ? out.daily / days * len : 0,
      debtNow, debtPaidThisMonth: out.loans,
      debtFree: free, monthsToFree: free ? ymIndex(free) - ymIndex(curYm) : 0,
      relief: reliefWithin(state, curYm, 3),
      variance: varianceOfVariable(state, ymStr),
      loanShare: out.total ? out.loans / out.total : null,
      income, hasIncome: income > 0,
      dti: income ? loanOb / income : null,
      savingsRate: income ? (income - cf.out) / income : null, cashOut: cf.out
    };
  }

  // ---------- موجودی حساب‌ها ----------
  // موجودی = آخرین موجودی قطعی (پیامک یا ورود دستی) ± تراکنش‌های این حساب که بعد از اون لحظه‌ان.
  // لنگر: a.balance (ریال)، a.stamp ('YYYY/MM/DD HH:MM'، لحظه‌ای که موجودی درست بوده)، a.at (میلی‌ثانیه‌ی ثبت لنگر).
  // لنگرِ قدیمی بدون stamp و at (ورود دستی نسخه‌های قبل) = همه‌ی تراکنش‌های حساب بعدش حساب می‌شن.
  // انتقال: account = «از حساب»، to = «به حساب» (خالی = بیرون از حساب‌های بانکی).
  // انتقال قدیمی (بدون فیلد to): برداشت از account، مگر دریافت طلب که واریز به account بود.
  function txAccountDelta(t, accId, debts) {
    const amt = t.amount || 0;
    if (t.type === 'expense') return t.account === accId ? -amt : 0;
    if (t.type === 'income') return t.account === accId ? amt : 0;
    if (t.type !== 'transfer') return 0;
    if (!('to' in t)) {
      if (t.account !== accId) return 0;
      const d = t.debt && (debts || []).find(x => x.id === t.debt);
      return d && d.dir === 'owed' ? amt : -amt;
    }
    let v = 0;
    if (t.account === accId) v -= amt;
    if (t.to === accId) v += amt;
    return v;
  }
  function afterAnchor(t, a) {
    if (!a.stamp) return a.at ? (t.created || 0) > a.at : true;
    const [ad, atime] = a.stamp.split(' ');
    if (t.date !== ad) return t.date > ad;
    if (t.time && atime && atime !== '00:00') return t.time > atime;
    return (t.created || 0) > (a.at || 0);
  }
  function accountBalance(state, a) {
    if (!a || a.balance === null || a.balance === undefined) return null;
    let delta = 0, n = 0;
    for (const t of state.tx) {
      const d = txAccountDelta(t, a.id, state.debts);
      if (!d || !afterAnchor(t, a)) continue;
      delta += d; n++;
    }
    return { balance: a.balance + delta, base: a.balance, delta, n };
  }

  root.Core = { toJ, toG, today, ym, addMonths, addYm, addDays, diffDays, monthLen, jParse, jStr, pad,
    MONTHS, weekday, normDigits, faDigits, faNum, parseSMS, txAmountMap, obligationsForMonth, incomeMatches, incomesForMonth, openObligations, monthStats, loanDue, loanSummary,
    ymIndex, monthOutflow, cashFlow, txAccountDelta, afterAnchor, accountBalance, categoryTotals, cumulativeByDay, debtProjection, debtFreeYm, obligationForecast, reliefWithin, onTimeRate, varianceOfVariable, kpis };
  root.J = root.Core;
})(typeof window !== 'undefined' ? window : globalThis);
