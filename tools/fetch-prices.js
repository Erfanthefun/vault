/* دستیار قیمت Vault — روی GitHub Actions اجرا می‌شه (فایل .github/workflows/prices.yml).
   صفحه‌ی عمومی کانال تلگرام (t.me/s/…) رو می‌خونه، پیام‌های قیمت رو با همون پارسر اپ (invest.js) می‌خونه،
   و برای هر روز آخرین قیمت‌ها رو در prices.json (ریشه‌ی ریپو، کنار اپ) می‌نویسه.
   فقط وقتی قیمت تازه‌ای باشه فایل عوض می‌شه، تا Commit بی‌خود ساخته نشه. */
'use strict';
const fs = require('fs');
const path = require('path');
require('../core.js'); require('../invest.js');
const J = globalThis.J, V = globalThis.V;

const CHANNEL = process.env.CHANNEL || 'Priceslesssss';
const OUT = process.env.PRICES_OUT || path.join(__dirname, '..', 'prices.json');
const KEEP_DAYS = 60;          // سابقه‌ی نگه‌داشته‌شده در فایل
const TEHRAN_MIN = 210;        // ایران از ۱۴۰۱ ساعت تابستانی نداره: همیشه UTC+۳:۳۰

// ---------- خواندن HTML صفحه‌ی کانال ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#'
  ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
const htmlText = h => decode(h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').trim();

function readChannel(html) {
  const out = [];
  const parts = String(html || '').split(/(?=<div class="tgme_widget_message_wrap)/);
  for (const part of parts) {
    const post = part.match(/data-post="[^"/]+\/(\d+)"/);
    const time = part.match(/<time[^>]*datetime="([^"]+)"/);
    const txt = part.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!post || !time || !txt) continue;
    const ms = Date.parse(time[1]); if (!isFinite(ms)) continue;
    out.push({ post: +post[1], ms, text: htmlText(txt[1]) });
  }
  return out.sort((a, b) => a.post - b.post);
}

// زمان پیام → تاریخ شمسی و ساعت تهران
function tehran(ms) {
  const t = new Date(ms + TEHRAN_MIN * 60000);
  const local = new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 12);
  return { date: J.toJ(local), time: J.pad(t.getUTCHours()) + ':' + J.pad(t.getUTCMinutes()) };
}

// ---------- ساخت فهرست روزانه ----------
// prev: محتوای قبلی prices.json (برای حفظ سابقه). خروجی: { changed, feed, log }
function buildFeed(messages, prev, todayStr) {
  const log = [];
  const byDate = new Map();
  for (const it of ((prev && Array.isArray(prev.items)) ? prev.items : [])) { const c = V.cleanFeedItem(it); if (c) byDate.set(c.date, c); }
  const lastKnown = () => { // آخرین قیمت‌های شناخته‌شده، برای تشخیص تومان/ریالِ عددهای بی‌واحد
    const acc = {}; [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).forEach(x => V.PRICE_KEYS.forEach(k => { if (x[k]) acc[k] = x[k]; }));
    return acc;
  };
  for (const m of messages) {
    const known = lastKnown();
    const r = V.parsePrices(m.text, known);
    const found = V.PRICE_KEYS.filter(k => r[k]);
    if (!found.length) continue;                               // پیام قیمت نیست (مثلاً «تست اتصال ربات»)
    const bad = found.filter(k => known[k] && (r[k] / known[k] > 3 || r[k] / known[k] < 1 / 3));
    if (bad.length) { log.push(`پیام ${m.post}: قیمت ${bad.join('، ')} بیش از ۳ برابر با قبلی فرق داشت؛ نادیده گرفته شد`); found.splice(0, found.length, ...found.filter(k => !bad.includes(k))); }
    if (!found.length) continue;
    const { date, time } = tehran(m.ms);
    const cur = byDate.get(date);
    if (cur && cur.post > m.post) continue;                    // پیام قدیمی‌تر از چیزی که داریم (پیام ویرایش‌شده با همون شماره دوباره خونده می‌شه)
    const rec = Object.assign({}, cur || {}, { date, time, post: m.post });
    for (const k of found) rec[k] = k === 'btc' ? Math.round(r[k] * 100) / 100 : r[k];
    byDate.set(date, rec);
  }
  const from = J.addDays(todayStr, -KEEP_DAYS);
  const items = [...byDate.values()].filter(x => x.date >= from && x.date <= J.addDays(todayStr, 1))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(x => { const o = { date: x.date, time: x.time, post: x.post }; V.PRICE_KEYS.forEach(k => { if (x[k]) o[k] = x[k]; }); return o; });
  const feed = { v: 1, source: 't.me/' + CHANNEL, items };
  const changed = JSON.stringify(items) !== JSON.stringify(prev && prev.items);
  return { changed, feed, log };
}

async function download(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (vault-prices)', 'Accept-Language': 'fa,en' }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.text();
      last = new Error('HTTP ' + r.status);
    } catch (e) { last = e; }
    await new Promise(res => setTimeout(res, 3000 * (i + 1)));
  }
  throw last;
}

async function main() {
  let html;
  try { html = process.env.CHANNEL_HTML ? fs.readFileSync(process.env.CHANNEL_HTML, 'utf8') : await download(`https://t.me/s/${CHANNEL}`); } // CHANNEL_HTML فقط برای تست
  catch (e) { console.log(`⚠️ کانال در دسترس نبود (${e.message}). دفعه‌ی بعد دوباره امتحان می‌شه.`); return; }
  const messages = readChannel(html);
  if (!messages.length) { console.error('❌ هیچ پیامی در صفحه‌ی کانال پیدا نشد. یا کانال عمومی نیست، یا ساختار صفحه‌ی تلگرام عوض شده.'); process.exit(1); }
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* بار اول */ }
  const { changed, feed, log } = buildFeed(messages, prev, tehran(Date.now()).date);
  log.forEach(l => console.log('⚠️ ' + l));
  if (!feed.items.length) { console.log('هیچ پیام قیمتی در کانال پیدا نشد.'); return; }
  const top = feed.items[0];
  console.log(`آخرین قیمت: ${top.date} ساعت ${top.time} — ${V.PRICE_KEYS.filter(k => top[k]).join('، ')}`);
  if (!changed) { console.log('قیمت تازه‌ای نبود.'); return; }
  fs.writeFileSync(OUT, JSON.stringify(feed, null, 1) + '\n');
  console.log('prices.json به‌روز شد.');
}

module.exports = { readChannel, tehran, buildFeed, htmlText, main };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
