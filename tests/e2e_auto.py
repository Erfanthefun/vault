"""تست end-to-end دریافت خودکار قیمت (prices.json) در Vault — Playwright با پاسخ‌های ساختگی برای prices.json"""
import json, sys, openpyxl
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, info)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, accept_downloads=True)
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    mode = {'v': 'ok', 'feed': None}; hits = []
    def handler(route):
        hits.append(route.request.url)
        if mode['v'] == '404': route.fulfill(status=404, body='not found')
        elif mode['v'] == 'junk': route.fulfill(status=200, content_type='application/json', body='{<html> oops')
        elif mode['v'] == 'abort': route.abort()
        else: route.fulfill(status=200, content_type='application/json', body=json.dumps(mode['feed']))
    pg.route('**/prices.json*', handler)
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    wait = lambda ms=350: pg.wait_for_timeout(ms)
    def closed(): pg.wait_for_function('!document.querySelector(".overlay")'); wait(120)
    def goset(): pg.click('[data-tab=home]'); pg.click('[data-act=goset]'); wait(150)
    def inv(): pg.click('[data-tab=inv]'); wait(100); pg.click('[data-act=invt][data-t=sum]'); wait(150)
    def pull(): pg.click('[data-act=pullnow]'); pg.wait_for_function("document.querySelector('#toast') && document.querySelector('#toast').innerText.trim()"); wait(250)
    toast = lambda: pg.inner_text('#toast')

    pg.goto(BASE); wait(600)
    check('no automatic fetch on http (only https, like the service worker)', not hits, hits)
    check('auto price is on by default', S()['settings']['autoPrice'] == {'on': True, 'skip': [], 'last': None, 'err': None}, S()['settings']['autoPrice'])
    T = pg.evaluate('J.today()'); Y = pg.evaluate('J.addDays(J.today(), -1)')
    mode['feed'] = {'v': 1, 'source': 't.me/Priceslesssss', 'items': [
        {'date': T, 'time': '06:27', 'post': 9, 'gold': 244012000, 'silver': 5140100, 'usd': 2448000, 'eur': 2783800, 'usdt': 2480500, 'btc': 82901},
        {'date': Y, 'time': '18:27', 'post': 7, 'gold': 244245000, 'silver': 5123600, 'usd': 2431750, 'eur': 2763800, 'usdt': 2443900, 'btc': 82792.66}]}

    # ۱) دریافت الان
    goset()
    check('settings: auto price section with on/off', pg.is_visible('[data-act=autopx][data-on=true][aria-pressed=true]') and pg.is_visible('[data-act=pullnow]'))
    check('settings: status before first fetch', 'هر بار' in pg.inner_text('#autostatus'), pg.inner_text('#autostatus'))
    pull()
    st = S(); pr = {x['date']: x for x in st['prices']}
    check('pull: toast counts new prices', '۲ قیمت تازه' in toast(), toast())
    check('pull: both days stored as auto with time and post', pr.get(T, {}).get('auto') and pr[T]['time'] == '06:27' and pr[T]['post'] == 9 and pr.get(Y, {}).get('auto'), st['prices'])
    check('pull: values in rial / BTC in dollars', pr[T]['gold'] == 244012000 and pr[T]['btc'] == 82901 and pr[Y]['btc'] == 82792.66)
    check('pull: last success stamped, no error', st['settings']['autoPrice']['last'] and st['settings']['autoPrice']['err'] is None)
    check('settings status: shows latest channel price time', '۰۶:۲۷' in pg.inner_text('#autostatus'), pg.inner_text('#autostatus'))
    check('fetch bypasses caches (unique query each time)', 't=' in hits[-1], hits[-1])
    pull(); check('pull again: nothing new', 'تازه‌ای نبود' in toast() and len(S()['prices']) == 2, toast())

    # ۲) نمایش
    inv(); seal = pg.inner_text('.nw .seal')
    check('asset tab seal: time + auto badge', 'امروز' in seal and '۰۶:۲۷' in seal and 'خودکار' in seal, seal)
    pg.click('[data-tab=home]'); wait(200)
    hc = pg.inner_text('.nwc-seal') if pg.query_selector('.nwc-seal') else ''
    check('home card seal: auto badge', 'خودکار' in hc, hc)
    inv(); pg.click('.nw .seal [data-act=prices]'); wait(400)
    pg.click('.fold summary'); wait(150)
    check('prices sheet: past entries tagged auto', len(pg.query_selector_all('.sheet .ledger .autotag')) == 2)
    check('prices sheet: prefilled "previous" values from auto record', '۲۴٬۴۰۱٬۲۰۰' in pg.inner_text('.sheet') or '24,401,200' in pg.inner_text('.sheet'))

    # ۳) ویرایش دستی امروز → دیگه خودکار عوضش نمی‌کنه
    gold = pg.query_selector('.sheet [name=p_gold]'); gold.fill('25000000')
    pg.click('#psave'); closed()
    pr = {x['date']: x for x in S()['prices']}
    check('manual save turns the day into a manual record', not pr[T].get('auto') and pr[T]['gold'] == 250000000 and pr[T]['usdt'] == 2480500, pr[T])
    mode['feed']['items'][0] = dict(mode['feed']['items'][0], time='09:30', post=10, gold=245000000)
    goset(); pull()
    pr = {x['date']: x for x in S()['prices']}
    check('newer channel price never overwrites a manual record', pr[T]['gold'] == 250000000 and not pr[T].get('auto'), pr[T])

    # ۴) حذف ثبت خودکار دیروز → برنمی‌گرده
    inv(); pg.click('.nw .seal [data-act=prices]'); wait(400); pg.click('.fold summary'); wait(150)
    pg.click(f'.sheet [data-delprice="{Y}"]'); closed()
    st = S()
    check('delete auto record: remembered in skip list', Y in st['settings']['autoPrice']['skip'] and all(x['date'] != Y for x in st['prices']))
    goset(); pull()
    check('deleted day is not re-added', all(x['date'] != Y for x in S()['prices']))

    # ۵) خطاها
    mode['v'] = '404'; pull()
    check('404: friendly status (assistant not run yet), no crash', 'هنوز روی سایت اپ نیست' in pg.inner_text('#autostatus') and S()['settings']['autoPrice']['err'] == 'nofile', pg.inner_text('#autostatus'))
    mode['v'] = 'junk'; pull()
    check('broken JSON: error status, data untouched', 'ناموفق' in pg.inner_text('#autostatus') and len(S()['prices']) == 1)
    mode['v'] = 'abort'; pull()
    check('network failure: error toast', 'اینترنت' in toast(), toast())
    mode['v'] = 'ok'; pull()
    check('recovers after errors', S()['settings']['autoPrice']['err'] is None)

    # ۶) خاموش کردن
    pg.click('[data-act=autopx][data-on=false]'); wait(300)
    n = len(hits)
    check('off: button hidden, status says off', not pg.query_selector('[data-act=pullnow]') and 'خاموش' in pg.inner_text('#autostatus'))
    pg.evaluate('Inv.pullPrices({force:true})'); wait(300)
    check('off: no request even when forced', len(hits) == n)
    pg.reload(); wait(500)
    check('off: persists after reload', S()['settings']['autoPrice']['on'] is False)
    goset(); pg.click('[data-act=autopx][data-on=true]'); wait(700)
    check('turning on fetches immediately', len(hits) > n and S()['settings']['autoPrice']['on'])

    # ۷) اکسل: ستون منبع
    pg.click('[data-tab=home]'); pg.click('[data-tab=rep]'); wait()
    with pg.expect_download(timeout=60000) as d: pg.click('[data-act=excel]')
    d.value.save_as('/tmp/va.xlsx'); ws = openpyxl.load_workbook('/tmp/va.xlsx')['قیمت‌ها']
    rows = list(ws.iter_rows(values_only=True))
    check('excel prices sheet: source column', rows[0][-1] == 'منبع' and rows[-1][-1] == 'دستی', rows)

    # ۸) بکاپ قدیمی بدون تنظیمات خودکار → پیش‌فرض درست
    pg.evaluate("localStorage.setItem('vault-v1', JSON.stringify({v:2, settings:{unit:'toman', autoPrice:'bad'}, prices:[]}))"); pg.reload(); wait(500)
    check('old/corrupt setting normalized', S()['settings']['autoPrice'] == {'on': True, 'skip': [], 'last': None, 'err': None}, S()['settings']['autoPrice'])
    for w in (320, 390):
        pg.set_viewport_size({'width': w, 'height': 800}); goset()
        o = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth'); check(f'layout {w} settings', o <= 0, o)
    check('no page errors', not errors, errors)
    b.close()
print(f'\n{len(passed)} passed, {len(failed)} failed'); sys.exit(1 if failed else 0)
