// تست دریافت خودکار قیمت: خواندن صفحه‌ی کانال، ساخت prices.json، و ادغامش در داده‌های اپ
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const T = require('../tools/fetch-prices.js');
const V = globalThis.V;
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL:', name); throw e; } };
const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'channel.html'), 'utf8');

t('readChannel: همه‌ی پیام‌ها با شماره، زمان و متن تمیز', () => {
  const m = T.readChannel(html);
  assert.deepStrictEqual(m.map(x => x.post), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const last = m[8].text;
  assert(last.startsWith('🟢 قیمت لحظه‌ای بازار'), 'emoji tag stripped to its text, &nbsp; decoded: ' + JSON.stringify(last.slice(0, 30)));
  assert(last.includes('\nبیت‌کوین:\n82,901 دلار\n'), '<br> becomes newline');
  assert(!/[<>]|&nbsp;|&amp;/.test(last), 'no tags or entities left');
  assert.strictEqual(T.readChannel('').length, 0); assert.strictEqual(T.readChannel('<html>no messages</html>').length, 0);
  assert.strictEqual(T.htmlText('a &amp; b&#1587;&#x645;<br/>c'), 'a & bسم\nc');
});
t('tehran: ساعت و تاریخ شمسی تهران (UTC+۳:۳۰)، حتی از نیمه‌شب رد بشه', () => {
  assert.deepStrictEqual(T.tehran(Date.parse('2026-09-29T02:57:30Z')), { date: '1405/07/07', time: '06:27' });
  assert.deepStrictEqual(T.tehran(Date.parse('2026-09-28T20:57:30Z')), { date: '1405/07/07', time: '00:27' }, 'past midnight in Tehran');
  assert.deepStrictEqual(T.tehran(Date.parse('2026-09-28T20:29:00Z')), { date: '1405/07/06', time: '23:59' });
  assert.deepStrictEqual(T.tehran(Date.parse('2026-03-20T20:30:00Z')), { date: '1405/01/01', time: '00:00' }, 'Nowruz boundary');
});
const msgs = T.readChannel(html);
const first = T.buildFeed(msgs, null, '1405/07/07');
t('buildFeed: هر روز آخرین قیمت‌ها؛ پیام «تست اتصال» نادیده؛ مبالغ به ریال، بیت‌کوین به دلار', () => {
  assert.strictEqual(first.changed, true); assert.deepStrictEqual(first.log, []);
  assert.deepStrictEqual(first.feed.items, [
    { date: '1405/07/07', time: '06:27', post: 9, gold: 244012000, silver: 5140100, usd: 2448000, eur: 2783800, usdt: 2480500, btc: 82901 },
    { date: '1405/07/06', time: '18:27', post: 7, gold: 244245000, silver: 5123600, usd: 2431750, eur: 2763800, usdt: 2443900, btc: 82792.66 }]);
  assert.strictEqual(first.feed.source, 't.me/Priceslesssss');
});
t('buildFeed: اجرای دوباره بدون پیام تازه → بدون تغییر (Commit بی‌خود ساخته نمی‌شه)', () => {
  const again = T.buildFeed(msgs, JSON.parse(JSON.stringify(first.feed)), '1405/07/07');
  assert.strictEqual(again.changed, false);
});
t('buildFeed: پیام تازه‌تر همون روز جایگزین می‌شه و قیمت‌های نیومده از پیام قبلی همون روز می‌مونن', () => {
  const extra = msgs.concat([{ post: 10, ms: Date.parse('2026-09-29T06:00:00Z'), text: 'قیمت لحظه‌ای بازار\n\nهر گرم طلای ۱۸ عیار: 24,500,000 تومان\nتتر: 249,000 تومان' }]);
  const r = T.buildFeed(extra, first.feed, '1405/07/07');
  assert.strictEqual(r.changed, true);
  assert.deepStrictEqual(r.feed.items[0], { date: '1405/07/07', time: '09:30', post: 10, gold: 245000000, silver: 5140100, usd: 2448000, eur: 2783800, usdt: 2490000, btc: 82901 });
  assert.strictEqual(r.feed.items.length, 2);
});
t('buildFeed: سابقه از فایل قبلی حفظ می‌شه وقتی پیام‌ها از صفحه‌ی کانال بیرون رفتن؛ قدیمی‌تر از ۶۰ روز حذف', () => {
  const prev = { items: first.feed.items.concat([{ date: '1405/06/20', time: '10:00', post: 1, gold: 240000000 }, { date: '1405/04/01', time: '10:00', post: 1, gold: 200000000 }]) };
  const r = T.buildFeed([], prev, '1405/07/07');
  assert.deepStrictEqual(r.feed.items.map(x => x.date), ['1405/07/07', '1405/07/06', '1405/06/20']);
});
t('buildFeed: قیمتی که بیش از ۳ برابر با قبلی فرق داره (مثلاً ریال به‌جای تومان) رد و گزارش می‌شه', () => {
  const bad = msgs.concat([{ post: 11, ms: Date.parse('2026-09-29T07:00:00Z'), text: 'هر گرم طلای ۱۸ عیار: 2,440,120,000 ریال\nتتر: 250,000 تومان' }]);
  const r = T.buildFeed(bad, null, '1405/07/07');
  assert.strictEqual(r.feed.items[0].gold, 244012000, 'bad gold ignored'); assert.strictEqual(r.feed.items[0].usdt, 2500000, 'good usdt kept');
  assert(r.log.length === 1 && r.log[0].includes('gold'));
});

// ---------- ادغام در اپ ----------
const feed = first.feed;
const st = (prices, ap) => ({ settings: { autoPrice: Object.assign({ on: true, skip: [] }, ap || {}) }, prices: prices || [] });
t('merge: روی داده‌ی خالی هر دو روز اضافه می‌شن با نشان خودکار، ساعت و شماره‌ی پیام', () => {
  const s = st(); const r = V.mergeAutoPrices(s, feed, '1405/07/07');
  assert.deepStrictEqual([r.added, r.updated, r.rejected], [2, 0, 0]);
  const today = s.prices.find(p => p.date === '1405/07/07');
  assert.deepStrictEqual(today, { date: '1405/07/07', auto: true, time: '06:27', post: 9, gold: 244012000, silver: 5140100, usd: 2448000, eur: 2783800, usdt: 2480500, btc: 82901 });
  assert.strictEqual(r.latest.date, '1405/07/07');
  const again = V.mergeAutoPrices(s, feed, '1405/07/07');
  assert.deepStrictEqual([again.added, again.updated], [0, 0], 'idempotent');
});
t('merge: ثبت دستی همون روز هیچ‌وقت عوض نمی‌شه', () => {
  const manual = { date: '1405/07/07', gold: 250000000, usdt: 2500000 };
  const s = st([manual]); const r = V.mergeAutoPrices(s, feed, '1405/07/07');
  assert.strictEqual(r.added, 1, 'only yesterday'); assert.deepStrictEqual(s.prices.find(p => p.date === '1405/07/07'), manual);
});
t('merge: پیام تازه‌تر ثبت خودکار همون روز رو به‌روز می‌کنه؛ قدیمی‌تر نه', () => {
  const s = st([{ date: '1405/07/07', auto: true, time: '00:27', post: 8, gold: 244012000 }]);
  let r = V.mergeAutoPrices(s, { items: [feed.items[0]] }, '1405/07/07');
  assert.strictEqual(r.updated, 1); assert.strictEqual(s.prices[0].post, 9);
  r = V.mergeAutoPrices(s, { items: [{ date: '1405/07/07', time: '00:27', post: 8, gold: 1 }] }, '1405/07/07');
  assert.strictEqual(r.updated, 0); assert.strictEqual(s.prices[0].gold, 244012000);
});
t('merge: روزی که کاربر حذفش کرده دوباره اضافه نمی‌شه؛ فقط ۱۴ روز اخیر؛ تاریخ آینده نه', () => {
  const s = st([], { skip: ['1405/07/06'] }); V.mergeAutoPrices(s, feed, '1405/07/07');
  assert.deepStrictEqual(s.prices.map(p => p.date), ['1405/07/07']);
  const old = st(); V.mergeAutoPrices(old, feed, '1405/07/21');
  assert.deepStrictEqual(old.prices.map(p => p.date), ['1405/07/07'], 'window is 14 days: 07/07 in, 07/06 out on 07/21');
  const fut = st(); V.mergeAutoPrices(fut, feed, '1405/07/06');
  assert.deepStrictEqual(fut.prices.map(p => p.date), ['1405/07/06'], 'item dated after the phone\'s today is ignored');
});
t('merge: قیمت‌های نیومده از ثبت قبلی ارث می‌رسن و ثبت‌های بعدی کلیدهای خالی رو می‌گیرن', () => {
  const s = st([{ date: '1405/07/01', gold: 240000000, usd: 2400000 }, { date: '1405/07/09', gold: 250000000 }]);
  V.mergeAutoPrices(s, { items: [{ date: '1405/07/05', time: '10:00', post: 3, usdt: 2450000 }] }, '1405/07/09');
  const mid = s.prices.find(p => p.date === '1405/07/05');
  assert.deepStrictEqual([mid.gold, mid.usd, mid.usdt], [240000000, 2400000, 2450000]);
  const later = s.prices.find(p => p.date === '1405/07/09');
  assert.deepStrictEqual([later.gold, later.usdt, later.usd], [250000000, 2450000, 2400000]);
});
t('merge: جهش بیش از ۳ برابر رد می‌شه؛ ورودی خراب کرش نمی‌کنه', () => {
  const s = st([{ date: '1405/07/01', gold: 240000000 }]);
  const r = V.mergeAutoPrices(s, { items: [{ date: '1405/07/05', post: 2, gold: 2400000000 }] }, '1405/07/07');
  assert.deepStrictEqual([r.added, r.rejected], [0, 1]); assert.strictEqual(s.prices.length, 1);
  for (const junk of [null, {}, { items: 'x' }, { items: [null, 5, 'a', { date: '1405/13/01', gold: 1 }, { date: '1405/07/05', gold: -3, usd: 'NaN', btc: Infinity }, { date: '<b>', gold: 1 }] }]) {
    const s2 = st(); const r2 = V.mergeAutoPrices(s2, junk, '1405/07/07');
    assert.deepStrictEqual([r2.added, s2.prices.length], [0, 0], JSON.stringify(junk));
  }
  const s3 = st(); V.mergeAutoPrices(s3, { items: [{ date: '1405/07/05', time: '<script>', post: 'x', gold: 240000000, evil: '<img>' }] }, '1405/07/07');
  assert.deepStrictEqual(s3.prices[0], { date: '1405/07/05', auto: true, gold: 240000000 }, 'only whitelisted, validated fields are stored');
});
t('پیام ویرایش‌شده (همون شماره، عدد جدید) هم در فایل و هم در اپ به‌روز می‌شه', () => {
  const edited = msgs.map(m => m.post === 9 ? Object.assign({}, m, { text: m.text.replace('82,901 دلار', '83,000 دلار') }) : m);
  const r = T.buildFeed(edited, first.feed, '1405/07/07');
  assert.strictEqual(r.changed, true); assert.strictEqual(r.feed.items[0].btc, 83000);
  const s = st(); V.mergeAutoPrices(s, first.feed, '1405/07/07');
  const u = V.mergeAutoPrices(s, r.feed, '1405/07/07');
  assert.deepStrictEqual([u.added, u.updated], [0, 1]); assert.strictEqual(s.prices.find(p => p.date === '1405/07/07').btc, 83000);
});

// ---------- اجرای کامل اسکریپت (همون چیزی که GitHub اجرا می‌کنه) ----------
(async () => {
  const os = require('os'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-')), out = path.join(tmp, 'prices.json');
  const run = async (env, fetchImpl) => {
    const saved = { ...process.env }, f = globalThis.fetch, ex = process.exit, log = console.log, err = console.error;
    let code = null; const lines = [];
    Object.assign(process.env, { PRICES_OUT: out }, env); if (!env.CHANNEL_HTML) delete process.env.CHANNEL_HTML;
    globalThis.fetch = fetchImpl || f; process.exit = c => { code = c; throw new Error('exit'); };
    console.log = console.error = (...a) => lines.push(a.join(' '));
    delete require.cache[require.resolve('../tools/fetch-prices.js')];
    try { await require('../tools/fetch-prices.js').main(); } catch (e) { if (e.message !== 'exit') throw e; }
    finally { process.env = saved; globalThis.fetch = f; process.exit = ex; console.log = log; console.error = err; }
    return { code, lines };
  };
  const nowReal = Date.now; Date.now = () => Date.parse('2026-09-29T07:00:00Z'); // «امروز» ثابت، تا تست فردا هم پاس بشه
  const setTimeoutReal = global.setTimeout; global.setTimeout = (fn) => setTimeoutReal(fn, 0); // بدون انتظار در تلاش‌های دوباره
  let r = await run({}, async () => { throw new Error('offline'); });
  assert.strictEqual(r.code, null, 'network failure is not a failed run'); assert(!fs.existsSync(out)); assert(r.lines.join().includes('در دسترس نبود'));
  r = await run({}, async () => ({ ok: false, status: 502 }));
  assert.strictEqual(r.code, null); assert(!fs.existsSync(out));
  r = await run({}, async () => ({ ok: true, status: 200, text: async () => html }));
  assert.strictEqual(r.code, null); const written = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.strictEqual(written.items.length >= 1, true); assert(r.lines.join().includes('به‌روز شد'));
  const mtime = fs.statSync(out).mtimeMs;
  r = await run({ CHANNEL_HTML: path.join(__dirname, 'fixtures', 'channel.html') });
  assert(r.lines.join().includes('تازه‌ای نبود')); assert.strictEqual(fs.statSync(out).mtimeMs, mtime, 'file untouched when nothing new');
  r = await run({}, async () => ({ ok: true, status: 200, text: async () => '<html>login</html>' }));
  assert.strictEqual(r.code, 1, 'page without messages fails the run (so GitHub shows a red mark)');
  global.setTimeout = setTimeoutReal; Date.now = nowReal; n++;
  console.log(`feed: ${n} test groups passed`);
})().catch(e => { console.error('FAIL: main()', e); process.exit(1); });
