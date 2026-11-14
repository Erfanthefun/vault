// تقویم شمسی برای انتخاب تاریخ (Vault ۱۵٫۴). فیلد تاریخ = یک دکمه + سه select مخفی (منبع حقیقت و سازگار با کد و تست‌های قبلی).
// لمس دکمه، تقویم ماهانه رو در یک bottom sheet باز می‌کنه؛ لمس عنوان، انتخاب ماه و سال.
(function (G) {
  'use strict';
  const C = G.Core;
  const $ = (s, r = document) => r.querySelector(s);
  const fa = C.faDigits, MONTHS = C.MONTHS, WD = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  const full = js => { const { y, m, d } = C.jParse(js); return `${C.weekday(js)} ${fa(d)} ${MONTHS[m - 1]} ${fa(y)}`; };
  const ICON = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>';

  // فیلد: o.chips = دکمه‌های «امروز/دیروز» زیر فیلد؛ o.back/o.fwd = سال‌های قابل انتخاب قبل/بعد از امروز؛ o.minFrom = نام فیلد تاریخ دیگه که این تاریخ نباید زودتر از اون باشه
  function fieldHtml(name, value, o = {}) {
    const { y, m, d } = C.jParse(value || C.today()), cy = C.jParse(C.today()).y;
    const back = o.back ?? 4, fwd = o.fwd ?? 12;
    let ys = ''; for (let i = Math.min(cy - back, y); i <= Math.max(cy + fwd, y); i++) ys += `<option value="${i}" ${i === y ? 'selected' : ''}>${fa(i)}</option>`;
    const ms = MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${n}</option>`).join('');
    let ds = ''; for (let i = 1; i <= 31; i++) ds += `<option value="${i}" ${i === d ? 'selected' : ''}>${fa(i)}</option>`;
    return `<div class="datef dp" data-date="${name}"${o.minFrom ? ` data-minfrom="${o.minFrom}"` : ''}>
      <button type="button" class="datebtn" aria-haspopup="dialog"><span class="dt">${full(C.jStr(y, m, Math.min(d, C.monthLen(y, m))))}</span>${ICON}</button>
      <span class="dsel" aria-hidden="true"><select data-p="d" tabindex="-1" aria-label="روز">${ds}</select><select data-p="m" tabindex="-1" aria-label="ماه">${ms}</select><select data-p="y" tabindex="-1" aria-label="سال">${ys}</select></span>
      ${o.chips ? `<div class="chips mini"><button type="button" class="chip" data-setdate="0">امروز</button><button type="button" class="chip" data-setdate="-1">دیروز</button></div>` : ''}
    </div>`;
  }
  function read(root, name) {
    const w = $(`[data-date="${name}"]`, root);
    const y = +$('[data-p=y]', w).value, m = +$('[data-p=m]', w).value;
    return C.jStr(y, m, Math.min(+$('[data-p=d]', w).value, C.monthLen(y, m)));
  }
  function sync(w) {
    const t = $('.dt', w); if (!t) return;
    const y = +$('[data-p=y]', w).value, m = +$('[data-p=m]', w).value;
    t.textContent = full(C.jStr(y, m, Math.min(+$('[data-p=d]', w).value, C.monthLen(y, m))));
  }
  function set(root, name, js) {
    const w = $(`[data-date="${name}"]`, root); if (!w) return;
    const { y, m, d } = C.jParse(js), ysel = $('[data-p=y]', w);
    if (![...ysel.options].some(o => +o.value === y)) ysel.insertAdjacentHTML('beforeend', `<option value="${y}">${fa(y)}</option>`);
    ysel.value = y; $('[data-p=m]', w).value = m; $('[data-p=d]', w).value = d;
    sync(w);
  }

  function open(formRoot, name) {
    const w = $(`[data-date="${name}"]`, formRoot); if (!w || !G.App) return;
    const years = [...$('[data-p=y]', w).options].map(o => +o.value), minY = Math.min(...years), maxY = Math.max(...years);
    let minJ = null;
    if (w.dataset.minfrom) { const mw = $(`[data-date="${w.dataset.minfrom}"]`, formRoot); if (mw && !mw.closest('[hidden]')) minJ = read(formRoot, w.dataset.minfrom); }
    const ok = js => !(minJ && js < minJ);
    const cur = read(formRoot, name), today = C.today();
    let { y, m } = C.jParse(cur), mode = 'days', focusJ = null, calOv = null;

    const daysHtml = () => {
      const cells = C.monthGrid(y, m), sameMonth = C.jParse(cur).y === y && C.jParse(cur).m === m;
      let firstOk = null;
      const days = cells.map((d, i) => {
        if (!d) return '<span></span>';
        const js = C.jStr(y, m, d), en = ok(js); if (en && !firstOk) firstOk = js;
        return { js, d, i, en };
      });
      const tab = sameMonth && ok(cur) ? cur : firstOk;
      return `<div class="calhead">
          <button type="button" class="calnav" data-nav="-1" aria-label="ماه قبل" ${y > minY || m > 1 ? '' : 'disabled'}>›</button>
          <button type="button" class="caltitle" data-mode="ym" aria-label="انتخاب ماه و سال، اکنون ${MONTHS[m - 1]} ${fa(y)}">${MONTHS[m - 1]} ${fa(y)} <span aria-hidden="true">▾</span></button>
          <button type="button" class="calnav" data-nav="1" aria-label="ماه بعد" ${y < maxY || m < 12 ? '' : 'disabled'}>‹</button></div>
        <div class="calwd" aria-hidden="true">${WD.map((x, i) => `<span${i === 6 ? ' class="fri"' : ''}>${x}</span>`).join('')}</div>
        <div class="calgrid" role="group" aria-label="روزهای ${MONTHS[m - 1]} ${fa(y)}">${days.map(x => typeof x === 'string' ? x
          : `<button type="button" class="calday${x.js === cur ? ' sel' : ''}${x.js === today ? ' today' : ''}${x.i % 7 === 6 ? ' fri' : ''}" data-js="${x.js}" aria-label="${full(x.js)}" aria-pressed="${x.js === cur}" tabindex="${x.js === tab ? 0 : -1}" ${x.en ? '' : 'disabled'}>${fa(x.d)}</button>`).join('')}</div>
        <div class="calfoot"><button type="button" class="chip" data-quick="0" ${ok(today) ? '' : 'disabled'}>امروز</button><button type="button" class="chip" data-quick="-1" ${ok(C.addDays(today, -1)) ? '' : 'disabled'}>دیروز</button></div>`;
    };
    const ymHtml = () => `<div class="calhead">
        <button type="button" class="calnav" data-ynav="-1" aria-label="سال قبل" ${y > minY ? '' : 'disabled'}>›</button>
        <span class="caltitle static" role="status">${fa(y)}</span>
        <button type="button" class="calnav" data-ynav="1" aria-label="سال بعد" ${y < maxY ? '' : 'disabled'}>‹</button></div>
      <div class="calmonths">${MONTHS.map((n, i) => `<button type="button" class="calmon${i + 1 === m ? ' sel' : ''}" data-mon="${i + 1}" aria-pressed="${i + 1 === m}">${n}</button>`).join('')}</div>
      <div class="calfoot"><button type="button" class="chip" data-mode="days">بازگشت به روزها</button></div>`;

    const html = '<div class="cal" dir="rtl"></div>';
    G.App.openSheet('انتخاب تاریخ', html, ov => {
      calOv = ov; const box = $('.cal', ov);
      const paint = () => {
        box.innerHTML = mode === 'days' ? daysHtml() : ymHtml();
        if (focusJ) { const el = box.querySelector(`[data-js="${focusJ}"]`); if (el) el.focus(); focusJ = null; }
      };
      const pick = js => {
        if (!ok(js)) return;
        set(formRoot, name, js);
        const d = $(`[data-date="${name}"] [data-p=d]`, formRoot); if (d) d.dispatchEvent(new Event('change', { bubbles: true }));
        G.App.closeSheet(calOv);
      };
      box.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        const ds = b.dataset;
        if (ds.nav) { m += +ds.nav; if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; } paint(); }
        else if (ds.ynav) { y += +ds.ynav; paint(); }
        else if (ds.mode) { mode = ds.mode; paint(); }
        else if (ds.mon) { m = +ds.mon; mode = 'days'; paint(); }
        else if (ds.quick !== undefined) pick(C.addDays(today, +ds.quick));
        else if (ds.js) pick(ds.js);
      });
      box.addEventListener('keydown', e => { // راست‌به‌چپ: فلش راست = روز قبل
        const b = e.target.closest('.calday'); if (!b) return;
        const dl = { ArrowRight: -1, ArrowLeft: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!dl) return;
        e.preventDefault();
        const nj = C.addDays(b.dataset.js, dl), p = C.jParse(nj);
        if (p.y < minY || p.y > maxY || !ok(nj)) return;
        y = p.y; m = p.m; focusJ = nj; paint();
      });
      paint();
      const first = box.querySelector('.calday[tabindex="0"]'); if (first) setTimeout(() => first.focus({ preventScroll: true }), 320);
    });
  }

  function init() {
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('.datebtn'); if (!b) return;
      const w = b.closest('[data-date]'); if (w) open(w.closest('.overlay') || document, w.dataset.date);
    });
    document.addEventListener('change', e => { const w = e.target.closest && e.target.closest('.datef.dp'); if (w) sync(w); }); // select ها دستی/با تست عوض شدن
  }
  init();
  G.DatePick = { fieldHtml, read, set, sync };
})(typeof window !== 'undefined' ? window : globalThis);
