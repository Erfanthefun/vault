/* Vault نسخه‌ی ۱۵ (از ۱۲) — ثبت یکپارچه: برداشت، واریز، انتقال و تبدیل با هر دارایی در هر حساب (منطق خالص و قابل تست با node)
 *
 * «حساب» = هر جایی که پول یا دارایی هست: حساب بانکی، صرافی/پلتفرم/محل نگهداری (locations)، اعتبار خرید، یا «بدون حساب».
 * هر حساب هر دارایی‌ای رو می‌تونه نگه داره. ریالِ حساب‌های بانکی (و اعتبار خرید) مثل قبل در تراکنش‌ها (tx) و موجودی زنده‌ی حساب
 * حساب می‌شه؛ هر چیز دیگه (طلا و ارز در هر حساب، و ریالِ صرافی‌ها) در دفتر دارایی (ops).
 *
 * یک ثبت (Entry) = یک رکورد اصلی:
 *   - تراکنش ساده (tx): ریالِ بانک/اعتبار/بدون حساب، یا هر دارایی «بدون حساب» (فقط ثبت، با asset/qty)
 *   - یا عملیات دفتر دارایی (op با via: 'tx') + حداکثر یک تراکنش وابسته (t.op ↔ o.tx):
 *       · برای جریان نقدی (خرج، هدیه، درآمد) با معادل تومانی و بدون حساب بانکی
 *       · یا برای موجودی حساب بانکی (تبدیل/انتقال بین صرافی و بانک؛ مثل «صرافی ↔ بانک»)
 * بدهی و طلب: «قرض دادم/گرفتم» یک مورد تازه می‌سازه (d.src → رکورد اصلی)، «پرداخت بدهی/دریافت طلب» یک تسویه (d.settles).
 * وام (نسخه‌ی ۱۴): «واریز › وام» دریافت وام رو ثبت می‌کنه (مثل قرض گرفتم، در آمد ماه نیست) و وامش رو در «اقساط» می‌سازه یا به‌روز می‌کنه
 *   (E.loan = فیلدهای وام، یا E.loanId = وامی که از قبل هست). پیوند: رکورد اصلی.loanRecv ↔ loan.recv = { asset, amount, account, date, txId|opId }.
 *   وامی که از همین فرم ساخته شده (src: 'flow') و قسط پرداخت‌شده نداره، با حذف یا عوض کردن این ثبت حذف می‌شه.
 * برنامه‌ی بازپرداخت قرض (نسخه‌ی ۱۴): E.due (یک تاریخ) یا E.plan = { amount, first } (قسطی)؛ d.sched = از کِی در آمار ماه حساب می‌شه.
 * بدهی و طلب (نسخه‌ی ۱۵): هر مورد چند بخش داره (d.parts، هر قرض یک بخش با معادل ریالی‌اش)؛ «قرض دادم/گرفتم» یا مورد تازه می‌سازه یا
 *   (E.joinDebt) یک بخش به مورد باز همون شخص اضافه می‌کنه. E.ret = 'rial' → «معادل ریالی برمی‌گرده» (معادل اجباریه). تسویه‌ی مورد ریالی
 *   با تومان یا دارایی دیگه از طرف ریالی کم می‌شه (s.r)، با همون دارایی یا دلار↔تتر (یک‌به‌یک) از مقدار. بازپخش: Core.debtRecalc.
 * کارمزدها حساب نمی‌شن (انتخاب کاربر): انتقال = یک مقدار؛ در تبدیل هر طرف همون مقداریه که واقعاً جابه‌جا شده.
 *
 * ذخیره و حذف تراکنشی‌ان: روی یک کپی انجام می‌شن و فقط اگه همه‌چیز درست بود (از جمله منفی نشدن هیچ موجودی) روی داده می‌شینن.
 */
(function (root) {
  'use strict';
  const J = root.J, V = root.V, C = root.Core;

  const KINDS = ['out', 'in', 'move', 'conv'];
  const WHY = { out: ['expense', 'gift', 'lend', 'repay'], in: ['income', 'gift', 'borrow', 'collect', 'loan'] };
  const CASH = ['expense', 'income', 'gift'];        // در «آمد» و «رفت» ماه حساب می‌شن
  const DEBT_NEW = ['lend', 'borrow'], DEBT_SETTLE = ['repay', 'collect'];
  const GIFT_CAT = { out: 'کادو', in: 'هدیه' };
  const WHY_NAME = { expense: 'خرج', income: 'درآمد', gift: 'هدیه', lend: 'قرض دادم', borrow: 'قرض گرفتم', repay: 'پرداخت بدهی', collect: 'دریافت طلب', loan: 'دریافت وام' };
  const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;
  const clone = o => JSON.parse(JSON.stringify(o));
  const unitFa = a => V.ASSETS[a].fa || V.ASSETS[a].unit;

  // ---------- حساب‌ها و محل‌ها ----------
  function place(state, id) {
    if (!id) return { id: '', kind: 'none', name: '' };
    const a = (state.accounts || []).find(x => x.id === id);
    if (a) return { id, kind: a.kind === 'credit' ? 'credit' : 'bank', name: a.name };
    const l = (state.locations || []).find(x => x.id === id);
    if (l) return { id, kind: 'loc', name: l.name };
    return null;
  }
  const placeName = (state, id) => { const p = place(state, id); return p ? p.name : 'محل حذف‌شده'; };
  // این دارایی در این حساب در دفتر دارایی نگه داشته می‌شه؟ (ریالِ بانک در تراکنش‌ها می‌مونه)
  const inLedger = (p, asset) => !!p && (p.kind === 'loc' || (p.kind === 'bank' && asset !== 'irr'));
  // تراکنش ساده کافیه: ریالِ بانک/اعتبار، یا «بدون حساب» (هر دارایی، فقط ثبت)
  const plainPath = (p, asset) => !!p && (p.kind === 'none' || p.kind === 'credit' || (p.kind === 'bank' && asset === 'irr'));
  // همه‌ی جاهایی که دارایی دفتری می‌تونن داشته باشن: محل‌ها + حساب‌های بانکی
  const places = state => (state.locations || []).map(l => ({ id: l.id, name: l.name, kind: 'loc' }))
    .concat((state.accounts || []).filter(a => a.kind !== 'credit').map(a => ({ id: a.id, name: a.name, kind: 'bank' })));

  // موجودی دفتری یک دارایی در یک حساب (بدون عملیات در حال ویرایش)
  function held(state, acc, asset, skipOpId) {
    const st = skipOpId ? { ...state, ops: state.ops.filter(o => o.id !== skipOpId) } : state;
    return ((V.replay(st).H[acc] || {})[asset]) || 0;
  }
  // ارزش ریالی با قیمت ثبت‌شده‌ی همون روز (یا نزدیک‌ترین)
  function valueAt(state, asset, q, date) {
    if (asset === 'irr') return q;
    const v = V.valueRial(asset, q, V.priceAt(state, date || J.today()), state.settings);
    return v === null ? null : Math.round(v);
  }

  // ---------- تعهدات و بدهی‌ها ----------
  const findOb = (state, kind, id) => (kind === 'loan' ? state.loans : kind === 'income' ? state.incomes : kind === 'credit' ? state.accounts : state.fixed).find(x => x.id === id);
  const debtLeft = d => d.amount - (d.settles || []).reduce((s, x) => s + x.amount, 0);
  const retOf = d => C.isRialRet(d) ? 'rial' : 'unit';
  const refId = r => r ? r.tx || r.op || null : null;
  // مورد قدیمی (بدون بخش): یک بخش از روی مقدار و تاریخ و منبعش
  function ensureParts(d) {
    if (!Array.isArray(d.parts) || !d.parts.length) d.parts = [Object.assign({ id: d.id + 'p', date: d.date, q: d.amount, r: null }, d.src ? { src: d.src } : {})];
    return d.parts;
  }
  // بعد از هر تغییر: بازپخش تسویه‌ها، منبعِ مورد تک‌بخشی (برای سازگاری) و وضعیت تسویه
  function settleDebt(d, date) {
    C.debtRecalc(d);
    if (Array.isArray(d.parts) && d.parts.length) { if (d.parts.length === 1 && d.parts[0].src) d.src = d.parts[0].src; else delete d.src; }
    if (debtLeft(d) > 0) delete d.closed; else if (!d.closed) d.closed = date || J.today();
  }
  // معادل ریالی خودکار برای بدهی و طلب: فقط برای امروز (آخرین قیمت) یا روزی که قیمتش ثبت شده؛ برای روزهای قبل دستی
  function rialAuto(state, asset, q, date) {
    if (asset === 'irr') return q;
    if (!q) return null;
    const P = V.priceAt(state, date); if (!P || (P.date !== date && date !== J.today())) return null;
    const v = V.valueRial(asset, q, P, state.settings);
    return v === null ? null : Math.round(v);
  }
  const sameLink = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id && String(a.key) === String(b.key);
  function unmark(state, link, txId) {
    const o = findOb(state, link.kind, link.id);
    if (o && o.paid && o.paid[link.key] && o.paid[link.key].txId === txId) delete o.paid[link.key];
  }
  // پیوند به قسط/قبض/درآمد ثابت: اگه قبلاً تراکنش دیگه‌ای اون رو پرداخت کرده بود، اون تراکنش (اگه خودکار بود) حذف یا از پیوند جدا می‌شه
  function attachLink(state, link, t) {
    const o = findOb(state, link.kind, link.id); if (!o) return;
    const prev = o.paid && o.paid[link.key];
    if (prev && prev.txId && prev.txId !== t.id) {
      const pt = state.tx.find(x => x.id === prev.txId);
      if (pt) { if (pt.auto && !pt.op) state.tx = state.tx.filter(x => x !== pt); else delete pt.link; }
    }
    o.paid = o.paid || {}; o.paid[String(link.key)] = { date: t.date, txId: t.id };
    t.link = { kind: link.kind, id: link.id, key: String(link.key) };
  }
  function unsettleCredit(state, link) {
    const a = findOb(state, 'credit', link.id); if (!a) return;
    const st = (a.settles || []).find(x => x.id === String(link.key)); if (!st) return;
    state.tx.forEach(t => { if (t.cs === st.id) delete t.cs; });
    a.settles = a.settles.filter(x => x !== st);
  }

  // ---------- صرافی ↔ بانک: تراکنش «انتقال» وابسته به عملیات، برای موجودی زنده‌ی حساب بانکی ----------
  function bankFlow(o) {
    if (o.type === 'sell' && o.proceeds != null && !o.in) return { dir: 'in', amt: o.proceeds };
    if (o.type === 'buy' && o.cost != null && !o.out) return { dir: 'out', amt: o.cost };
    if (o.type === 'withdraw' && o.out) return { dir: 'in', amt: o.out.q };
    if (o.type === 'deposit' && o.in) return { dir: 'out', amt: o.in.q };
    return null;
  }
  // prev: تراکنش قبلی همین ثبت (برای نگه داشتن شناسه، پیامکِ چسبانده‌شده و زمان ثبت)
  function syncBankTx(state, o, ctx, prev) {
    const f = bankFlow(o), acc = f && o.bank ? (state.accounts || []).find(a => a.id === o.bank && a.kind !== 'credit') : null;
    let t = o.tx && state.tx.find(x => x.id === o.tx);
    if (!acc) { if (t) state.tx = state.tx.filter(x => x !== t); delete o.tx; if (!f) delete o.bank; return null; }
    if (!t && prev) { t = prev; state.tx.push(t); }
    if (!t) { t = { id: ctx.uid(), created: ctx.now(), time: '' }; state.tx.push(t); }
    const A = V.ASSETS;
    const what = o.type === 'sell' ? `فروش ${A[o.out.a].name}` : o.type === 'buy' ? `خرید ${A[o.in.a].name}` : o.type === 'withdraw' ? 'برداشت ریال' : 'واریز ریال';
    const there = o.loc === acc.id ? '' : `، ${f.dir === 'in' ? 'از' : 'به'} ${placeName(state, o.loc)}`;
    ['link', 'auto', 'debt', 'why', 'asset', 'qty', 'cs', 'noMatch'].forEach(k => delete t[k]);
    Object.assign(t, { type: 'transfer', amount: f.amt, date: t.sms ? t.date : o.date, cat: '', account: f.dir === 'out' ? acc.id : '', to: f.dir === 'in' ? acc.id : '',
      note: `${what}${there}${o.via && o.note ? '، ' + o.note : ''}`, op: o.id });
    if (!t.time) t.time = '';
    o.tx = t.id;
    return t;
  }

  // ---------- خواندن یک ثبت برای فرم ----------
  // ref: { tx: id } یا { op: id }. عملیات‌هایی که با فرم‌های دفتر دارایی ساخته شدن (بدون via) اینجا نیستن.
  function collect(state, ref) {
    if (!ref) return null;
    let tx = null, op = null, ltx = null;
    if (ref.op) {
      op = state.ops.find(o => o.id === ref.op);
      if (!op || !op.via) return null;
      ltx = op.tx ? state.tx.find(t => t.id === op.tx) || null : null;
    } else if (ref.tx) {
      const t = state.tx.find(x => x.id === ref.tx); if (!t) return null;
      if (t.op) {
        const o = state.ops.find(x => x.id === t.op);
        if (o && o.via) return collect(state, { op: o.id });
        if (o) return null; // حقوق دارایی یا «صرافی ↔ بانک» با فرم دفتر دارایی
      }
      tx = t;
    } else return null;
    const prim = op || tx;
    const mk = DEBT_NEW.includes(prim.why) && prim.debt ? state.debts.find(d => d.id === prim.debt) || null : null;
    // بخشی از اون مورد که همین ثبت ساختتش
    const mp = mk ? (Array.isArray(mk.parts) && mk.parts.length ? mk.parts.find(p => refId(p.src) === prim.id) : null) || null : null;
    const ml = prim.loanRecv ? (state.loans || []).find(l => l.id === prim.loanRecv) || null : null;
    return { tx, op, ltx, mk, mp, ml, prim };
  }
  function blank() {
    return { kind: 'out', why: 'expense', acc: '', asset: 'irr', q: 0, acc2: '', asset2: 'irr', q2: 0, value: null, date: J.today(), time: '', note: '', cat: '',
      link: null, person: '', due: null, plan: null, debt: '', pieces: null, pieces2: null, lockKind: false, loan: null, loanId: '',
      ret: 'unit', joinDebt: '', recKey: '', inDebt: '' };
  }
  function read(state, ref) {
    const c = collect(state, ref); if (!c) return null;
    const E = blank();
    if (c.op) {
      const o = c.op, t = c.ltx;
      Object.assign(E, { date: o.date, note: o.note || '', time: t ? t.time || '' : '' });
      if (t && !bankFlow(o)) { E.cat = t.cat || ''; E.link = t.link || null; }
      if (o.type === 'send' || o.type === 'recv') {
        const side = o.type === 'send' ? o.out : o.in;
        Object.assign(E, { kind: o.type === 'send' ? 'out' : 'in', why: o.why || (o.type === 'send' ? 'expense' : 'income'), acc: o.loc, asset: side.a, q: side.q,
          pieces: side.pieces || null, value: o.type === 'send' ? (o.value ?? null) : (o.cost ?? null) });
      } else if (o.type === 'deposit') Object.assign(E, { kind: 'move', acc: o.bank || '', acc2: o.loc, asset: 'irr', q: o.in.q });
      else if (o.type === 'withdraw') Object.assign(E, { kind: 'move', acc: o.loc, acc2: o.bank || '', asset: 'irr', q: o.out.q });
      else if (o.type === 'transfer') Object.assign(E, { kind: 'move', acc: o.loc, acc2: o.loc2, asset: o.out.a, q: o.out.q, pieces: o.out.pieces || null });
      else { // خرید، فروش، تبدیل
        E.kind = 'conv';
        if (o.out) Object.assign(E, { acc: o.loc, asset: o.out.a, q: o.out.q, pieces: o.out.pieces || null });
        else Object.assign(E, { acc: o.bank || '', asset: 'irr', q: o.cost });
        if (o.in) Object.assign(E, { acc2: o.loc2 || o.loc, asset2: o.in.a, q2: o.in.q, pieces2: o.in.pieces || null });
        else Object.assign(E, { acc2: o.bank || '', asset2: 'irr', q2: o.proceeds });
        E.value = o.value ?? null;
      }
      if (o.debt) E.debt = o.debt;
    } else {
      const t = c.tx, asset = t.asset && V.ASSETS[t.asset] ? t.asset : 'irr';
      Object.assign(E, { date: t.date, time: t.time || '', note: t.note || '', cat: t.cat || '', link: t.link || null, asset });
      E.q = asset === 'irr' ? t.amount : (t.qty || 0);
      E.value = asset === 'irr' ? t.amount : (t.amount || null);
      if (t.type === 'expense') Object.assign(E, { kind: 'out', why: t.why === 'gift' ? 'gift' : 'expense', acc: t.account || '' });
      else if (t.type === 'income') Object.assign(E, { kind: 'in', why: t.why === 'gift' ? 'gift' : 'income', acc: t.account || '' });
      else {
        const hasTo = 'to' in t, d = t.debt && state.debts.find(x => x.id === t.debt);
        let why = WHY.out.includes(t.why) || WHY.in.includes(t.why) ? t.why : t.loanRecv ? 'loan' : null;
        if (!why && t.debt && d) why = d.dir === 'owed' ? 'collect' : 'repay';
        if (why && WHY.out.includes(why) && why !== 'gift') Object.assign(E, { kind: 'out', why, acc: t.account || '' });
        else if (why && why !== 'gift') Object.assign(E, { kind: 'in', why, acc: hasTo ? (t.to || '') : (t.account || '') });
        else Object.assign(E, { kind: 'move', acc: t.account || '', acc2: hasTo ? (t.to || '') : '', lockKind: !!(t.link && t.link.kind === 'credit') });
        E.cat = '';
        if (!E.lockKind) E.link = null;
        if (t.debt) E.debt = t.debt;
      }
    }
    if (E.kind === 'move') { E.asset2 = E.asset; E.q2 = E.q; E.pieces2 = E.pieces; }
    if (c.mk) {
      E.person = c.mk.person || ''; E.due = c.mk.due || null; E.plan = c.mk.plan ? { ...c.mk.plan } : null; E.debt = ''; E.ret = retOf(c.mk);
      if ((c.mk.parts || []).length > 1) E.inDebt = c.mk.id; // یکی از چند بخشِ یک مورد: اسم و دارایی و نوع برگشت از خود مورد
      if (c.mp && typeof c.mp.r === 'number' && E.asset !== 'irr') E.value = c.mp.r;
    }
    if (c.ml) {
      const l = c.ml; Object.assign(E, { kind: 'in', why: 'loan', loanId: l.id });
      E.loan = { name: l.name, lender: l.lender || '', unit: l.unit || 'irr', amount: l.amount, count: l.count, first: l.first, cat: l.cat || '' };
    }
    E.ref = c.op ? { op: c.op.id } : { tx: c.tx.id };
    return E;
  }

  // ---------- ذخیره ----------
  const safeQ = q => Number.isSafeInteger(q) && q > 0;
  function check(state, E) {
    if (!KINDS.includes(E.kind)) return 'نوع ثبت معتبر نیست.';
    if ((E.kind === 'out' || E.kind === 'in') && !WHY[E.kind].includes(E.why)) return 'بابت چی بودنش رو انتخاب کن.';
    if (!V.ASSETS[E.asset]) return 'دارایی رو انتخاب کن.';
    if (!DATE_RE.test(E.date || '')) return 'تاریخ معتبر نیست.';
    if (!safeQ(E.q)) return E.asset === 'irr' ? 'مبلغ رو وارد کن.' : 'مقدار رو وارد کن.';
    const P = place(state, E.acc);
    if (!P) return 'حساب انتخاب‌شده پیدا نشد.';
    if (E.kind === 'move' || E.kind === 'conv') {
      if (!place(state, E.acc2)) return 'حساب مقصد پیدا نشد.';
      if (E.kind === 'conv') {
        if (!V.ASSETS[E.asset2]) return 'دارایی دریافتی رو انتخاب کن.';
        if (!safeQ(E.q2)) return E.asset2 === 'irr' ? 'مبلغ دریافتی رو وارد کن.' : 'مقدار دریافتی رو وارد کن.';
      }
    }
    if (DEBT_NEW.includes(E.why) && !String(E.person || '').trim()) return E.why === 'lend' ? 'به کی قرض دادی؟ اسمش رو بنویس.' : 'از کی قرض گرفتی؟ اسمش رو بنویس.';
    if (DEBT_NEW.includes(E.why) && E.ret === 'rial' && E.asset !== 'irr' && !(E.value > 0)) return 'معادل ریالی روز رو وارد کن؛ این قرض به معادل ریالی برمی‌گرده.';
    if (DEBT_SETTLE.includes(E.why) && !E.debt) return E.why === 'repay' ? 'کدوم بدهی رو پرداخت کردی؟ انتخابش کن.' : 'کدوم طلب رو گرفتی؟ انتخابش کن.';
    if (E.due && !DATE_RE.test(E.due)) return 'موعد معتبر نیست.';
    if (E.plan && DEBT_NEW.includes(E.why)) {
      if (!safeQ(Math.round(+E.plan.amount || 0))) return 'مبلغ هر قسط رو وارد کن.';
      if (!DATE_RE.test(E.plan.first || '')) return 'تاریخ اولین قسط معتبر نیست.';
    }
    if (E.why === 'loan') {
      const L = E.loan;
      if (!L && !E.loanId) return 'مشخصات وام رو وارد کن.';
      if (L) {
        if (!String(L.name || '').trim()) return 'اسم وام رو بنویس.';
        if (!V.ASSETS[L.unit || 'irr']) return 'واحد اقساط معتبر نیست.';
        if (!safeQ(Math.round(+L.amount || 0))) return 'مبلغ هر قسط رو وارد کن.';
        if (!(L.count >= 1 && L.count <= 600)) return 'تعداد اقساط (۱ تا ۶۰۰) لازمه.';
        if (!DATE_RE.test(L.first || '')) return 'تاریخ اولین قسط معتبر نیست.';
      }
      if (place(state, E.acc) && place(state, E.acc).kind === 'credit') return 'وام به اعتبار خرید واریز نمی‌شه.';
    }
    if (E.value !== null && E.value !== undefined && !(Number.isFinite(E.value) && E.value >= 0)) return 'معادل تومانی معتبر نیست.';
    return null;
  }
  function norm(E0) {
    const E = Object.assign(blank(), E0 || {});
    E.q = Math.round(+E.q || 0); E.q2 = Math.round(+E.q2 || 0);
    if (E.value === '' || E.value === undefined) E.value = null;
    if (E.value !== null) E.value = Math.round(+E.value);
    if (E.kind === 'move') { E.asset2 = E.asset; E.q2 = E.q; E.pieces2 = E.pieces; }
    E.note = String(E.note || '').trim().slice(0, 200); E.person = String(E.person || '').trim().slice(0, 60);
    E.cat = String(E.cat || ''); E.time = E.time || ''; E.acc = E.acc || ''; E.acc2 = E.acc2 || '';
    if (E.asset !== 'bar') E.pieces = null;
    if (E.asset2 !== 'bar') E.pieces2 = null;
    if (!DEBT_NEW.includes(E.why)) { E.plan = null; E.joinDebt = ''; E.recKey = ''; }
    E.ret = E.ret === 'rial' && E.asset !== 'irr' ? 'rial' : 'unit'; E.joinDebt = String(E.joinDebt || ''); E.recKey = String(E.recKey || '');
    if (E.joinDebt) { E.due = null; E.plan = null; }
    if (E.plan) { E.plan = { amount: Math.round(+E.plan.amount || 0), first: E.plan.first }; E.due = null; }
    if (E.why !== 'loan') { E.loan = null; E.loanId = ''; }
    if (E.loan) { const L = E.loan; E.loan = { name: String(L.name || '').trim().slice(0, 60), lender: String(L.lender || '').trim().slice(0, 40), unit: L.unit && V.ASSETS[L.unit] ? L.unit : 'irr',
      amount: Math.round(+L.amount || 0), count: Math.round(+L.count || 0), first: L.first, cat: String(L.cat || ''), paidCount: Math.max(0, Math.round(+L.paidCount || 0)) }; }
    return E;
  }
  const side = (a, q, pieces) => { const s = { a, q }; if (a === 'bar' && pieces && Object.keys(pieces).length) s.pieces = pieces; return s; };
  const errKey = e => `${e.op}|${e.loc}|${e.asset}`;

  // ساخت رکوردها روی T (کپی داده). خروجی: { ref, info } یا { err }
  function apply(T, E, old, ctx) {
    const info = {};
    const keepTx = old ? old.tx : null, keepOp = old ? old.op : null, keepLtx = old ? old.ltx : null;
    const mk = old ? old.mk : null, mp = old ? old.mp : null;
    // ۱) جدا کردن نسخه‌ی قبلی: علامت پرداخت تعهدات، تسویه‌هایی که به این ثبت اشاره دارن، و خود رکوردها
    if (old) {
      const ids = new Set([keepTx, keepOp, keepLtx].filter(Boolean).map(x => x.id));
      for (const t of [keepTx, keepLtx]) if (t && t.link && t.link.kind !== 'credit') unmark(T, t.link, t.id);
      T.debts.forEach(d => { d.settles = (d.settles || []).filter(s => !(s.txId && ids.has(s.txId)) && !(s.opId && ids.has(s.opId))); });
      T.tx = T.tx.filter(x => !ids.has(x.id)); T.ops = T.ops.filter(x => !ids.has(x.id));
    }
    const P = place(T, E.acc), P2 = E.kind === 'move' || E.kind === 'conv' ? place(T, E.acc2) : null;
    const now = ctx.now(), cash = (E.kind === 'out' || E.kind === 'in') && CASH.includes(E.why);
    if (keepTx && keepTx.link && keepTx.link.kind === 'credit' && !(E.kind === 'move' && E.asset === 'irr' && (P.kind === 'bank' || P.kind === 'none') && P2.kind === 'none'))
      return { err: 'این ثبت پرداخت صورت‌حساب اعتبار خریده؛ فقط مبلغ، تاریخ و حساب پرداختش عوض می‌شه. برای برگرداندن تسویه، از «پیش رو» تیکش رو بردار.' };
    // معادل تومانی: اگه وارد نشده، با قیمت همون روز (معادل ریالیِ بخش بدهی/طلب فقط عددیه که کاربر دیده و تأیید کرده)
    const userVal = E.value;
    if (E.asset === 'irr') E.value = E.q;
    else if (E.value === null) E.value = valueAt(T, E.asset, E.q, E.date);
    let prim = null, primKind = 'tx';
    const newTx = () => keepTx ? Object.assign({ id: keepTx.id, created: keepTx.created || now }, keepTx.sms ? { sms: true } : {}) : { id: ctx.uid(), created: now };
    const newOp = () => ({ id: keepOp ? keepOp.id : ctx.uid(), created: keepOp ? keepOp.created || now : now, via: 'tx' });

    if (E.kind === 'out' || E.kind === 'in') {
      if (P.kind === 'credit' && !(E.kind === 'out' && E.asset === 'irr' && cash)) return { err: 'با اعتبار خرید فقط خرج تومانی ثبت می‌شه.' };
      if (cash && E.asset !== 'irr' && !E.value) return { err: `برای ${V.ASSETS[E.asset].name} قیمتی ثبت نشده؛ معادل تومانی رو وارد کن.` };
      if (plainPath(P, E.asset)) {
        // تراکنش ساده
        const t = newTx();
        if (keepTx) { ['cs', 'auto', 'noMatch'].forEach(k => { if (keepTx[k] !== undefined) t[k] = keepTx[k]; }); }
        t.type = cash ? (E.kind === 'out' ? 'expense' : 'income') : 'transfer';
        t.amount = E.asset === 'irr' ? E.q : (E.value || 0);
        if (E.asset !== 'irr') { t.asset = E.asset; t.qty = E.q; }
        if (cash) t.account = E.acc;
        else if (E.kind === 'out') { t.account = E.acc; t.to = ''; } else { t.account = ''; t.to = E.acc; }
        t.cat = cash ? (E.why === 'gift' ? GIFT_CAT[E.kind] : E.cat) : '';
        if (E.why !== 'expense' && E.why !== 'income') t.why = E.why;
        Object.assign(t, { date: E.date, time: E.time || '', note: E.note });
        // خرید اعتباری تسویه‌شده فقط تا وقتی همون خرید روی همون اعتبار بمونه، تسویه‌شده می‌مونه
        if (t.cs && !(t.type === 'expense' && P.kind === 'credit' && keepTx && keepTx.type === 'expense' && keepTx.account === E.acc)) delete t.cs;
        const wantLink = E.link && ((E.why === 'expense' && E.link.kind !== 'income' && E.link.kind !== 'credit') || (E.why === 'income' && E.link.kind === 'income')) ? E.link : null;
        if (keepTx && keepTx.link && !sameLink(keepTx.link, wantLink)) delete t.auto;
        if (t.type !== 'income') delete t.noMatch;
        T.tx.push(t);
        if (wantLink) attachLink(T, wantLink, t);
        prim = t;
      } else {
        // عملیات دفتر دارایی: send / recv
        if (E.kind === 'in' && !E.value) return { err: `برای ${V.ASSETS[E.asset].name} قیمتی ثبت نشده؛ معادل تومانی رو وارد کن (بهای این دارایی از همین عدد حساب می‌شه).` };
        const o = Object.assign(newOp(), { type: E.kind === 'out' ? 'send' : 'recv', why: E.why, loc: E.acc, date: E.date, note: E.note });
        if (E.kind === 'out') { o.out = side(E.asset, E.q, E.pieces); if (E.value !== null) o.value = E.value; }
        else { o.in = side(E.asset, E.q, E.pieces); o.cost = E.value; }
        T.ops.push(o);
        if (cash) {
          const lt = keepLtx ? { id: keepLtx.id, created: keepLtx.created || now } : keepTx ? { id: keepTx.id, created: keepTx.created || now } : { id: ctx.uid(), created: now };
          Object.assign(lt, { type: E.kind === 'out' ? 'expense' : 'income', amount: E.value, date: E.date, time: E.time || '',
            cat: E.why === 'gift' ? GIFT_CAT[E.kind] : E.cat, account: '', note: E.note, op: o.id });
          if (E.why === 'gift') lt.why = 'gift';
          T.tx.push(lt); o.tx = lt.id;
          const wantLink = E.link && ((E.why === 'expense' && E.link.kind !== 'income' && E.link.kind !== 'credit') || (E.why === 'income' && E.link.kind === 'income')) ? E.link : null;
          if (wantLink) attachLink(T, wantLink, lt);
        }
        prim = o; primKind = 'op';
      }
    } else if (E.kind === 'move') {
      if (E.acc === E.acc2) return { err: 'حساب مبدأ و مقصد یکی‌ان.' };
      if (P.kind === 'credit' || P2.kind === 'credit') return { err: 'اعتبار خرید جای نگهداری پول نیست؛ تسویه‌ی صورت‌حسابش از «پیش رو» ثبت می‌شه.' };
      const r1 = plainPath(P, E.asset), r2 = plainPath(P2, E.asset);
      if (r1 && r2) {
        if (E.asset !== 'irr') return { err: 'برای جابه‌جایی طلا، ارز و… مبدأ و مقصد باید حساب یا محل نگهداری باشن. برای دادن به کسی «برداشت» و برای گرفتن «واریز» رو بزن.' };
        const t = newTx();
        Object.assign(t, { type: 'transfer', amount: E.q, date: E.date, time: E.time || '', cat: '', account: E.acc, to: E.acc2, note: E.note });
        if (keepTx && keepTx.link && keepTx.link.kind === 'credit') { // پرداخت صورت‌حساب اعتبار: پیوند و تسویه‌اش حفظ می‌شن
          t.link = keepTx.link; if (keepTx.auto) t.auto = keepTx.auto;
          const a = findOb(T, 'credit', t.link.id), st = a && (a.settles || []).find(x => x.id === String(t.link.key));
          if (st) Object.assign(st, { date: E.date, amount: E.q, bank: E.acc });
        }
        T.tx.push(t); prim = t;
      } else {
        const o = Object.assign(newOp(), { date: E.date, note: E.note });
        if (r1) {
          if (!(E.asset === 'irr' && P.kind === 'bank' && P2.kind === 'loc')) return { err: 'برای آوردن دارایی از بیرون، «واریز» رو بزن.' };
          Object.assign(o, { type: 'deposit', loc: E.acc2, in: side('irr', E.q), cost: E.q, bank: E.acc });
        } else if (r2) {
          if (!(E.asset === 'irr' && P2.kind === 'bank' && P.kind === 'loc')) return { err: 'برای فرستادن دارایی به بیرون، «برداشت» رو بزن.' };
          Object.assign(o, { type: 'withdraw', loc: E.acc, out: side('irr', E.q), bank: E.acc2 });
        } else Object.assign(o, { type: 'transfer', loc: E.acc, loc2: E.acc2, out: side(E.asset, E.q, E.pieces), in: side(E.asset, E.q, E.pieces) });
        T.ops.push(o);
        syncBankTx(T, o, ctx, keepLtx || keepTx);
        prim = o; primKind = 'op';
      }
    } else { // conv
      if (P.kind === 'none' || P2.kind === 'none') return { err: 'برای تبدیل، حساب مبدأ و مقصد رو انتخاب کن.' };
      if (P.kind === 'credit' || P2.kind === 'credit') return { err: 'با اعتبار خرید تبدیل ثبت نمی‌شه.' };
      if (E.asset === E.asset2) return { err: 'دو دارایی باید متفاوت باشن؛ برای جابه‌جایی همون دارایی «انتقال» رو بزن.' };
      const o = Object.assign(newOp(), { date: E.date, note: E.note });
      const b1 = P.kind === 'bank' && E.asset === 'irr', b2 = P2.kind === 'bank' && E.asset2 === 'irr';
      if (b1) Object.assign(o, { type: 'buy', loc: E.acc2, in: side(E.asset2, E.q2, E.pieces2), cost: E.q, bank: E.acc });
      else if (b2) Object.assign(o, { type: 'sell', loc: E.acc, out: side(E.asset, E.q, E.pieces), proceeds: E.q2, bank: E.acc2 });
      else {
        Object.assign(o, { type: E.asset2 === 'irr' ? 'sell' : E.asset === 'irr' ? 'buy' : 'swap', loc: E.acc, out: side(E.asset, E.q, E.pieces), in: side(E.asset2, E.q2, E.pieces2) });
        if (E.acc2 !== E.acc) o.loc2 = E.acc2;
      }
      if (E.value !== null && E.asset !== 'irr') o.value = E.value;
      T.ops.push(o);
      syncBankTx(T, o, ctx, keepLtx || keepTx);
      prim = o; primKind = 'op';
    }

    // ۲) بدهی و طلب
    delete prim.debt;
    const primRef = primKind === 'op' ? { op: prim.id } : { tx: prim.id };
    if (DEBT_NEW.includes(E.why)) {
      const dir = E.why === 'lend' ? 'owed' : 'owe';
      const pr = { date: E.date, q: E.q, r: E.asset === 'irr' ? null : (userVal ?? null), src: primRef };
      let d = mk && T.debts.find(x => x.id === mk.id), fresh = false;
      if (d) { // ویرایش همون قرض: همون بخش در همون مورد
        ensureParts(d);
        const own = (mp && d.parts.find(p => p.id === mp.id)) || (d.parts.length === 1 ? d.parts[0] : null);
        if (d.parts.length > 1) {
          if (d.dir !== dir || (d.asset || 'irr') !== E.asset || retOf(d) !== E.ret || d.person !== E.person)
            return { err: `این قرض یکی از بخش‌های «${d.dir === 'owe' ? 'بدهکار به' : 'طلبکار از'} ${d.person}» است؛ اسم، دارایی یا نوع برگشتش رو از خود اون مورد (تعهدات › بدهی و طلب) عوض کن.` };
        } else {
          if ((d.settles || []).length && d.asset !== E.asset) return { err: 'این قرض تسویه‌ی ثبت‌شده داره؛ دارایی‌اش رو نمی‌شه عوض کرد.' };
          const wasSched = !!(d.due || d.plan);
          Object.assign(d, { dir, person: E.person, asset: E.asset, date: E.date, due: E.due || null });
          if (E.ret === 'rial') d.ret = 'rial'; else delete d.ret;
          if (E.plan) d.plan = { amount: E.plan.amount, first: E.plan.first }; else delete d.plan;
          if (d.due || d.plan) { if (!wasSched || !d.sched) d.sched = J.today(); } else delete d.sched;
        }
        if (own) Object.assign(own, pr); else d.parts.push(Object.assign({ id: ctx.uid() }, pr));
      } else if (E.joinDebt) { // اضافه به مورد باز همون شخص
        d = T.debts.find(x => x.id === E.joinDebt);
        if (!d) return { err: 'موردی که قرار بود این قرض بهش اضافه بشه پیدا نشد.' };
        if (d.dir !== dir || (d.asset || 'irr') !== E.asset || retOf(d) !== E.ret) return { err: 'این قرض با اون مورد هم‌نوع نیست (جهت، دارایی یا نوع برگشتش فرق داره).' };
        ensureParts(d);
        if (E.recKey && d.parts.some(p => p.rec === E.recKey)) return { err: 'این نوبت قبلاً ثبت شده.' };
        d.parts.push(Object.assign({ id: ctx.uid() }, pr, E.recKey ? { rec: E.recKey } : {}));
      } else {
        fresh = true;
        d = { id: ctx.uid(), settles: [], note: E.note, dir, person: E.person, asset: E.asset, date: E.date, due: E.due || null };
        if (E.ret === 'rial') d.ret = 'rial';
        if (E.plan) d.plan = { amount: E.plan.amount, first: E.plan.first };
        if (d.due || d.plan) d.sched = E.date;
        d.parts = [Object.assign({ id: ctx.uid() }, pr)];
        T.debts.push(d);
      }
      settleDebt(d, E.date);
      prim.debt = d.id;
      info.debt = { made: fresh, joined: !fresh && !mk, id: d.id, dir: d.dir, person: d.person };
    } else {
      if (mk) {
        const d = T.debts.find(x => x.id === mk.id);
        if (d) {
          ensureParts(d);
          const own = (mp && d.parts.find(p => p.id === mp.id)) || (d.parts.length === 1 ? d.parts[0] : null);
          if (d.parts.length > 1 && own) { d.parts = d.parts.filter(p => p !== own); settleDebt(d); info.keptDebt = d.id; }
          else if ((d.settles || []).length) { if (own) delete own.src; settleDebt(d); info.keptDebt = d.id; }
          else T.debts = T.debts.filter(x => x.id !== mk.id);
        }
      }
      if (DEBT_SETTLE.includes(E.why)) {
        const d = T.debts.find(x => x.id === E.debt);
        if (!d) return { err: 'بدهی یا طلبی که تسویه می‌شه پیدا نشد.' };
        if (d.dir !== (E.why === 'repay' ? 'owe' : 'owed')) return { err: E.why === 'repay' ? 'این مورد طلبه، نه بدهی.' : 'این مورد بدهیه، نه طلب.' };
        const left = debtLeft(d);
        if (left <= 0) return { err: 'این مورد قبلاً کامل تسویه شده.' };
        const amt = settleQty(T, d, E); if (amt.err) return amt;
        let rec;
        if (amt.r !== undefined) { // طرف ریالیِ مورد «معادل ریالی»
          const rl = C.debtReplay(d).leftR || 0;
          if (rl <= 0) return { err: 'طرف ریالی این مورد قبلاً کامل تسویه شده.' };
          rec = { amount: 0, r: Math.min(amt.r, rl), date: E.date };
        } else rec = { amount: Math.min(amt.q, left), date: E.date };
        rec[primKind === 'op' ? 'opId' : 'txId'] = prim.id;
        d.settles = d.settles || []; d.settles.push(rec);
        delete d.closed; settleDebt(d, E.date);
        prim.debt = d.id;
        const R = C.debtReplay(d);
        info.settle = rec.r !== undefined ? { id: d.id, q: rec.amount, r: rec.r, left: debtLeft(d), leftR: R.leftR, over: amt.r > rec.r }
          : { id: d.id, q: rec.amount, left: debtLeft(d), leftR: R.leftR, over: amt.q > left };
      }
    }
    if (prim.debt === undefined) delete prim.debt;
    if (old) T.debts.forEach(d => { C.debtRecalc(d); if (debtLeft(d) > 0) delete d.closed; }); // تسویه‌هایی که با نسخه‌ی قبلی این ثبت حذف شدن

    // ۳) وام
    delete prim.loanRecv;
    const ml = old && old.ml ? T.loans.find(l => l.id === old.ml.id) : null;
    if (E.why === 'loan') {
      let l = E.loanId ? T.loans.find(x => x.id === E.loanId) : ml;
      const fresh = !l;
      if (E.loanId && !l) return { err: 'وام پیدا نشد.' };
      if (E.loan) {
        const L = E.loan;
        if (!l) { l = { id: ctx.uid(), paid: {}, src: 'flow' }; T.loans.push(l); }
        const unit = L.unit === 'irr' ? undefined : L.unit;
        if (!fresh && (l.unit || undefined) !== unit && Object.keys(l.paid || {}).length) return { err: 'این وام قسط پرداخت‌شده داره؛ واحد اقساطش رو نمی‌شه عوض کرد.' };
        Object.assign(l, { name: L.name, lender: L.lender, amount: L.amount, count: L.count, first: L.first, cat: L.cat || 'وام' });
        if (unit) l.unit = unit; else delete l.unit;
        delete l.restDay; delete l.store;
        l.paid = l.paid || {};
        for (const k of Object.keys(l.paid)) if (+k >= l.count) {
          const pi = l.paid[k]; delete l.paid[k];
          const pt = pi && pi.txId && T.tx.find(x => x.id === pi.txId);
          if (pt) { if (pt.auto && !pt.op) T.tx = T.tx.filter(x => x !== pt); else delete pt.link; }
        }
        if (fresh) for (let i = 0; i < Math.min(l.count, L.paidCount || 0); i++) l.paid[i] = { date: J.addMonths(l.first, i, J.jParse(l.first).d), prior: true };
      }
      if (ml && ml !== l) dropLoanRecv(T, ml, ctx);
      // هر وام فقط یک دریافت: اگه این وام دریافت دیگه‌ای داشت، اون رکورد از وام جدا می‌شه (خود تراکنش می‌مونه)
      if (l.recv) { const oid = l.recv.txId || l.recv.opId; if (oid && oid !== prim.id) { const ox = T.tx.find(x => x.id === oid) || T.ops.find(x => x.id === oid); if (ox) delete ox.loanRecv; } }
      l.recv = { asset: E.asset, amount: E.q, account: E.acc, date: E.date }; l.recv[primKind === 'op' ? 'opId' : 'txId'] = prim.id;
      prim.loanRecv = l.id;
      info.loan = { made: fresh, id: l.id, name: l.name };
    } else if (ml) {
      const r = dropLoanRecv(T, ml, ctx); if (r) info[r] = ml.id;
    }
    return { ref: primRef, info };
  }
  // جدا کردن دریافت از وام؛ وامی که از فرم واریز ساخته شده و قسطی ازش پرداخت نشده، حذف می‌شه (مگر ctx.keepLoan)
  function dropLoanRecv(T, l, ctx) {
    delete l.recv;
    if (l.src === 'flow' && !Object.keys(l.paid || {}).length && !(ctx && ctx.keepLoan)) {
      T.loans = T.loans.filter(x => x.id !== l.id);
      T.tx.forEach(t => { if (t.link && t.link.kind === 'loan' && t.link.id === l.id) delete t.link; });
      return 'removedLoan';
    }
    return 'keptLoan';
  }
  // مقدار تسویه به واحد خودِ بدهی/طلب ({ q })، یا برای مورد «معادل ریالی» که با تومان یا دارایی دیگه پرداخت شده، مقدار ریالی ({ r }).
  // دلار و تتر جدان ولی در تسویه یک‌به‌یک‌ان. بقیه با ارزش تومانی (خودکار با قیمت روز، قابل تغییر) تبدیل می‌شن.
  const PEG = { usd: 'usd', usdt: 'usd' };
  function settleQty(T, d, E) {
    const da = d.asset || 'irr';
    if (da === E.asset) return { q: E.q };
    if (PEG[da] && PEG[da] === PEG[E.asset]) return { q: Math.max(1, Math.round(E.q * V.ASSETS[da].base / V.ASSETS[E.asset].base)), peg: true };
    const val = E.asset === 'irr' ? E.q : E.value;
    if (!val) return { err: `برای تسویه با ${V.ASSETS[E.asset].name}، معادل تومانی لازمه.` };
    if (C.isRialRet(d)) return { r: Math.round(val) };
    if (da === 'irr') return { q: Math.round(val) };
    const u = V.unitRial(da, V.priceAt(T, E.date), T.settings);
    if (!u) return { err: `قیمت ${V.ASSETS[da].name} ثبت نشده؛ برای کم کردن از این ${d.dir === 'owe' ? 'بدهی' : 'طلب'} اول قیمت رو ثبت کن.` };
    return { q: Math.max(1, Math.round(val / u)) };
  }
  function commit(state, T, before) {
    const errs = V.replay(T).errors.filter(e => !before.has(errKey(e)));
    if (errs.length) {
      const e = errs[0];
      return { err: `موجودی ${V.ASSETS[e.asset].name} در «${placeName(T, e.loc)}» کافی نیست (${V.fmtQty(e.short, e.asset)} ${unitFa(e.asset)} کم داره).`, short: e };
    }
    // فقط بخش‌هایی که ثبت‌ها عوضشون می‌کنن (تنظیمات و قیمت‌ها دست نمی‌خورن)
    for (const k of ['tx', 'ops', 'debts', 'accounts', 'loans', 'fixed', 'incomes']) if (k in T) state[k] = T[k];
    return null;
  }
  function save(state, E0, ref, ctx) {
    ctx = ctx || {}; ctx.now = ctx.now || (() => Date.now());
    if (!ctx.uid) { let n = 0; ctx.uid = () => Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 6); }
    const E = norm(E0);
    const bad = check(state, E); if (bad) return { err: bad };
    const before = new Set(V.replay(state).errors.map(errKey));
    const T = clone(state);
    const old = ref ? collect(T, ref) : null;
    if (ref && !old) return { err: 'این مورد پیدا نشد یا از این فرم ویرایش نمی‌شه.' };
    const r = apply(T, E, old, ctx);
    if (r.err) return r;
    const e = commit(state, T, before); if (e) return e;
    return r;
  }

  // ---------- حذف ----------
  function remove(state, ref, opts) {
    const before = new Set(V.replay(state).errors.map(errKey));
    const T = clone(state);
    const old = collect(T, ref); if (!old) return { err: 'این مورد پیدا نشد.' };
    const info = {};
    const ids = new Set([old.tx, old.op, old.ltx].filter(Boolean).map(x => x.id));
    for (const t of [old.tx, old.ltx]) if (t && t.link) { if (t.link.kind === 'credit') unsettleCredit(T, t.link); else unmark(T, t.link, t.id); }
    T.debts.forEach(d => {
      const n = (d.settles || []).length;
      d.settles = (d.settles || []).filter(s => !(s.txId && ids.has(s.txId)) && !(s.opId && ids.has(s.opId)));
      if (d.settles.length !== n) { C.debtRecalc(d); if (debtLeft(d) > 0) delete d.closed; }
    });
    if (old.mk) {
      const d = T.debts.find(x => x.id === old.mk.id);
      if (d) {
        ensureParts(d);
        const own = (old.mp && d.parts.find(p => p.id === old.mp.id)) || (d.parts.length === 1 ? d.parts[0] : null);
        if (d.parts.length > 1 && own) { d.parts = d.parts.filter(p => p !== own); settleDebt(d); info.keptDebt = d.id; }
        else if (d.settles.length) { if (own) delete own.src; settleDebt(d); info.keptDebt = d.id; }
        else { T.debts = T.debts.filter(x => x.id !== old.mk.id); info.removedDebt = old.mk.id; }
      }
    }
    if (old.ml) { const l = T.loans.find(x => x.id === old.ml.id); if (l) { const r = dropLoanRecv(T, l, opts); info[r] = l.id; } }
    T.tx = T.tx.filter(x => !ids.has(x.id)); T.ops = T.ops.filter(x => !ids.has(x.id));
    const e = commit(state, T, before);
    if (e) return { err: 'با حذف این مورد، موجودی بعضی ثبت‌های بعدی منفی می‌شه. اول اون‌ها رو اصلاح کن.' };
    return { ok: true, info };
  }

  // ---------- برای فهرست‌ها ----------
  // هر ردیف فهرست تراکنش‌ها از نگاه کاربر: برداشت (out)، واریز (in)، انتقال (move)، تبدیل (conv)
  function rowKind(state, item) {
    if (item.o) {
      const o = item.o;
      if (o.type === 'send' || o.type === 'gift_out') return 'out';
      if (o.type === 'recv' || o.type === 'gift_in' || o.type === 'salary' || o.type === 'open') return 'in';
      if (o.type === 'transfer' || o.type === 'deposit' || o.type === 'withdraw') return 'move';
      return 'conv';
    }
    const t = item.t;
    if (t.type === 'expense') return 'out';
    if (t.type === 'income') return 'in';
    if (t.loanRecv) return 'in';
    if (WHY.out.includes(t.why) && t.why !== 'gift') return 'out';
    if (WHY.in.includes(t.why) && t.why !== 'gift') return 'in';
    if (t.debt) { const d = (state.debts || []).find(x => x.id === t.debt); if (d) return d.dir === 'owe' ? 'out' : 'in'; }
    if (t.op) { const o = (state.ops || []).find(x => x.id === t.op); if (o && (o.type === 'buy' || o.type === 'sell' || o.type === 'swap')) return 'conv'; }
    return 'move';
  }
  // عملیات‌هایی که تراکنش وابسته ندارن هم در فهرست تراکنش‌ها نشون داده می‌شن (به‌جز موجودی اولیه)
  const feedOps = state => (state.ops || []).filter(o => !o.tx && o.type !== 'open');

  root.Flow = { KINDS, WHY, CASH, DEBT_NEW, DEBT_SETTLE, GIFT_CAT, WHY_NAME, place, placeName, places, inLedger, plainPath, held, valueAt,
    bankFlow, syncBankTx, collect, read, save, remove, rowKind, feedOps, debtLeft, blank, settleQty, dropLoanRecv, ensureParts, settleDebt, rialAuto, retOf, PEG };
})(typeof window !== 'undefined' ? window : globalThis);
