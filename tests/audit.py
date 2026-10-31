"""ممیزی زمان اجرا: همه‌ی صفحه‌ها و ورقه‌ها — شناسه‌ی تکراری، متن خراب، و axe-core (دسترس‌پذیری)"""
import os, json, re, sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
AXE_PATHS = [os.environ.get('AXE_PATH', ''), 'node_modules/axe-core/axe.min.js', '/home/claude/lint/node_modules/axe-core/axe.min.js']
AXE = open(next(p for p in AXE_PATHS if p and os.path.exists(p))).read()  # npm install axe-core@4
issues = []
def audit(pg, where):
    dup = pg.evaluate("(() => { const c = {}; document.querySelectorAll('[id]').forEach(e => c[e.id] = (c[e.id] || 0) + 1); return Object.entries(c).filter(([k, v]) => v > 1); })()")
    if dup: issues.append((where, 'duplicate ids', dup))
    txt = pg.evaluate("document.body.innerText")
    bad = re.findall(r'.{0,25}(?:NaN|undefined|null|\[object|Infinity).{0,25}', txt)
    if bad: issues.append((where, 'broken text', bad[:4]))
    pg.evaluate(AXE)
    res = pg.evaluate("""async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, resultTypes: ['violations'] });
      return r.violations.filter(v => v.impact === 'critical' || v.impact === 'serious').map(v => [v.id, v.impact, v.nodes.length, v.nodes.slice(0, 2).map(n => n.target.join(' '))]); }""")
    if res: issues.append((where, 'a11y', res))
with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme in ('light', 'dark'):
        pg = b.new_page(viewport={'width': 390, 'height': 844}, color_scheme=scheme)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(BASE); pg.wait_for_timeout(300)
        # داده‌ی واقعی: بکاپ FI + قیمت‌ها و عملیات سرمایه
        pg.click('[data-act=goset]'); pg.set_input_files('#restore', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'fi-backup.json')); pg.wait_for_timeout(800)
        pg.evaluate("""(() => { const s = window.__vault.state; const L = s.locations[0].id;
          s.prices.push({ date: J.addDays(J.today(), -1), gold: 244000000, usdt: 2420000 }, { date: J.today(), auto: true, time: '06:27', post: 9, gold: 244245000, silver: 5123600, usd: 2431750, eur: 2763800, usdt: 2425700, btc: 83400 });
          s.ops.push({ id: 'a1', created: 1, date: J.today(), type: 'buy', loc: L, in: { a: 'gold', q: 2500 }, cost: 600000000 });
          s.ops.push({ id: 'a2', created: 2, date: J.today(), type: 'deposit', loc: L, in: { a: 'irr', q: 50000000 }, cost: 50000000 });
          s.accounts.find(a => a.name === 'بلوبانک').balance = 500000000;
          s.incomes.push({ id: 'i1', name: 'حقوق', amount: 300000000, day: 25, start: Core.ym(J.today()), end: null, paid: {}, cat: 'حقوق' });
          s.debts.push({ id: 'dg', dir: 'owed', person: 'علی', asset: 'gold', amount: 5000, date: J.today(), due: null, note: '', settles: [{ amount: 2000, date: J.today() }] },
            { id: 'db', dir: 'owe', person: 'سارا', asset: 'btc', amount: 1000000, date: J.today(), due: null, note: '', settles: [] },
            { id: 'db2', dir: 'owe', person: 'سارا', asset: 'irr', amount: 20000000, date: J.today(), due: null, note: '', settles: [] },
            { id: 'db3', dir: 'owe', person: 'مامان', asset: 'irr', amount: 50000000, date: J.today(), due: null, note: '', settles: [] },
            { id: 'dh', dir: 'owe', person: 'حسین', asset: 'usd', ret: 'rial', date: J.addMonths(J.today(), -2), due: null, note: '', settles: [{ amount: 0, r: 50000000, date: J.today() }],
              parts: [{ id: 'h1', date: J.addMonths(J.today(), -2), q: 3000, r: 80000000 }, { id: 'h2', date: J.addMonths(J.today(), -1), q: 3000, r: 85000000 }], rec: { q: 3000, first: J.today(), day: +J.today().slice(8), skip: [] } });
          localStorage.setItem('vault-v1', JSON.stringify(s)); })()"""); pg.reload(); pg.wait_for_timeout(500)
        views = [('home', lambda: pg.click('[data-tab=home]')), ('tx', lambda: pg.click('[data-tab=tx]')),
                 ('plan-income', lambda: (pg.click('[data-tab=ob]'), pg.click('[data-act=obt][data-t=income]'))),
                 ('plan-loan', lambda: pg.click('[data-act=obt][data-t=loan]')), ('plan-fixed', lambda: pg.click('[data-act=obt][data-t=fixed]')),
                 ('plan-debt', lambda: pg.click('[data-act=obt][data-t=debt]')),
                 ('inv-sum', lambda: (pg.click('[data-tab=inv]'), pg.click('[data-act=invt][data-t=sum]'))), ('inv-ops', lambda: pg.click('[data-act=invt][data-t=ops]')),
                 ('inv-an', lambda: pg.click('[data-act=invt][data-t=an]')), ('report', lambda: (pg.click('[data-tab=home]'), pg.click('.hdr-tools [data-tab=rep]'))),
                 ('settings', lambda: (pg.click('[data-tab=home]'), pg.click('.hdr-tools [data-act=goset]')))]
        for n, f in views: f(); pg.wait_for_timeout(250); audit(pg, f'{scheme}:{n}')
        pg.click('[data-tab=home]'); pg.wait_for_timeout(200)
        sheets = [('hub', "document.querySelector('.tabbar .addbtn').click()"),
                  ('expense', "document.querySelector('[data-act=add][data-type=expense]').click()"),
                  ('income', "document.querySelector('[data-act=add][data-type=income]').click()"),
                  ('paste', "document.querySelector('[data-act=paste]').click()"), ('duelist', "document.querySelector('[data-act=duelist]').click()")]
        for n, js in sheets:
            pg.evaluate(js); pg.wait_for_timeout(450); audit(pg, f'{scheme}:sheet-{n}'); pg.evaluate("document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.classList.remove('locked')")
        for n, act in [('newloan', 'newloan'), ('newfixed', 'newfixed'), ('newincome', 'newincome'), ('opchooser', 'opchooser'), ('prices', 'prices')]:
            pg.click('.tabbar .addbtn'); pg.wait_for_timeout(300); pg.click(f'.hubtile[data-act={act}]'); pg.wait_for_timeout(500); audit(pg, f'{scheme}:sheet-{n}')
            if n == 'newloan':  # نسخه‌ی ۱۵٫۳: خرید قسطی، قبل و بعد از انتخاب آنلاین/حضوری
                pg.click('#ltype [data-t=bnpl]'); pg.wait_for_timeout(250); audit(pg, f'{scheme}:sheet-bnpl-notype')
                pg.click('#lmode [data-m=store]'); pg.wait_for_timeout(250); audit(pg, f'{scheme}:sheet-bnpl-store')
            pg.evaluate("document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.classList.remove('locked')")
        for t in ('buy', 'sell', 'swap', 'transfer', 'gift_in', 'open'):
            pg.evaluate(f"window.Inv.openOp('{t}')"); pg.wait_for_timeout(450); audit(pg, f'{scheme}:op-{t}')
            pg.evaluate("document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.classList.remove('locked')")
        pg.click('[data-tab=ob]'); pg.click('[data-act=obt][data-t=debt]'); pg.wait_for_timeout(250)
        pg.click('[data-act=newdebt][data-dir=owe] >> nth=-1'); pg.wait_for_timeout(450); pg.click('#dasset [data-a=gold]'); pg.wait_for_timeout(250); audit(pg, f'{scheme}:sheet-debt-form')
        pg.click('#dmode [data-m=plan]'); pg.wait_for_timeout(200); audit(pg, f'{scheme}:sheet-debt-form-plan')
        pg.evaluate("document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.classList.remove('locked')")
        pg.click('.card.debt:has-text("علی")'); pg.wait_for_timeout(450); audit(pg, f'{scheme}:sheet-debt-detail')
        pg.click('#settle'); pg.wait_for_timeout(700); audit(pg, f'{scheme}:sheet-debt-settle-form')
        pg.evaluate("document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.classList.remove('locked')")
        # نسخه‌ی ۱۵ (مرحله‌ی ۲): جزئیات «معادل ریالی» با قرض‌ها و تکرار، ویرایش قرض، تأیید نوبت، فرم با روش برگشت و تکرار
        pg.click('.card.debt:has-text("حسین")'); pg.wait_for_timeout(450); audit(pg, f'{scheme}:sheet-debt-rial-detail')
        pg.click('.sheet .parts li:first-child button'); pg.wait_for_timeout(500); audit(pg, f'{scheme}:sheet-debt-part')
        pg.evaluate("document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.classList.remove('locked')")
        pg.click('[data-tab=home]'); pg.wait_for_timeout(250); pg.click('.ob-body:has-text("قرض ماهانه")'); pg.wait_for_timeout(500)
        pg.click('#rmode [data-m=acc]'); pg.wait_for_timeout(150); audit(pg, f'{scheme}:sheet-rec-confirm')
        pg.evaluate("document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.classList.remove('locked')")
        pg.click('[data-tab=ob]'); pg.click('[data-act=obt][data-t=debt]'); pg.wait_for_timeout(250)
        pg.click('[data-act=newdebt][data-dir=owe] >> nth=-1'); pg.wait_for_timeout(450); pg.fill('#dperson', 'حسین'); pg.click('#dasset [data-a=usd]'); pg.click('#dret [data-r=rial]'); pg.wait_for_timeout(200)
        pg.click('#djoin [data-j=sep]'); pg.click('#drecon'); pg.wait_for_timeout(200); audit(pg, f'{scheme}:sheet-debt-form-rial-rec')
        pg.evaluate("document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.classList.remove('locked')")
        pg.evaluate("App.openTx({ kind: 'in', why: 'borrow' })"); pg.wait_for_timeout(500); pg.fill('#tperson', 'حسین'); pg.click('#tasset [data-a=usd]'); pg.wait_for_timeout(250); pg.click('#tret [data-r=rial]'); pg.wait_for_timeout(250)
        audit(pg, f'{scheme}:sheet-tx-borrow-rial')
        pg.evaluate("document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.classList.remove('locked')")
        # نسخه‌ی ۱۵: برگه‌ی یک نفر (چند مورد)
        pg.click('.card.debt:has-text("سارا")'); pg.wait_for_timeout(450); audit(pg, f'{scheme}:sheet-debt-person')
        pg.evaluate("document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.classList.remove('locked')")
        # نسخه‌ی ۱۲: فرم یکپارچه در همه‌ی حالت‌ها + فهرست تراکنش‌ها با ردیف‌های دارایی
        L = pg.evaluate("window.__vault.state.locations[0].id")
        forms = [('out-asset', "{ kind: 'out', preset: { acc: '%s', asset: 'gold', q: 500 } }" % L), ('out-lend', "{ kind: 'out', why: 'lend' }"), ('out-repay', "{ kind: 'out', why: 'repay' }"),
                 ('in-collect', "{ kind: 'in', why: 'collect', preset: { debt: 'dg' } }"), ('in-gift', "{ kind: 'in', why: 'gift' }"), ('move', "{ type: 'transfer', preset: { acc: '%s', asset: 'gold', q: 100 } }" % L),
                 ('conv', "{ type: 'conv', preset: { acc: '%s', asset: 'gold', q: 100, q2: 2000000 } }" % L),
                 ('in-loan', "{ kind: 'in', why: 'loan' }"), ('in-borrow', "{ kind: 'in', why: 'borrow' }")]
        for n, o in forms:
            pg.evaluate(f"window.App.openTx({o})"); pg.wait_for_timeout(450); audit(pg, f'{scheme}:tx-{n}')
            if n == 'in-borrow': pg.click('#tmode [data-m=plan]'); pg.wait_for_timeout(250); audit(pg, f'{scheme}:tx-borrow-plan')
            if n == 'in-loan': pg.click('#lnunit [data-u=usdt]'); pg.wait_for_timeout(250); audit(pg, f'{scheme}:tx-loan-usdt')
            if n == 'out-asset': pg.evaluate("window.Flow.save(window.__vault.state, { kind: 'out', why: 'lend', person: 'تست', acc: '%s', asset: 'gold', q: 500 }, null, {}); window.App.save()" % L)
            pg.evaluate("document.querySelectorAll('.overlay').forEach(o => o.remove()); document.body.classList.remove('locked')")
        pg.evaluate("window.Flow.save(window.__vault.state, { kind: 'conv', acc: '%s', asset: 'gold', q: 100, acc2: '%s', asset2: 'irr', q2: 20000000 }, null, {}); window.App.save(); window.App.render()" % (L, L))
        pg.click('[data-tab=tx]'); pg.wait_for_timeout(300); audit(pg, f'{scheme}:tx-list-with-assets')
        pg.click('[data-tab=home]'); pg.wait_for_timeout(300); audit(pg, f'{scheme}:home-with-assets')
        if errs: issues.append((scheme, 'page errors', errs))
        pg.close()
    b.close()
for i in issues: print(json.dumps(i, ensure_ascii=False)[:400])
print(f'\n{len(issues)} issue groups'); sys.exit(1 if issues else 0)
