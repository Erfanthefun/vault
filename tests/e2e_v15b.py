"""تست end-to-end نسخه‌ی ۱۵ (مرحله‌ی ۲): روش برگشت «معادل ریالی»، معادل ریالی روز، اضافه به مورد باز، تسویه‌ی ماه‌به‌ماه، دلار↔تتر، قرض تکرارشونده"""
import sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, info)
FA = str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789')
fa = lambda s: s.translate(FA).replace('٬', ',')

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
    def toast(): pg.wait_for_function("document.querySelector('#toast') && document.querySelector('#toast').innerText.trim()"); t = pg.inner_text('#toast'); pg.evaluate("document.querySelector('#toast').innerText = ''"); return t
    def setdate(name, expr):
        pg.evaluate(f"""(() => {{ const v = {expr}, [y, m, d] = v.split('/').map(Number), w = document.querySelector('.overlay:last-child [data-date={name}]');
          w.querySelector('[data-p=y]').value = y; w.querySelector('[data-p=m]').value = m; w.querySelector('[data-p=d]').value = d;
          w.querySelector('[data-p=d]').dispatchEvent(new Event('change', {{ bubbles: true }})); }})()"""); wait(150)
    debt = lambda person: next(x for x in S()['debts'] if x['person'] == person)
    replay = lambda person: pg.evaluate(f"Core.debtReplay(window.__vault.state.debts.find(d => d.person === '{person}'))")
    held = lambda loc, a: pg.evaluate(f"(V.replay(window.__vault.state).H['{loc}'] || {{}})['{a}'] || 0")
    bal = lambda acc: pg.evaluate(f"Core.accountBalance(window.__vault.state, window.__vault.state.accounts.find(a => a.id === '{acc}')).balance")

    pg.goto(BASE); wait(500)
    # قیمت امروز: دلار ۲۹۰ هزار تومان → ۳۰ دلار = ۸٫۷ میلیون تومان (مثال کاربر)
    pg.evaluate("""(()=>{const s=window.__vault.state; s.prices.push({date:J.today(),gold:244012000,silver:5140100,usd:2900000,eur:3200000,usdt:2950000});
      s.locations.push({id:'L1',name:'والکس'}); s.accounts.push({id:'BK',kind:'bank',bank:'بلو',name:'بلوبانک',num:'',balance:500000000,stamp:'',at:1});
      s.ops.push({id:'o0',created:1,date:J.addDays(J.today(),-40),type:'open',loc:'L1',in:{a:'usdt',q:100e6},cost:2900000000});
      s.debts.push({id:'old1',dir:'owe',person:'کاوه',asset:'usd',amount:5000,date:J.addDays(J.today(),-30),due:null,note:'',settles:[]});
      window.App.save(); location.reload();})()"""); wait(700)
    # ۰) مهاجرت: مورد قدیمی یک بخش و «به همون واحد»
    k = debt('کاوه')
    check('migrate: old debt → one part, unit return', len(k['parts']) == 1 and k['parts'][0]['q'] == 5000 and 'ret' not in k, k)

    # ۱) فرم تعهدات: روش برگشت و معادل ریالی روز
    debts(); pg.click('[data-act=newdebt][data-dir=owe] >> nth=-1'); wait(450)
    pg.fill('#dperson', 'حسین'); pg.click('#dasset [data-a=usd]'); pg.fill('#dqty', '30'); wait(200)
    check('form: return-type chips for non-toman (default «به همون واحد»)', pg.is_visible('#dret') and 'on' in pg.get_attribute('#dret [data-r=unit]', 'class'))
    check('form: rial equivalent auto for today = 8,700,000 toman', fa(pg.input_value('.sheet [name=drial]')) == '8,700,000', pg.input_value('.sheet [name=drial]'))
    check('form: optional in unit mode', '(اختیاری)' in pg.inner_text('#drialw'))
    pg.click('#dret [data-r=rial]'); wait(150)
    check('form: required in rial mode', '(اختیاری)' not in pg.inner_text('#drialw') and 'جمع معادل ریالی' in pg.inner_text('#drethint'))
    setdate('ddate', 'J.addMonths(J.today(), -2)')
    check('form: past date without a price → field empty, asks to type it', pg.input_value('.sheet [name=drial]') == '' and 'قیمتی ثبت نشده' in pg.inner_text('#drialhint'))
    pg.click('#dsave'); wait(250)
    check('form: rial mode without equivalent → blocked', 'معادل ریالی' in toast() and not any(x['person'] == 'حسین' for x in S()['debts']))
    pg.fill('.sheet [name=drial]', '8000000'); pg.click('#dsave'); closed()
    h = debt('حسین')
    check('save: rial return + first part with its equivalent', h.get('ret') == 'rial' and len(h['parts']) == 1 and h['parts'][0]['r'] == 80000000 and h['amount'] == 3000, h)

    # ۲) قرض دوم از همون فرم: «اضافه به همون» پیش‌فرض
    debts(); pg.click('[data-act=newdebt][data-dir=owe] >> nth=-1'); wait(450)
    pg.fill('#dperson', 'حسین'); pg.click('#dasset [data-a=usd]'); pg.click('#dret [data-r=rial]'); pg.fill('#dqty', '30'); wait(200)
    check('join: offered and on by default; schedule hidden', pg.is_visible('#djoin') and 'on' in pg.get_attribute('#djoin [data-j=join]', 'class') and pg.is_hidden('#dschedw'))
    pg.click('#djoin [data-j=sep]'); wait(100)
    check('join: «مورد جدا» shows schedule again', pg.is_visible('#dschedw'))
    pg.click('#djoin [data-j=join]'); wait(100)
    setdate('ddate', 'J.addMonths(J.today(), -1)'); pg.fill('.sheet [name=drial]', '8500000'); pg.click('#dsave'); closed()
    h = debt('حسین')
    check('join: second part on the same debt', len([x for x in S()['debts'] if x['person'] == 'حسین']) == 1 and len(h['parts']) == 2 and h['amount'] == 6000, h)

    # ۳) قرض سوم از «+ › واریز › قرض گرفتم» به والکس، با معادل خودکار امروز
    pg.evaluate("App.openTx({ kind: 'in', why: 'borrow' })"); wait(500)
    pg.fill('#tperson', 'حسین'); pg.select_option('#acc', 'L1'); wait(250); pg.click('#tasset [data-a=usd]'); wait(250)
    pg.click('#tret [data-r=rial]'); wait(250); pg.fill('.sheet [name=amount]', '30'); wait(300)
    check('tx form: rial label + auto value today', 'معادل ریالی روز' in pg.inner_text('#valw') and fa(pg.input_value('.sheet [name=value]')) == '8,700,000', pg.input_value('.sheet [name=value]'))
    check('tx form: join offered', pg.is_visible('#tjoin') and 'اضافه می‌شه' in pg.inner_text('#tsum'), pg.inner_text('#tsum'))
    pg.click('#savetx'); closed()
    h = debt('حسین')
    check('tx form: third part with src, r = 87,000,000 rial', len(h['parts']) == 3 and h['parts'][2]['r'] == 87000000 and h['parts'][2].get('src'), h['parts'])
    check('tx form: 30$ added to والکس', held('L1', 'usd') == 3000)

    # ۴) فهرست و جمع‌ها: معادل ریالی، نه قیمت امروز
    debts()
    card = pg.inner_text('.card[data-act=debtp]:has-text("حسین")')
    check('card: total = sum of equivalents (25,200,000)', '25,200,000' in fa(card), card)
    check('card: breakdown «۹۰ دلار (برگشت ریالی)»', '۹۰ دلار (برگشت ریالی)' in card, card)
    tot = pg.evaluate('App.debtTotals()')
    check('totals: rial side used', tot['owe'] == 252000000 + 5000 * 2900000 // 100, tot)

    # ۵) جزئیات: دو عدد موازی و فهرست قرض‌ها
    pg.click('.card[data-act=debtp]:has-text("حسین")'); wait(500)
    sums = fa(pg.inner_text('.sheet .sums'))
    check('detail: both numbers (90 dollars or 25,200,000)', '90' in sums and '25,200,000' in sums, sums)
    check('detail: three loans listed with equivalents', len(pg.query_selector_all('.sheet .parts li')) == 3 and 'معادل' in pg.inner_text('.sheet .parts'))
    check('detail: return type stated', 'معادل ریالی برمی‌گرده' in pg.inner_text('.sheet-body'))

    # ۶) تسویه‌ی تومانی: از طرف ریالی، قدیمی‌ترین اول
    pg.click('#settle'); wait(700)
    pg.click('#tasset [data-a=irr]'); wait(200); pg.select_option('#acc', 'BK'); wait(200); pg.fill('.sheet [name=amount]', '10000000'); wait(300)
    check('settle toman: summary says rial side, oldest first', 'از معادل ریالیِ' in pg.inner_text('#tsum') and '15,200,000' in fa(pg.inner_text('#tsum')), pg.inner_text('#tsum'))
    pg.click('#savetx'); closed()
    R = replay('حسین'); h = debt('حسین')
    check('settle toman: r stored, month 1 paid, month 2 partial', h['settles'][0]['r'] == 100000000 and [x['status'] for x in R['parts']] == ['paid', 'partial', 'open'] and R['leftR'] == 152000000, (h['settles'], R['parts']))
    check('settle toman: dollars reduced 30 + 20/85 of 30', h['settles'][0]['amount'] == 3000 + round(3000 * 20 / 85), h['settles'][0])
    check('settle toman: bank −10,000,000', bal('BK') == 500000000 - 100000000)

    # ۷) تسویه با تتر: یک‌به‌یک از طرف دلاری
    debts(); pg.click('.card[data-act=debtp]:has-text("حسین")'); wait(500); pg.click('#settle'); wait(700)
    pg.click('#tasset [data-a=usdt]'); wait(200); pg.select_option('#acc', 'L1'); wait(200); pg.fill('.sheet [name=amount]', '10'); wait(300)
    check('settle tether: 1:1 in summary', 'یک‌به‌یک' in pg.inner_text('#tsum'), pg.inner_text('#tsum'))
    pg.click('#savetx'); closed()
    h = debt('حسین')
    check('settle tether: 10 USDT = 10$ off the dollar side', h['settles'][1]['amount'] == 1000 and 'r' not in h['settles'][1], h['settles'])

    # ۸) ویرایش یک قرض (بدون تراکنش)
    debts(); pg.click('.card[data-act=debtp]:has-text("حسین")'); wait(500)
    pg.click('.sheet .parts li:nth-child(2) button'); wait(500)
    check('part edit: sheet with qty, rial, date', pg.is_visible('.sheet [name=pq]') and pg.is_visible('.sheet [name=pr]'))
    pg.fill('.sheet [name=pr]', '9000000'); pg.click('#psave'); wait(700)
    R = replay('حسین')
    check('part edit: equivalent changed, replay updated', debt('حسین')['parts'][1]['r'] == 90000000 and R['totalR'] == 80000000 + 90000000 + 87000000, R['totalR'])
    if pg.query_selector('.overlay'): pg.click('.overlay [data-close]'); closed()
    # قرضی که با تراکنش ساخته شده: از فرم همون تراکنش
    debts(); pg.click('.card[data-act=debtp]:has-text("حسین")'); wait(500)
    pg.click('.sheet .parts li:nth-child(3) button'); wait(600)
    check('part with transaction opens its transaction form (person locked)', pg.is_visible('#savetx') and pg.get_attribute('#tperson', 'readonly') is not None)
    pg.click('.overlay [data-close]'); closed()

    # ۹) قرض تکرارشونده: «فقط ثبت»
    debts(); pg.click('[data-act=newdebt][data-dir=owe] >> nth=-1'); wait(450)
    pg.fill('#dperson', 'رضا'); pg.click('#dasset [data-a=usd]'); pg.click('#dret [data-r=rial]'); pg.fill('#dqty', '30'); wait(200)
    setdate('ddate', 'J.addMonths(J.today(), -1)'); pg.fill('.sheet [name=drial]', '8600000')
    pg.click('#drecon'); wait(150)
    check('recurring: fields shown', pg.is_visible('.sheet [name=drecq]') and pg.is_visible('#drecend'))
    setdate('drecfirst', 'J.today()'); pg.fill('#drecn', '12')
    for w in (320,):
        pg.set_viewport_size({'width': w, 'height': 800}); wait(150)
        o = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth'); check(f'form {w}px with recurring: no horizontal scroll', o <= 0, o)
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.click('#dsave'); closed()
    r = debt('رضا')
    check('recurring: saved on the debt', r['rec']['q'] == 3000 and r['rec']['n'] == 12 and r['rec']['first'] == pg.evaluate('J.today()'), r.get('rec'))
    pg.click('[data-tab=home]'); wait(300)
    check('home: occurrence in «پیش رو»', 'قرض ماهانه از رضا' in pg.inner_text('#view'))
    pg.click('.ob-body:has-text("قرض ماهانه از رضا")'); wait(500)
    check('confirm: rial auto for today, «فقط ثبت» default', fa(pg.input_value('.sheet [name=rr]')) == '8,700,000' and 'on' in pg.get_attribute('#rmode [data-m=rec]', 'class'))
    pg.click('#rsave'); closed()
    r = debt('رضا')
    check('confirm (record only): part with rec key, no transaction', len(r['parts']) == 2 and r['parts'][1].get('rec') == pg.evaluate('J.today()') and r['parts'][1]['r'] == 87000000 and not r['parts'][1].get('src'), r['parts'])
    check('home: occurrence gone after confirm', 'قرض ماهانه از رضا' not in pg.inner_text('#view'))
    debts(); pg.click('.card[data-act=debtp]:has-text("رضا")'); wait(500)
    check('detail: recurring info with next occurrence', 'تکرار ماهانه' in pg.inner_text('.sheet-body') and 'نوبت بعدی' in pg.inner_text('.sheet-body'))
    pg.click('.overlay [data-close]'); closed()

    # ۱۰) تکرارشونده: «کم از حساب» (طلب تومانی)
    debts(); pg.click('[data-act=newdebt][data-dir=owed] >> nth=-1'); wait(450)
    pg.fill('#dperson', 'مینا'); pg.fill('.sheet [name=damount]', '1000000'); pg.click('#drecon'); wait(100); setdate('drecfirst', 'J.today()'); pg.click('#drecend [data-e=none]'); pg.click('#dsave'); closed()
    pg.click('[data-tab=home]'); wait(300)
    pg.click('.ob-body:has-text("قرض ماهانه به مینا")'); wait(500)
    pg.click('#rmode [data-m=acc]'); wait(100); pg.select_option('#racc', 'BK'); pg.click('#rsave'); closed()
    m = debt('مینا'); st = S()
    lend = [t for t in st['tx'] if t.get('why') == 'lend']
    check('confirm (account): lend transaction from bank, joined with rec key', len(lend) == 1 and lend[0]['account'] == 'BK' and len(m['parts']) == 2 and m['parts'][1].get('rec') and m['parts'][1].get('src'), (lend, m['parts']))
    check('confirm (account): bank −1,000,000 toman', bal('BK') == 500000000 - 100000000 - 10000000)
    check('confirm (account): account remembered for next time', m['rec'].get('acc') == 'BK')

    # ۱۱) رد کردن یک نوبت
    pg.evaluate("""(()=>{const d=window.__vault.state.debts.find(x=>x.person==='کاوه'); d.rec={q:1000,first:J.today(),day:+J.today().slice(8),skip:[]}; App.save(); App.render();})()""")
    pg.click('[data-tab=home]'); wait(300)
    pg.click('.ob-body:has-text("قرض ماهانه از کاوه")'); wait(500); pg.click('#rskip'); closed()
    check('skip: occurrence removed and remembered', 'قرض ماهانه از کاوه' not in pg.inner_text('#view') and debt('کاوه')['rec']['skip'] == [pg.evaluate('J.today()')])

    # ۱۲) مورد قدیمی → «معادل ریالی» با ویرایش
    debts(); pg.click('.card[data-act=debtp]:has-text("کاوه")'); wait(500); pg.click('#dedit'); wait(500)
    pg.click('#dret [data-r=rial]'); pg.fill('.sheet [name=drial]', '14000000'); pg.click('#dsave'); closed()
    k = debt('کاوه')
    check('legacy edit: switched to rial return with equivalent', k.get('ret') == 'rial' and k['parts'][0]['r'] == 140000000, k)

    # ۱۳) حذف قرضِ ساخته‌شده با تراکنش → فقط همون بخش
    n0 = len(debt('حسین')['parts'])
    src = debt('حسین')['parts'][2]['src']
    pg.evaluate(f"Flow.remove(window.__vault.state, {{ tx: '{src.get('tx', '')}', op: '{src.get('op', '')}' }}.op ? {{ op: '{src.get('op', '')}' }} : {{ tx: '{src.get('tx', '')}' }}); App.save(); App.render();")
    check('remove transaction: only its part removed', len(debt('حسین')['parts']) == n0 - 1 and held('L1', 'usd') == 0)
    check('no page errors', not errors, errors)
    b.close()

print(f'{len(passed)} passed, {len(failed)} failed')
sys.exit(1 if failed else 0)
