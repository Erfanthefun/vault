/* تقویم شمسی و قالب‌بندی اعداد (مشترک با FI؛ تست‌شده برای ۱۳۹۰ تا ۱۴۲۰) */
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

  root.J = { toJ, toG, today, ym, addMonths, addYm, addDays, diffDays, monthLen, jParse, jStr, pad, MONTHS, weekday, normDigits, faDigits, faNum };
})(typeof window !== 'undefined' ? window : globalThis);
