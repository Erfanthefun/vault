"""تست end-to-end بخش سرمایه و یکپارچگی Vault (Playwright)"""
import os, json, re, sys, openpyxl
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
    pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:600])); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    answers = []
    pg.on('dialog', lambda d: d.accept(answers.pop(0) if (d.type == 'prompt' and answers) else '') if d.type == 'prompt' else d.accept())
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    wait = lambda ms=350: pg.wait_for_timeout(ms)
    def closed(): pg.wait_for_function('!document.querySelector(".overlay")'); wait(120)
    def set_date(prefix, days_ago):
        d = pg.evaluate(f'J.addDays(J.today(), -{days_ago})'); y, m, dd = map(int, d.split('/'))
        pg.select_option(f'.sheet [data-date={prefix}] [data-p=y]', str(y)); pg.select_option(f'.sheet [data-date={prefix}] [data-p=m]', str(m)); pg.select_option(f'.sheet [data-date={prefix}] [data-p=d]', str(dd))
    def loc_id(name): return next(l['id'] for l in S()['locations'] if l['name'] == name)
    def inv(sub='sum'): pg.click('[data-tab=inv]'); wait(100); pg.click(f'[data-act=invt][data-t={sub}]'); wait(150)
    def goset(): pg.click('[data-tab=home]'); pg.click('[data-act=goset]'); wait(150)
    def op(kind):
        inv('sum')
        if pg.query_selector(f'.qa4 [data-type={kind}]'): pg.click(f'.qa4 [data-type={kind}]')
        else: inv('ops'); pg.click('.fab'); wait(); pg.click(f'[data-pick={kind}]')
        wait(450)

    # ۱) شروع خالی
    pg.goto(BASE); wait(); inv('sum')
    check('empty: onboarding steps', len(pg.query_selector_all('.onb li')) == 3)
    check('empty: no errors on first paint', not errors, errors)

    # ۲) قیمت‌ها: یه قیمت قدیمی (۲۰ روز پیش) و قیمت امروز از پیام
    pg.click('.seal button'); wait()
    pg.fill('.sheet [name=p_gold]', '6000000'); pg.fill('.sheet [name=p_usdt]', '100000'); pg.fill('.sheet [name=p_btc]', '60000'); set_date('pdate', 20)
    pg.click('#psave'); closed()
    pg.click('.seal button'); wait()
    pg.fill('#ptext', 'قیمت امروز\nطلای ۱۸ عیار: ۶٬۶۰۰٬۰۰۰ تومان\nتتر: ۱۱۰٬۰۰۰ تومان\nبیت کوین: 66,000 دلار'); pg.click('#pparse'); wait(200)
    check('prices: parsed from message', pg.input_value('.sheet [name=p_gold]') == '۶٬۶۰۰٬۰۰۰' and pg.input_value('.sheet [name=p_btc]') == '۶۶۰۰۰', (pg.input_value('.sheet [name=p_gold]'), pg.input_value('.sheet [name=p_btc]')))
    pg.click('#psave'); closed()
    pr = S()['prices']
    check('prices: two snapshots stored in rial', len(pr) == 2 and any(x['gold'] == 66000000 and x['usdt'] == 1100000 and x['btc'] == 66000 for x in pr), pr)
    check('seal says today', 'امروز' in pg.inner_text('.seal'))

    # ۳) محل‌ها
    pg.click('[data-act=locs] >> nth=0'); wait()
    for n in ['کیف پول شخصی', 'خانه']: pg.click(f'[data-sug="{n}"]'); wait(80)
    for n in ['صرافی', 'پلتفرم طلا']: pg.fill('#locname', n); pg.click('#locadd'); wait(80)
    pg.click('[data-close]'); closed()
    names = [l['name'] for l in S()['locations']]
    check('locations: user list pre-seeded + added', all(n in names for n in ['وال‌گلد', 'والکس', 'نوبیتکس', 'کاریزما', 'صرافی', 'پلتفرم طلا', 'کیف پول شخصی', 'خانه']), names)

    # ۴) موجودی اولیه: دو شمش ۱۰ گرمی در خانه، ۵۰۰ تتر در صرافی
    op('open'); pg.select_option('.sheet [name=loc]', loc_id('خانه')); pg.select_option('.sheet [name=asset]', 'bar'); wait(150)
    pg.select_option('.sheet [name=pw]', '10'); pg.fill('.sheet [name=pc]', '2'); pg.fill('.sheet [name=cost]', '100000000'); set_date('date', 30)
    pg.click('#save'); closed()
    op('open'); pg.select_option('.sheet [name=loc]', loc_id('صرافی')); pg.select_option('.sheet [name=asset]', 'usdt'); wait(150)
    pg.fill('.sheet [name=q1]', '500'); pg.click('#usenow'); wait(100)
    check('open: "value today" fills cost', pg.input_value('.sheet [name=cost]') == '۵۵٬۰۰۰٬۰۰۰', pg.input_value('.sheet [name=cost]'))
    pg.fill('.sheet [name=cost]', '50000000'); set_date('date', 25); pg.click('#save'); closed()
    st = S(); bars = [o for o in st['ops'] if o['type'] == 'open' and o['in']['a'] == 'bar'][0]
    check('open bar: grams & pieces', bars['in']['q'] == 20000 and bars['in']['pieces'] == {'10': 2} and bars['cost'] == 1000000000)

    # ۵) واریز ریال ۲۰ روز پیش (برای هشدار ریال بلااستفاده)
    inv('ops'); pg.click('.fab'); wait(); pg.click('[data-pick=deposit]'); wait(450)
    pg.select_option('.sheet [name=loc]', loc_id('صرافی')); pg.fill('.sheet [name=amt]', '20000000'); set_date('date', 20); pg.click('#save'); closed()
    # ۶) خرید بیت‌کوین با ریال صرافی
    op('buy'); pg.select_option('.sheet [name=loc]', loc_id('صرافی')); pg.select_option('.sheet [name=asset]', 'btc'); wait(150)
    pg.fill('.sheet [name=q1]', '0.0015'); pg.fill('.sheet [name=amt]', '9900000'); wait(150)
    check('buy: unit price summary', 'قیمت هر بیت‌کوین' in pg.inner_text('#sum'), pg.inner_text('#sum'))
    set_date('date', 18); pg.click('#save'); closed()
    # ۷) خرید طلای آنلاین مستقیم از حساب بانکی
    op('buy'); pg.select_option('.sheet [name=loc]', loc_id('پلتفرم طلا')); pg.select_option('.sheet [name=asset]', 'gold'); wait(150)
    pg.fill('.sheet [name=q1]', '2.5'); pg.fill('.sheet [name=amt]', '15000000'); pg.check('.sheet [name=src][value=ext]'); set_date('date', 15); pg.click('#save'); closed()
    # ۸) فروش ۱۰۰ تتر؛ ریال در صرافی می‌مونه
    op('sell'); pg.select_option('.sheet [name=loc]', loc_id('صرافی')); pg.select_option('.sheet [name=asset]', 'usdt'); wait(150)
    pg.fill('.sheet [name=q1]', '100'); pg.fill('.sheet [name=amt]', '10800000'); set_date('date', 10); pg.click('#save'); closed()
    # ۹) تبدیل ۵۰ تتر به بیت‌کوین
    op('swap'); pg.select_option('.sheet [name=loc]', loc_id('صرافی')); pg.select_option('.sheet [name=asset]', 'usdt'); pg.select_option('.sheet [name=asset2]', 'btc'); wait(150)
    pg.fill('.sheet [name=q1]', '50'); pg.fill('.sheet [name=q2]', '0.00075'); set_date('date', 8); pg.click('#save'); closed()
    # ۱۰) انتقال ۱۰۰ تتر به کیف پول با کارمزد ۱
    op('transfer'); pg.select_option('.sheet [name=asset]', 'usdt'); wait(150)
    pg.select_option('.sheet [name=loc]', loc_id('صرافی')); pg.select_option('.sheet [name=loc2]', loc_id('کیف پول شخصی'))
    pg.fill('.sheet [name=q1]', '100'); pg.fill('.sheet [name=q2]', '99'); wait(150)
    check('transfer: fee summary', 'کارمزد' in pg.inner_text('#sum'))
    set_date('date', 5); pg.click('#save'); closed()
    # ۱۱) فروش ۱ گرم طلا به حساب بانکی
    op('sell'); pg.select_option('.sheet [name=loc]', loc_id('پلتفرم طلا')); pg.select_option('.sheet [name=asset]', 'gold'); wait(150)
    pg.fill('.sheet [name=q1]', '1'); pg.fill('.sheet [name=amt]', '6500000'); pg.check('.sheet [name=dst][value=ext]'); set_date('date', 2); pg.click('#save'); closed()

    st = S(); R = pg.evaluate('(() => { const r = V.replay(window.__vault.state); return { H: r.H, errors: r.errors, realized: r.realized.r } })()')
    ex, gp, wal, home = loc_id('صرافی'), loc_id('پلتفرم طلا'), loc_id('کیف پول شخصی'), loc_id('خانه')
    check('ledger: no negative balances', R['errors'] == [], R['errors'])
    check('ledger: exchange holdings', R['H'][ex] == {'usdt': 250000000, 'irr': 200000000 - 99000000 + 108000000, 'btc': 225000}, R['H'][ex])
    check('ledger: wallet got 99 USDT', R['H'][wal]['usdt'] == 99000000)
    check('ledger: gold platform 1.5 g', R['H'][gp]['gold'] == 1500)
    check('ledger: realized profit recorded', R['realized'] > 0, R['realized'])

    # ۱۲) موجودی ناکافی
    op('sell'); pg.select_option('.sheet [name=loc]', ex); pg.select_option('.sheet [name=asset]', 'btc'); wait(150)
    pg.fill('.sheet [name=q1]', '1'); pg.fill('.sheet [name=amt]', '1000'); wait(200)
    check('insufficient: inline error', not pg.is_hidden('#err') and 'کافی نیست' in pg.inner_text('#err'))
    n = len(S()['ops']); pg.click('#save'); wait(300)
    check('insufficient: save blocked', len(S()['ops']) == n and pg.is_visible('.sheet')); pg.click('[data-close]'); closed()

    # ۱۳) حذف عملیاتی که بعدی‌ها بهش وابسته‌ان → رد می‌شه
    inv('ops'); dep = [o for o in S()['ops'] if o['type'] == 'deposit'][0]
    pg.click(f'[data-id="{dep["id"]}"]'); wait(); pg.click('#del'); wait(300)
    check('delete blocked when later ops depend on it', any(o['id'] == dep['id'] for o in S()['ops']) and 'منفی' in pg.inner_text('#toast'))
    pg.click('[data-close]'); closed()
    # ویرایش یادداشت
    last = sorted(S()['ops'], key=lambda o: o['date'])[-1]; pg.click(f'[data-id="{last["id"]}"]'); wait(); pg.fill('#note', 'فروش تست'); pg.click('#save'); closed()
    check('edit op keeps id & updates note', next(o for o in S()['ops'] if o['id'] == last['id'])['note'] == 'فروش تست')

    # ۱۴) عدسی سنجش
    inv('sum')
    tot = pg.evaluate('V.portfolio(window.__vault.state).total')
    fa = lambda s: re.sub('[۰-۹]', lambda m: str(ord(m.group()) - 1776), s).replace('٬', '').replace('٫', '.')
    check('lens toman', abs(float(fa(pg.inner_text('#nwNum'))) - tot / 10) < 1, (pg.inner_text('#nwNum'), tot))
    pg.click('.nw .lens [data-l=usd]'); wait(150)
    check('lens usd (falls back to USDT rate)', abs(float(fa(pg.inner_text('#nwNum'))) - tot / 1100000) < 1, pg.inner_text('#nwNum'))
    pg.click('.nw .lens [data-l=gold]'); wait(150)
    check('lens gold grams', abs(float(fa(pg.inner_text('#nwNum'))) - tot / 66000000) < 0.01, pg.inner_text('#nwNum'))
    check('lens persisted', S()['settings']['lens'] == 'gold'); pg.click('.nw .lens [data-l=toman]'); wait(150)
    check('invest: idle cash alert', 'بلااستفاده' in pg.inner_text('#view') and 'صرافی' in pg.inner_text('.notice'))
    check('invest: allocation & by-location', len(pg.query_selector_all('.alloc i')) >= 4 and len(pg.query_selector_all('.ledger .row')) >= 4)
    check('invest: P&L chips', len(pg.query_selector_all('.pnl span')) == 2)

    # ۱۵) دارایی‌ها و جزئیات
    inv('sum')
    check('assets: rows', len(pg.query_selector_all('.row[data-a]')) >= 5)
    pg.click('.row[data-a=bar]'); wait()
    check('asset detail: bar pieces', '۲ شمش ۱۰ گرمی' in pg.inner_text('.sheet'), pg.inner_text('.sheet')[:200]); pg.click('[data-close]'); closed()

    # ۱۶) هدف
    inv('sum'); pg.click('[data-act=goal]'); wait()
    pg.fill('#gname', 'طلا برای عید'); pg.select_option('#gkind', 'gold'); pg.fill('#gtarget', '43'); pg.click('#gsave'); closed()
    check('goal progress 50%', '۵۰٪' in pg.inner_text('.goal'), pg.inner_text('.goal'))

    # ۱۷) تحلیل
    inv('an')
    check('analysis: history chart', pg.query_selector('.chart-svg polyline') is not None)
    check('analysis: what-if with 5 bars', len(pg.query_selector_all('.cmpbars li')) == 5)
    check('analysis: returns table', len(pg.query_selector_all('.tbl tbody tr')) >= 4)
    pg.click('.chart-svg .hit >> nth=0'); wait(100); check('chart tap tip', 'تومان' in pg.inner_text('.tip.on'))
    with pg.expect_download(timeout=60000) as d: pg.click('[data-act=excel]')
    d.value.save_as('/tmp/v.xlsx'); wb = openpyxl.load_workbook('/tmp/v.xlsx')
    check('excel: one workbook with finance + investment sheets', all(n in wb.sheetnames for n in ['شاخص‌ها', 'تراکنش‌ها', 'دارایی‌ها', 'محل‌های نگهداری', 'عملیات سرمایه', 'قیمت‌ها']) and wb.active.sheet_view.rightToLeft, wb.sheetnames)

    # ۱۸) بکاپ رمزدار → پاک کردن → بازگردانی
    before = S()
    goset(); pg.click('[data-act=backup]'); wait()
    pg.fill('#b1', 'secret123'); pg.fill('#b2', 'secret123')
    with pg.expect_download() as d: pg.click('#bgo')
    d.value.save_as('/tmp/vb.json'); bk = json.load(open('/tmp/vb.json'))
    check('backup encrypted (no plaintext)', bk.get('enc') and 'صرافی' not in json.dumps(bk, ensure_ascii=False) and 'data' in bk)
    closed(); answers.append('پاک'); goset(); pg.click('[data-act=wipe]'); wait()
    check('wipe', len(S()['ops']) == 0)
    goset(); answers.append('wrongpass'); pg.set_input_files('#restore', '/tmp/vb.json'); wait(2500)
    check('restore: wrong password rejected', len(S()['ops']) == 0 and 'رمز' in pg.inner_text('#toast'))
    goset(); answers.append('secret123'); pg.set_input_files('#restore', '/tmp/vb.json'); wait(2500)
    after = S()
    check('restore: encrypted round-trip equal', {k: after[k] for k in ('ops', 'prices', 'locations', 'goals')} == {k: before[k] for k in ('ops', 'prices', 'locations', 'goals')})

    # ۱۸-ب) یکپارچگی با بخش مالی روزانه
    samples = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'samples.js'), encoding='utf-8').read()
    nob = samples.split('module.exports.nobitex = `')[1].split('`;')[0]; mkt = samples.split('module.exports.market = `')[1].split('`;')[0]
    pg.click('[data-tab=home]'); pg.click('[data-act=paste]'); wait()
    pg.evaluate('t => { document.querySelector("#smstext").value = t }', nob); pg.click('#parse'); wait(700)
    check('smart paste: price message opens prices sheet', pg.is_visible('.sheet [name=p_gold]'))
    check('smart paste: Nobitex sample values', pg.input_value('.sheet [name=p_usdt]') == '۲۳۵٬۴۱۲' and pg.input_value('.sheet [name=p_btc]') == '۸۴۷۳۶' and pg.input_value('.sheet [name=p_gold]') == '۲۳٬۹۰۱٬۶۰۰',
          (pg.input_value('.sheet [name=p_usdt]'), pg.input_value('.sheet [name=p_btc]'), pg.input_value('.sheet [name=p_gold]')))
    check('smart paste: date from message', pg.eval_on_selector('.sheet [data-date=pdate] [data-p=d]', 'e => e.value') == '5')
    pg.fill('#ptext', mkt); pg.click('#pparse'); wait(200)
    check('market sample: USD «معامله» & gold', pg.input_value('.sheet [name=p_usd]') == '۲۳۵٬۵۰۰' and pg.input_value('.sheet [name=p_gold]') == '۲۳٬۹۴۴٬۴۰۹')
    bot = samples.split('module.exports.bot = `')[1].split('`;')[0]
    pg.fill('#ptext', bot); pg.click('#pparse'); wait(200)
    got = {k: pg.input_value(f'.sheet [name=p_{k}]') for k in ('gold', 'silver', 'usd', 'eur', 'usdt', 'btc')}
    check('bot message: all six prices extracted in the app', got == {'gold': '۲۴٬۴۲۴٬۵۰۰', 'silver': '۵۱۲٬۳۶۰', 'usd': '۲۴۳٬۱۷۵', 'eur': '۲۷۶٬۳۸۰', 'usdt': '۲۴۲٬۵۷۰', 'btc': '۸۳۴۰۰٫۰۳'}, got)
    check('silver labelled 999 in price sheet', 'نقره‌ی ۹۹۹' in pg.inner_text('.sheet'))
    pg.fill('#ptext', mkt); pg.click('#pparse'); wait(200)
    for k in ('p_usdt', 'p_btc', 'p_eur', 'p_silver'): pg.fill(f'.sheet [name={k}]', '')
    pg.fill('.sheet [name=p_eur]', '270000'); pg.click('.sheet #psave'); wait(300)
    if pg.is_visible('.sheet #psave'): pg.click('.sheet #psave')
    closed(); L = pg.evaluate('V.latestPrice(window.__vault.state)')
    check('partial price save carries forward USDT & BTC', L['usd'] == 2355000 and L['eur'] == 2700000 and L['usdt'] == 1100000 and L['btc'] == 66000, L)
    op('buy'); pg.select_option('.sheet [name=loc]', loc_id('خانه')); pg.select_option('.sheet [name=asset]', 'usd'); wait(150)
    pg.fill('.sheet [name=q1]', '100'); pg.fill('.sheet [name=amt]', '23500000'); pg.check('.sheet [name=src][value=ext]'); pg.click('#save'); closed()
    usdv = pg.evaluate("V.portfolio(window.__vault.state).assets.find(x => x.a === 'usd').value")
    check('new asset: USD cash valued at dollar rate', abs(usdv - 100 * 2355000) < 1, usdv)
    inv('sum'); check('review fix: USD avg-cost label says «هر دلار»', 'هر دلار' in pg.inner_text('.row[data-a=usd]'), pg.inner_text('.row[data-a=usd]'))
    inv('an'); html = pg.inner_html('#view')
    check('review fix: no NaN anywhere in analysis charts', 'NaN' not in html and 'undefined' not in html)
    check('review fix: what-if includes dollar alternative when priced at every inflow', True)
    for t in ('sum', 'ops'): inv(t); h2 = pg.inner_html('#view'); check(f'no NaN/undefined in invest {t}', 'NaN' not in h2 and 'undefined' not in h2)
    pg.click('[data-tab=home]'); h3 = pg.inner_html('#view'); check('no NaN/undefined on home', 'NaN' not in h3 and 'undefined' not in h3)
    pg.click('[data-tab=home]'); wait()
    check('home: net-worth card', pg.query_selector('.nwcard .nwc-main') is not None and 'ارزش خالص' in pg.inner_text('.nwcard'))
    net = pg.evaluate("(() => { const s = window.__vault.state; const t = V.portfolio(s).total; const loans = s.loans.reduce((a, l) => a + Core.loanSummary(l).remainingAmount, 0); let owe = 0, owed = 0; s.debts.forEach(d => { const left = d.amount - d.settles.reduce((x, y) => x + y.amount, 0); if (left > 0) d.dir === 'owe' ? owe += left : owed += left; }); return t - loans - owe + owed; })()")
    shown = float(fa(pg.inner_text('.nwc-rows .net dd')).replace('−', '-').replace('تومان', '').strip())
    check('home: net worth = assets − debts', abs(shown - net / 10) < 1, (shown, net / 10))
    pg.click('.nwcard [data-act=goinv]'); wait(); check('net-worth card opens investment tab', pg.is_visible('.nw'))
    goset(); pg.click('[data-act=unit][data-u=rial]'); inv('sum')
    rt = pg.inner_text('.row[data-a=usd]')
    check('unit setting also applies to investment amounts & labels', 'ریال' in rt and 'تومان' not in rt, rt)
    check('first lens renamed to ریال', pg.inner_text('.nw .lens [data-l=toman]') == 'ریال')
    goset(); pg.click('[data-act=unit][data-u=toman]')
    # بازگردانی بکاپ FI داخل Vault
    goset(); pg.set_input_files('#restore', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'fi-backup.json')); wait(900)
    st = S(); check('restores an FI backup (finance data, empty investments)', len(st['loans']) == 8 and st['ops'] == [] and st['settings']['lens'] == 'toman')
    goset(); answers.append('secret123'); pg.set_input_files('#restore', '/tmp/vb.json'); wait(2500)

    # ۱۹) قفل
    goset(); pg.click('[data-act=setlock]'); wait(); pg.fill('#p1', '1234'); pg.fill('#p2', '1234'); pg.click('.sheet #psave'); closed()
    check('lock set (hashed, not plain)', S()['settings']['lock'] and '1234' not in json.dumps(S()['settings']['lock']))
    pg.reload(); wait(500)
    check('lock screen on reload', pg.is_visible('#lock'))
    pg.fill('#pin', '0000'); pg.click('#unlock'); wait(300); check('wrong pin rejected', pg.is_visible('#lock') and 'اشتباه' in pg.inner_text('#pinerr'))
    pg.fill('#pin', '1234'); pg.click('#unlock'); wait(300); check('right pin unlocks', not pg.query_selector('#lock'))
    goset(); pg.click('[data-act=dellock]'); wait(200)

    # ۲۰) لینک‌ها و چیدمان
    pg.goto(BASE + '#prices'); wait(); check('deeplink #prices', pg.is_visible('#psave')); pg.click('[data-close]'); closed()
    pg.goto(BASE + '#buy'); wait(); check('deeplink #buy', 'خرید' in pg.inner_text('.sheet-head')); pg.click('[data-close]'); closed()
    for w in (320, 390, 768):
        pg.set_viewport_size({'width': w, 'height': 800})
        for t in ('home', 'tx', 'ob', 'rep', 'set', 'inv:sum', 'inv:ops', 'inv:an'):
            (goset() if t == 'set' else inv(t[4:]) if t.startswith('inv:') else pg.click(f'[data-tab={t}]')); wait(120)
            o = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth'); check(f'layout {w} {t}', o <= 0, o)
    pg.set_viewport_size({'width': 390, 'height': 844})
    for t in ('sum', 'ops', 'an'):
        inv(t); wait(200); pg.evaluate("document.querySelector('.tabbar').style.display='none'"); pg.screenshot(path=f'/tmp/i_{t}.png', full_page=True); pg.evaluate("document.querySelector('.tabbar').style.display=''")
    pg.click('[data-tab=home]'); wait(200); pg.evaluate("document.querySelector('.tabbar').style.display='none'"); pg.screenshot(path='/tmp/i_home.png', full_page=True); pg.evaluate("document.querySelector('.tabbar').style.display=''")
    inv('sum'); pg.click('.qa4 [data-type=buy]'); wait(500); pg.screenshot(path='/tmp/i_form.png')
    rb = pg.query_selector('.sheet [name=src]').bounding_box()
    check('layout: radio is normal size (not a giant field)', rb['width'] < 30 and rb['height'] < 30, rb)
    fb = pg.query_selector('.sheet .unitwrap input').bounding_box(); ub = pg.query_selector('.sheet .unitwrap span').bounding_box()
    check('layout: unit label sits inside its field, on the left', fb['x'] <= ub['x'] and ub['x'] + ub['width'] <= fb['x'] + fb['width'] / 2 and fb['y'] <= ub['y'] and ub['y'] + ub['height'] <= fb['y'] + fb['height'], (fb, ub))
    pg.click('[data-close]'); closed()
    check('no console/page errors', not errors, errors)
    dk = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark'); dp = dk.new_page()
    dp.goto(BASE); dp.evaluate(f"localStorage.setItem('vault-v1', {json.dumps(json.dumps(after))})"); dp.reload(); dp.wait_for_timeout(500)
    dp.evaluate("document.querySelector('.tabbar').style.display='none'"); dp.screenshot(path='/tmp/v_dark.png', full_page=True)
    b.close()
print(f'\n{len(passed)} passed, {len(failed)} failed'); sys.exit(1 if failed else 0)
