# تست‌ها با تاریخ ثابت (VAULT_NOW، میلی‌ثانیه) اجرا بشن: Date جابه‌جا می‌شه ولی ساعت جلو می‌ره
import os
NOW = os.environ.get('VAULT_NOW')
if NOW:
    from playwright.sync_api._generated import Browser, BrowserContext
    JS = "(()=>{const D=Date,delta=%s-D.now();class F extends D{constructor(...a){a.length?super(...a):super(D.now()+delta)}static now(){return D.now()+delta}}window.Date=F;})()" % NOW
    _nc = Browser.new_context
    def new_context(self, *a, **k):
        c = _nc(self, *a, **k); c.add_init_script(JS); return c
    Browser.new_context = new_context
    _np = Browser.new_page
    def new_page(self, *a, **k):
        p = _np(self, *a, **k); p.add_init_script(JS); return p
    Browser.new_page = new_page
