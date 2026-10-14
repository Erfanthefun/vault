"""تست end-to-end نسخه‌ی ۱۵ (مرحله‌ی ۱): اسم «تعهدات» و بدهی و طلب به تفکیک اشخاص با نمودار"""
import sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, info)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    wait = lambda ms=350: pg.wait_for_timeout(ms)
    def closed(): pg.wait_for_function('!document.querySelector(".overlay")'); wait(150)
    def debts(): pg.click('[data-tab=ob]'); wait(100); pg.click('[data-act=obt][data-t=debt]'); wait(250)
    def owe_sec(): return pg.evaluate("""(() => { const h = [...document.querySelectorAll('#view h2.dsec')]; const out = {};
      h.forEach(x => { let n = x.nextElementSibling, cards = [], chart = 0; while (n && !n.matches('h2.dsec, details, .btnrow')) {
        if (n.matches('.chart')) chart = n.querySelectorAll('.catbars li').length; if (n.matches('ul.cards')) cards = [...n.querySelectorAll('.card strong')].map(s => s.innerText); n = n.nextElementSibling; }
        out[x.innerText.trim()] = { cards, chart }; }); return out; })()""")

    pg.goto(BASE); wait(500)
    # ۱) اسم صفحه
    check('nav: tab label «تعهدات»', 'تعهدات' in pg.inner_text('[data-tab=ob]') and 'برنامه' not in pg.inner_text('[data-tab=ob]'))
    pg.click('[data-tab=ob]'); wait(200)
    check('page: title «تعهدات»', pg.inner_text('#view h1').strip() == 'تعهدات', pg.inner_text('#view h1'))
    pg.click('[data-act=addhub]'); wait(450)
    grps = [x.inner_text() for x in pg.query_selector_all('.sheet .grp')]
    check('hub: group renamed', 'تعهدات' in grps and 'برنامه' not in grps, grps)
    check('hub: «دیدن همه‌ی تعهدات» tile', 'دیدن همه‌ی تعهدات' in pg.inner_text('.sheet'))
    pg.click('.overlay [data-close]'); closed()
    pg.click('[data-tab=home]'); wait(200)
    check('home: empty state points to «تعهدات»', 'برنامه' not in pg.inner_text('#view'), pg.inner_text('#view')[:300])

    # ۲) داده: علی (۲۰۰ میلیون + ۵۰ دلار)، مامان (۵۰۰ میلیون)، رضا (طلب ۱۰۰ میلیون)، اسم با فاصله و «ي» عربی
    pg.evaluate("""(()=>{const s=window.__vault.state; s.prices.push({date:J.today(),gold:244012000,silver:5140100,usd:2448000,eur:2783800,usdt:2480500});
      const T=J.today(), mk=(id,dir,person,asset,amount,extra)=>Object.assign({id,dir,person,asset,amount,date:T,due:null,note:'',settles:[]},extra||{});
      s.debts.push(mk('a1','owe','علی','irr',2000000000), mk('a2','owe','علي ','usd',5000), mk('m1','owe','مامان','irr',5000000000),
        mk('r1','owed','رضا','irr',1000000000), mk('x1','owe','کامران','irr',300000000,{settles:[{amount:300000000,date:T}],closed:T}));
      window.App.save(); window.App.render();})()""")
    debts()
    sec = owe_sec()
    check('list: two sections «بدهکارم به…» and «طلبکارم از…»', list(sec.keys()) == ['بدهکارم به…', 'طلبکارم از…'], sec)
    check('list: owe section = one card per person, biggest first', sec.get('بدهکارم به…', {}).get('cards') == ['مامان', 'علی'], sec)
    check('list: owed section = رضا', sec.get('طلبکارم از…', {}).get('cards') == ['رضا'], sec)
    check('chart: owe section has bars for 2 people', sec.get('بدهکارم به…', {}).get('chart') == 2, sec)
    check('chart: single person → no chart', sec.get('طلبکارم از…', {}).get('chart') == 0, sec)
    ali = pg.inner_text('.card[data-act=debtp]:has-text("علی")')
    # ۵۰ دلار × ۲٬۴۴۸٬۰۰۰ ریال = ۱۲۲٬۴۰۰٬۰۰۰ ریال → جمع ۲٬۱۲۲٬۴۰۰٬۰۰۰ ریال = ۲۱۲٬۲۴۰٬۰۰۰ تومان
    check('card: one toman total for all units', '۲۱۲٬۲۴۰٬۰۰۰' in ali, ali)
    check('card: unit breakdown under total (toman first)', '۵۰ دلار' in ali and '+' in ali and ali.index('۲۰۰٬۰۰۰٬۰۰۰') < ali.index('۵۰ دلار'), ali)
    check('card: «۲ مورد»', '۲ مورد' in ali, ali)
    mom = pg.inner_text('.card[data-act=debtp]:has-text("مامان")')
    check('card: toman-only person has no breakdown line', '+' not in mom and mom.count('۵۰۰٬۰۰۰٬۰۰۰') == 1, mom)
    chart = pg.inner_text('#view .chart')
    check('chart: shares sum to 100٪ (مامان ≈ ۷۰٪)', '۷۰٪' in chart and '۳۰٪' in chart, chart)
    check('settled: still in the «تسویه‌شده‌ها» fold', 'تسویه‌شده‌ها (۱)' in pg.inner_text('#view'))

    # ۳) برگه‌ی یک نفر
    pg.click('.card[data-act=debtp]:has-text("علی")'); wait(450)
    check('person sheet: title', pg.inner_text('.sheet-head h2') == 'بدهکار به علی', pg.inner_text('.sheet-head h2'))
    body = pg.inner_text('.sheet-body')
    check('person sheet: total + breakdown + both records', '۲۱۲٬۲۴۰٬۰۰۰' in body and 'به تفکیک واحد' in body and len(pg.query_selector_all('.sheet .card.debt')) == 2, body)
    pg.click('.sheet .card.debt:has-text("دلار")'); wait(500)
    check('person sheet → record detail (sheet closes, detail opens)', len(pg.query_selector_all('.overlay')) == 1 and pg.is_visible('#settle'), pg.inner_text('.sheet-head h2'))
    pg.click('.overlay [data-close]'); closed()
    pg.click('.card[data-act=debtp]:has-text("علی")'); wait(450)
    pg.click('.sheet [data-act=newdebt]'); wait(500)
    check('person sheet → new debt form prefilled with the person, direction owe', pg.input_value('#dperson') == 'علی' and 'on' in pg.get_attribute('#ddir [data-d=owe]', 'class'))
    pg.fill('.sheet [name=damount]', '10000000'); pg.click('#dsave'); closed()
    check('new record joins the same person card', len(pg.query_selector_all('.card[data-act=debtp]:has-text("علی")')) == 1 and '۳ مورد' in pg.inner_text('.card[data-act=debtp]:has-text("علی")'))
    # یک‌مورده: مستقیم جزئیات
    pg.click('.card[data-act=debtp]:has-text("مامان")'); wait(500)
    check('single-record person opens the record detail directly', pg.is_visible('#settle') and pg.inner_text('.sheet-head h2') == 'بدهکار به مامان')
    pg.click('.overlay [data-close]'); closed()
    # کامران: فقط تسویه‌شده → در فهرست باز نیست
    check('fully settled person has no open card', not pg.query_selector('.card[data-act=debtp]:has-text("کامران")'))

    # ۴) جمع‌های بالا و صفحه‌ی اول دست نخورده
    tot = pg.evaluate('App.debtTotals()')
    check('totals unchanged by grouping', tot['owe'] == 2000000000 + 122400000 + 5000000000 + 100000000 and tot['owed'] == 1000000000, tot)
    for w in (320, 390):
        pg.set_viewport_size({'width': w, 'height': 800}); wait(150)
        o = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth'); check(f'{w}px: no horizontal scroll', o <= 0, o)
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.click('[data-act=obt][data-t=loan]'); wait(200)
    check('other tabs of «تعهدات» still work', 'افزودن وام' in pg.inner_text('#view'))
    check('no page errors', not errors, errors)
    b.close()

print(f'{len(passed)} passed, {len(failed)} failed')
sys.exit(1 if failed else 0)
