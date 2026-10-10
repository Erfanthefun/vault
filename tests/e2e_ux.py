"""تست end-to-end نسخه‌ی ۳: ناوبری، مرکز ثبت، درآمد ثابت، جست‌وجو، دسته‌ها، هدیه"""
import os, json, re, sys, openpyxl
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, info)
fa = lambda s: re.sub('[۰-۹]', lambda m: str(ord(m.group()) - 1776), s).replace('٬', '')
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, accept_downloads=True)
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://localhost:8767')
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400])); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    answers = []
    pg.on('dialog', lambda d: d.accept(answers.pop(0) if (d.type == 'prompt' and answers) else '') if d.type == 'prompt' else d.accept())
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    wait = lambda ms=350: pg.wait_for_timeout(ms)
    def closed(): pg.wait_for_function('!document.querySelector(".overlay")'); wait(120)
    def hub(act, extra=''): pg.click('.tabbar .addbtn'); wait(); pg.click(f'.sheet .hubtile[data-act={act}]{extra}'); wait(500)
    pg.goto(BASE); pg.wait_for_load_state('networkidle'); wait()

    # ۱) ناوبری
    tabs = pg.query_selector_all('.tabbar button')
    check('nav: 5 bottom items with center add', len(tabs) == 5 and tabs[2].get_attribute('data-act') == 'addhub' and tabs[2].get_attribute('aria-label'))
    check('nav: header has report & settings on every main tab', all((pg.click(f'[data-tab={t}]'), wait(100), pg.query_selector('.hdr-tools [data-tab=rep]') and pg.query_selector('.hdr-tools [data-act=goset]'))[-1] for t in ('home', 'tx', 'ob', 'inv')))
    pg.click('[data-tab=ob]'); wait(100); pg.click('.hdr-tools [data-tab=rep]'); wait()
    check('nav: report opens with back button', 'گزارش' in pg.inner_text('h1') and pg.query_selector('[data-act=back]') is not None)
    pg.click('[data-act=back]'); wait()
    check('nav: back returns to previous tab (برنامه)', 'برنامه' in pg.inner_text('h1'), pg.inner_text('h1'))
    pg.click('.hdr-tools [data-act=goset]'); wait(); pg.go_back(); wait()
    check('nav: browser/system back works too', 'برنامه' in pg.inner_text('h1'), pg.inner_text('h1'))

    # ۲) مرکز ثبت
    pg.click('.tabbar .addbtn'); wait()
    check('hub: three groups', [x.inner_text() for x in pg.query_selector_all('.sheet .grp')] == ['پول روزانه', 'برنامه', 'دارایی'])
    check('hub: ≥14 actions, all ≥44px tall', len(pg.query_selector_all('.hubtile')) >= 14 and all(t.bounding_box()['height'] >= 44 for t in pg.query_selector_all('.hubtile')))
    pg.click('.hubtile[data-act=add][data-type=expense]'); wait(500)
    check('hub: tile closes hub and opens the form (one sheet)', len(pg.query_selector_all('.overlay:not(.closing)')) == 1 and 'برداشت' in pg.inner_text('.sheet-head h2'))
    check('categories: icon tiles grid', len(pg.query_selector_all('#cats .cattile .cat-ic')) >= 8)
    pg.click('[data-close]'); closed()

    # ۳) درآمد ثابت (حقوق) با تاریخ مورد انتظار
    hub('newincome')
    check('income: form opens from hub', pg.is_visible('#iname'))
    day = int(pg.evaluate("J.jParse(J.today()).d")); due = min(day + 3, 29)
    pg.fill('#iname', 'حقوق شرکت'); pg.fill('.sheet [name=iamount]', '30000000'); pg.fill('#iday', str(due)); pg.click('#isave'); closed()
    st = S(); inc = st['incomes'][0]
    check('income: saved in rial with day', inc['amount'] == 300000000 and inc['day'] == due and inc['cat'] == 'حقوق')
    check('income: plan tab shows it', 'حقوق شرکت' in pg.inner_text('#view') and 'در انتظار' in pg.inner_text('#view'))
    pg.click('[data-tab=home]'); wait()
    row = pg.query_selector('.ob.inc:has-text("حقوق شرکت")')
    check('home: income in «پیش رو» with + amount', row is not None and '+' in row.inner_text())
    check('home: future salary shown as «درآمد در راه», not counted in «آمد»', 'درآمد در راه' in pg.inner_text('.hero .eq') and pg.query_selector('.hero .eq .incrow') is not None and '30000000' not in fa(pg.inner_text('.fl.in')))
    # همون حقوق اگه روزش رسیده باشه (تیک نخورده) طبق برنامه در «آمد» حساب می‌شه
    pg.evaluate("(() => { const s = window.__vault.state, i = s.incomes[0], d0 = i.day; i.day = J.jParse(J.today()).d; window.App.render(); window.__d0 = d0; })()"); wait(200)
    check('home: salary due today counted in «آمد» with note', '30000000' in fa(pg.inner_text('.fl.in')) and 'طبق برنامه' in pg.inner_text('.hero'), pg.inner_text('.hero'))
    pg.evaluate("(() => { const s = window.__vault.state; s.incomes[0].day = window.__d0; window.App.render(); })()"); wait(200)
    # رگرسیون گزارش کاربر: قسطی که «پرداخت‌شده (قبلی)» علامت خورده (بدون تراکنش) باید در «رفت» باشه
    before = pg.evaluate("Core.cashFlow(window.__vault.state, Core.ym(J.today()), J.today()).out")
    pg.evaluate("""(() => { const s = window.__vault.state, t = J.today(); s.loans.push({ id: 'pr1', name: 'قبلی‌تست', lender: '', amount: 12345670, count: 2, first: t, cat: 'قسط', paid: { 0: { date: t, prior: true } } }); window.App.save(); window.App.render(); })()"""); wait(200)
    after = pg.evaluate("Core.cashFlow(window.__vault.state, Core.ym(J.today()), J.today()).out")
    check('home: prior-marked installment of this month counts in «رفت»', after - before == 12345670 and '1234567' in fa(pg.inner_text('.fl.out')) or after - before == 12345670, (before, after))
    pg.evaluate("(() => { const s = window.__vault.state; s.loans = s.loans.filter(l => l.id !== 'pr1'); window.App.save(); window.App.render(); })()"); wait(200)
    base = pg.evaluate("Core.monthStats(window.__vault.state, Core.ym(Core.today())).base")
    check('home: expected salary counts as income', base == 300000000, base)
    pg.click('.ob.inc:has-text("حقوق شرکت") .tick'); wait(600)
    st = S(); t = [x for x in st['tx'] if x.get('link', {}).get('kind') == 'income']
    check('income: one-tap receive creates linked income tx', len(t) == 1 and t[0]['type'] == 'income' and t[0]['amount'] == 300000000)
    check('income: toast offers undo', pg.is_visible('#toast button'))
    pg.click('#toast button'); wait(400)
    check('income: undo removes tx & mark', not any(x.get('link', {}).get('kind') == 'income' for x in S()['tx']) and not S()['incomes'][0]['paid'])
    # دریافت از فرم تراکنش با اتصال
    hub('add', '[data-type=income]')
    check('tx form: income link select shown', pg.is_visible('#inclink'))
    pg.fill('.sheet [name=amount]', '28000000'); opt = pg.eval_on_selector('#inclink', 'e => [...e.options].find(o => o.textContent.includes("حقوق شرکت")).value')
    pg.select_option('#inclink', opt); pg.click('#cats .chip >> nth=0'); pg.click('#savetx'); closed()
    m = pg.evaluate("Core.monthStats(window.__vault.state, Core.ym(Core.today()))")
    check('income: linked receipt uses actual amount (no double count)', m['incReceived'] == 280000000 and m['incPending'] == 0 and m['base'] == 280000000, (m['incReceived'], m['incPending'], m['base']))
    # درآمد متغیر: تیک مبلغ می‌پرسه
    hub('newincome'); pg.fill('#iname', 'پروژه'); pg.check('#ivar'); pg.fill('.sheet [name=iamount]', '5000000'); pg.fill('#iday', str(due)); pg.click('#isave'); closed()
    pg.click('[data-tab=home]'); wait(); pg.click('.ob.inc:has-text("پروژه") .tick'); wait(500)
    check('variable income asks actual amount', pg.is_visible('.sheet [name=amount]') and 'مبلغ واقعی' in pg.inner_text('.sheet'))
    pg.click('[data-close]'); closed()

    # ۴) جست‌وجو و دسته‌های پرکاربرد
    for note, amt, cat in [('قهوه با علی', '85000', 'کافه'), ('ناهار', '420000', 'کافه'), ('بلیت قطار', '300000', 'سفر')]:
        hub('add', '[data-type=expense]'); pg.fill('.sheet [name=amount]', amt); pg.click(f'#cats .chip[data-cat="{cat}"]'); pg.fill('#note', note); pg.click('#savetx'); closed()
    hub('add', '[data-type=expense]')
    first = pg.get_attribute('#cats .chip >> nth=0', 'data-cat')
    check('categories: most-used first', first == 'کافه', first)
    pg.click('[data-close]'); closed()
    pg.click('[data-tab=tx]'); wait(); pg.fill('#txq', 'قهوه'); wait(250)
    check('search: by note', len(pg.query_selector_all('#txlist .txrow')) == 1 and 'قهوه' in pg.inner_text('#txlist'))
    check('search: keeps focus while typing', pg.evaluate('document.activeElement.id') == 'txq')
    pg.fill('#txq', '۴۲۰۰۰۰'); wait(250); check('search: by amount (Persian digits)', 'ناهار' in pg.inner_text('#txlist'))
    pg.fill('#txq', 'سفر'); wait(250); check('search: by category', 'قطار' in pg.inner_text('#txlist'))
    pg.fill('#txq', 'zzz'); wait(250); check('search: helpful empty state', 'پیدا نشد' in pg.inner_text('#txlist'))
    pg.fill('#txq', ''); wait(250); check('search: cleared → month view', pg.query_selector('.mswitch') is not None)
    check('tx: day group shows daily net', pg.query_selector('.day-group .dnet') is not None)
    check('tx: rows show category icons', len(pg.query_selector_all('.txrow .cat-ic')) >= 3)
    pg.click('[data-tab=home]'); wait()
    check('home: recent transactions (≤4) with «همه» link', 0 < len(pg.query_selector_all('.txlist .txrow')) <= 4 and pg.query_selector('.linkbtn[data-tab=tx]') is not None)

    # ۵) هدیه در دارایی
    pg.click('[data-tab=inv]'); wait(); pg.click('.seal button'); wait()
    pg.fill('.sheet [name=p_gold]', '24000000'); pg.fill('.sheet [name=p_usdt]', '235000'); pg.fill('.sheet [name=p_btc]', '84000'); pg.click('.sheet #psave'); closed()
    pg.click('[data-act=locs] >> nth=0'); wait(); pg.click('[data-sug="خانه"]'); wait(100); pg.click('[data-close]'); closed()
    hub('op', '[data-type=gift_in]')
    check('gift: form from hub', 'هدیه' in pg.inner_text('.sheet-head h2'))
    pg.select_option('.sheet [name=asset]', 'gold'); wait(150); pg.fill('.sheet [name=q1]', '2'); pg.fill('#note', 'از مادربزرگ'); pg.click('#save'); closed()
    g = [o for o in S()['ops'] if o['type'] == 'gift_in'][0]
    check('gift_in: day value used as basis', g['in']['q'] == 2000 and g['cost'] == 480000000, g)
    pg.click('[data-tab=inv]'); wait(); pg.click('[data-act=invt][data-t=ops]'); wait(); pg.click('.fab'); wait(); pg.click('[data-pick=gift_out]'); wait(500)
    pg.select_option('.sheet [name=asset]', 'gold'); wait(150); pg.fill('.sheet [name=q1]', '0.5'); pg.click('#save'); closed()
    R = pg.evaluate('(() => { const r = V.replay(window.__vault.state); return { gold: r.totals.gold, realized: r.realized.r, errors: r.errors.length } })()')
    check('gift_out: removes 0.5 g, no realized P&L', R == {'gold': 1500, 'realized': 0, 'errors': 0}, R)
    pg.click('[data-act=opf][data-f=gift]'); wait()
    check('ops filter: هدیه', len(pg.query_selector_all('.oprow')) == 2)
    pg.click('[data-act=opf][data-f=all]'); wait()
    over = pg.query_selector('.oprow'); pg.click('.fab'); wait(); pg.click('[data-pick=gift_out]'); wait(400)
    pg.select_option('.sheet [name=asset]', 'gold'); wait(150); pg.fill('.sheet [name=q1]', '5'); wait(200)
    check('gift_out: blocks giving more than you have', 'کافی نیست' in pg.inner_text('#err')); pg.click('[data-close]'); closed()

    # ۵-ب) خرید قسطی: قسط اول روز خرید، بقیه اول ماه‌های بعد
    hub('newloan')
    pg.fill('#lname', 'اسنپ‌پی موبایل'); wait(100)
    check('bnpl: auto-detected from name', pg.get_attribute('#ltype [data-t=bnpl]', 'aria-pressed') == 'true')
    pg.fill('.sheet [name=lamount]', '2500000'); pg.fill('#lcount', '4')
    for part, v in (('y', '1405'), ('m', '7'), ('d', '25')): pg.select_option(f'.sheet [data-date=lfirst] [data-p={part}]', v)
    wait(150); prev = pg.inner_text('#lprev')
    check('bnpl: live preview = user example', '۲۵ مهر، ۱ آبان، ۱ آذر، ۱ دی' in prev, prev)
    check('bnpl: first installment counted as paid by default', pg.input_value('#lpaid') == '۱' and pg.is_checked('#firsttx'))
    pg.click('#lsave'); closed()
    L = [l for l in S()['loans'] if l['name'] == 'اسنپ‌پی موبایل'][0]
    dues = pg.evaluate(f"[0,1,2,3].map(i => Core.loanDue(window.__vault.state.loans.find(l => l.id === '{L['id']}'), i))")
    check('bnpl: stored schedule', L['restDay'] == 1 and dues == ['1405/07/25', '1405/08/01', '1405/09/01', '1405/10/01'], (L.get('restDay'), dues))
    t0 = [t for t in S()['tx'] if t.get('link', {}).get('id') == L['id']]
    check('bnpl: first-installment expense on purchase day, linked', len(t0) == 1 and t0[0]['date'] == '1405/07/25' and t0[0]['amount'] == 25000000 and L['paid']['0']['txId'] == t0[0]['id'])
    aban = pg.evaluate(f"Core.obligationsForMonth(window.__vault.state, '1405/08').filter(o => o.id === '{L['id']}').map(o => [o.key, o.due, o.paid])")
    check('bnpl: Aban has installment 2 due on the 1st, unpaid', aban == [['1', '1405/08/01', False]], aban)
    check('bnpl: loan card tagged', 'خرید قسطی' in pg.inner_text('#view'))
    pg.click(f'.card.loan:has-text("اسنپ‌پی موبایل")'); wait(); pg.click('[data-ledit]'); wait()
    check('bnpl: edit keeps type', pg.get_attribute('#ltype [data-t=bnpl]', 'aria-pressed') == 'true'); pg.click('.overlay >> nth=-1 >> [data-close]'); wait(350); pg.click('.overlay >> nth=-1 >> [data-close]'); closed()
    hub('newloan'); pg.fill('#lname', 'وام مسکن'); wait(100)
    check('bank loan: not auto-switched', pg.get_attribute('#ltype [data-t=bank]', 'aria-pressed') == 'true' and pg.is_hidden('#restwrap'))
    pg.fill('#lcount', '3'); wait(100); check('bank loan: same day every month in preview', pg.inner_text('#lprev').count('۶ ') >= 2 or 'تاریخ اقساط' in pg.inner_text('#lprev'))
    pg.click('[data-close]'); closed()
    pg.click('[data-tab=home]'); pg.click('[data-act=goset]'); wait(); pg.fill('#bnplday', '5'); pg.click('[data-act=savebnpl]'); wait(200)
    check('settings: default BNPL day saved', S()['settings']['bnplDay'] == 5)
    hub('newloan'); pg.click('#ltype [data-t=bnpl]'); wait(100)
    check('settings: new BNPL uses default day', pg.input_value('#lrest') == '۵')
    pg.click('[data-close]'); closed()

    # ۵-ج) فهرست‌های کاربر، موجودی بانک، اعتبار خرید، پلتفرم و فروشگاه
    st = S(); names = [a['name'] for a in st['accounts']]
    check('seed: banks', all(n in names for n in ['بلوبانک', 'سامان', 'کارآفرین', 'صادرات']))
    cr = [a for a in st['accounts'] if a.get('kind') == 'credit']
    check('seed: credit lines with 10M toman limit', sorted(a['name'] for a in cr) == sorted(['اسنپ‌پی اعتباری', 'دیجی‌پی اعتباری']) and all(a['limit'] == 100000000 for a in cr))
    check('seed: BNPL platforms & lenders', st['lists']['bnpl'] == ['دیجی‌پی', 'اسنپ‌پی'] and st['lists']['lenders'] == ['بلوبانک'])
    check('seed: investment platforms', all(n in [l['name'] for l in st['locations']] for n in ['وال‌گلد', 'والکس', 'نوبیتکس', 'کاریزما']))
    exp = st['categories']['expense']
    check('seed: expense categories = user list (in order)', exp[:22] == ['وام', 'قسط', 'کادو', 'خرید منزل', 'کفش و لباس', 'لوازم جانبی', 'سوپرمارکت', 'قبوض', 'شارژ ساختمان', 'کرایه', 'غذا', 'آرایشی و بهداشتی', 'طلا', 'آرایشگاه', 'میوه و سبزیجات', 'سفر', 'کافه', 'هزینه‌های خودرو', 'بنزین', 'دارو و درمان', 'اشتراک‌ها', 'سایر'], exp)
    hub('add', '[data-type=expense]')
    lettered = pg.evaluate("[...document.querySelectorAll('#cats .cattile')].filter(t => !t.querySelector('svg')).map(t => t.dataset.cat)")
    check('categories: every one of the 22 has a real icon', lettered == [], lettered)
    # خرید اعتباری
    pg.fill('.sheet [name=amount]', '3000000'); pg.click('#cats .chip[data-cat="کفش و لباس"]'); pg.fill('#note', 'کتونی')
    cid = [a['id'] for a in cr if a['name'] == 'اسنپ‌پی اعتباری'][0]; pg.select_option('#acc', cid); pg.click('#savetx'); closed()
    pg.click('[data-tab=home]'); wait()
    row = pg.query_selector('.ob:has-text("صورت‌حساب اسنپ‌پی اعتباری")')
    last = pg.evaluate("(() => { const t = Core.today(), p = Core.jParse(t); return Core.jStr(p.y, p.m, Core.monthLen(p.y, p.m)); })()")
    check('credit: statement in «پیش رو», due end of month', row is not None and '۳٬۰۰۰٬۰۰۰' in row.inner_text(), row.inner_text() if row else None)
    check('credit: remaining limit shown', '۷٬۰۰۰٬۰۰۰' in pg.inner_text('.accs li.credit'))
    var0 = pg.evaluate("Core.monthStats(window.__vault.state, Core.ym(Core.today())).variable")
    pg.click('.ob:has-text("صورت‌حساب اسنپ‌پی اعتباری") .tick'); wait(600)
    st = S(); rp = [t for t in st['tx'] if t.get('link', {}).get('kind') == 'credit']
    check('credit: settling = transfer (not a second expense)', len(rp) == 1 and rp[0]['type'] == 'transfer' and rp[0]['amount'] == 30000000)
    check('credit: spending counted once', pg.evaluate("Core.monthStats(window.__vault.state, Core.ym(Core.today())).variable") == var0)
    check('credit: limit restored after settling', '۱۰٬۰۰۰٬۰۰۰' in pg.inner_text('.accs li.credit'))
    hub('add', '[data-type=expense]'); pg.fill('.sheet [name=amount]', '11000000'); pg.select_option('#acc', cid); pg.click('#savetx'); closed()
    check('credit: over-limit asks, then allows', any(t['amount'] == 110000000 and t['account'] == cid for t in S()['tx']))
    # موجودی بانک
    pg.click('[data-act=goset]'); wait()
    bid = [a['id'] for a in S()['accounts'] if a['name'] == 'بلوبانک'][0]
    pg.fill(f'[data-accbal="{bid}"]', '50000000'); pg.click('[data-act=saveacc] >> nth=0'); wait(300)
    check('bank balance saved (rial)', [a for a in S()['accounts'] if a['id'] == bid][0]['balance'] == 500000000)
    pg.click('[data-tab=home]'); wait()
    check('home: bank total in accounts card', '۵۰٬۰۰۰٬۰۰۰' in pg.inner_text('.accs .acc-total'))
    check('home: net-worth card counts bank balance', 'موجودی بانک‌ها' in pg.inner_text('.nwcard'))
    net = pg.evaluate("""(() => { const s = window.__vault.state, pf = V.portfolio(s).total;
      const bank = s.accounts.filter(a => a.kind !== 'credit').reduce((x, a) => x + (a.balance > 0 ? a.balance : 0), 0);
      const loans = s.loans.reduce((x, l) => x + Core.loanSummary(l).remainingAmount, 0);
      const credit = s.tx.filter(t => t.type === 'expense' && s.accounts.some(a => a.kind === 'credit' && a.id === t.account && !(a.paid || {})[Core.ym(t.date)])).reduce((x, t) => x + t.amount, 0);
      let owe = 0, owed = 0; s.debts.forEach(d => { const l = d.amount - d.settles.reduce((a, b) => a + b.amount, 0); if (l > 0) d.dir === 'owe' ? owe += l : owed += l; });
      return pf + bank - loans - owe - credit + owed; })()""")
    shown = float(fa(pg.inner_text('.nwc-rows .net dd')).replace('−', '-').replace('تومان', '').strip())
    check('net worth = investments + bank − loans − people − credit + owed', abs(shown - net / 10) < 1, (shown, net / 10))
    pg.click('[data-tab=inv]'); wait(); pg.click('[data-act=invt][data-t=sum]'); wait()
    check('invest: bank balance in allocation & by-location', pg.query_selector('.alloc .k-bank') is not None and 'حساب‌های بانکی' in pg.inner_text('#view'))
    # پیامک «بلو» به بلوبانکِ تعریف‌شده وصل بشه
    n0 = len(S()['accounts'])
    pg.click('[data-tab=home]'); pg.click('[data-act=paste]'); wait()
    pg.evaluate('t => { document.querySelector("#smstext").value = t }', 'بلو\nبرداشت پول\nسیدعرفان عزیز، 1,000,000 ریال از حساب شما پرید.\nموجودی: 499,000,000 ریال\n۲۳:۵۹\n' + pg.evaluate('J.today()').replace('/', '.').replace('/', '.'))
    pg.click('#parse'); wait(500); pg.click('#cats .chip >> nth=0'); pg.click('#savetx'); closed()
    blu = [a for a in S()['accounts'] if a['name'] == 'بلوبانک'][0]
    check('sms «بلو» → existing بلوبانک account (no duplicate), balance updated', len(S()['accounts']) == n0 and blu['balance'] == 499000000, (len(S()['accounts']), n0, blu.get('balance')))
    # خرید قسطی: پلتفرم از فهرست + فروشگاه
    hub('newloan'); pg.select_option('#llender', 'دیجی‌پی'); wait(150)
    check('bnpl: choosing a BNPL platform switches type', pg.get_attribute('#ltype [data-t=bnpl]', 'aria-pressed') == 'true' and pg.is_visible('#lstore'))
    pg.fill('#lstore', 'دیجی‌کالا'); pg.fill('.sheet [name=lamount]', '1200000'); pg.fill('#lcount', '4'); pg.click('#lsave'); closed()
    L = [l for l in S()['loans'] if l.get('store') == 'دیجی‌کالا'][0]
    check('bnpl: name from platform + store', L['name'] == 'دیجی‌پی، دیجی‌کالا' and L['lender'] == 'دیجی‌پی' and L['restDay'] == 5)
    check('bnpl: card shows platform & store', 'دیجی‌پی، دیجی‌کالا' in pg.inner_text('#view'))
    # افزودن به فهرست: از تنظیمات و از داخل فرم
    pg.click('[data-tab=home]'); pg.click('[data-act=goset]'); wait()
    pg.fill('#newlist-bnpl', 'تارا'); pg.click('[data-act=addlist][data-key=bnpl]'); wait(200)
    check('lists: add BNPL platform in settings', 'تارا' in S()['lists']['bnpl'])
    hub('newloan'); answers.append('بانک ملت'); pg.select_option('#llender', '__newlender'); wait(300)
    check('lists: add lender inline from form', 'بانک ملت' in S()['lists']['lenders'] and pg.eval_on_selector('#llender', 'e => e.value') == 'بانک ملت')
    pg.click('[data-close]'); closed()
    hub('add', '[data-type=income]'); answers.append('بانک ملی'); pg.select_option('#acc', '__newbank'); wait(300)
    check('lists: add bank inline from transaction form', any(a['name'] == 'بانک ملی' for a in S()['accounts']) and pg.eval_on_selector('#acc', 'e => e.options[e.selectedIndex].text') == 'بانک ملی')
    pg.click('[data-close]'); closed()
    pg.click('[data-tab=home]'); pg.click('[data-act=goset]'); wait()
    pg.fill('#newcat-expense', 'حیوان خانگی'); pg.click('[data-act=addcat][data-type=expense]'); wait(200)
    check('lists: add expense category', 'حیوان خانگی' in S()['categories']['expense'])

    # ۶) خروجی‌ها
    pg.click('[data-tab=home]'); pg.click('[data-tab=rep]'); wait()
    with pg.expect_download(timeout=60000) as d: pg.click('[data-act=excel]')
    d.value.save_as('/tmp/u.xlsx'); wb = openpyxl.load_workbook('/tmp/u.xlsx')
    check('excel: fixed-income sheet', 'درآمدهای ثابت' in wb.sheetnames, wb.sheetnames)
    pg.evaluate("window.__fiOpenURL = u => { window.__lastURL = u; }"); pg.click('[data-act=cal]'); wait(600)
    ev = json.loads(pg.evaluate('navigator.clipboard.readText()'))['events']
    check('calendar: salary days included', any('دریافت' in e['title'] and '+' in e['title'] for e in ev))

    # ۷) چیدمان
    for w in (320, 390):
        pg.set_viewport_size({'width': w, 'height': 800})
        for t in ('home', 'tx', 'ob', 'inv'):
            pg.click(f'[data-tab={t}]'); wait(120)
            if t == 'ob': pg.click('[data-act=obt][data-t=income]'); wait(100)
            o = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth'); check(f'layout {w} {t}', o <= 0, o)
        pg.click('.tabbar .addbtn'); wait(); o = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth'); check(f'layout {w} hub', o <= 0, o)
        pg.click('[data-close]'); closed()
    pg.set_viewport_size({'width': 390, 'height': 844})
    shots = [('home', lambda: pg.click('[data-tab=home]')), ('plan', lambda: (pg.click('[data-tab=ob]'), pg.click('[data-act=obt][data-t=income]'))), ('tx', lambda: pg.click('[data-tab=tx]'))]
    for n, f in shots:
        f(); wait(250); pg.evaluate("document.querySelector('.tabbar').style.visibility='hidden'"); pg.screenshot(path=f'/tmp/x_{n}.png', full_page=True); pg.evaluate("document.querySelector('.tabbar').style.visibility=''")
    pg.click('.tabbar .addbtn'); wait(500); pg.screenshot(path='/tmp/x_hub.png'); pg.click('[data-close]'); closed()
    pg.click('.tabbar .addbtn'); wait(); pg.click('.hubtile[data-act=add][data-type=expense]'); wait(500); pg.screenshot(path='/tmp/x_form.png'); pg.click('[data-close]'); closed()
    check('no console/page errors', not errors, errors)
    b.close()
print(f'\n{len(passed)} passed, {len(failed)} failed'); sys.exit(1 if failed else 0)
