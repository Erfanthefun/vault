#!/bin/bash
# همه‌ی تست‌ها: هسته‌ها و دستیار قیمت (node) + end-to-end بخش مالی، سرمایه، رابط و قیمت خودکار (Playwright)
cd "$(dirname "$0")/.."
node tests/core.test.js || exit 1
node tests/invest.test.js || exit 1
node tests/feed.test.js || exit 1
node tests/flow.test.js || exit 1
node tests/v14.test.js || exit 1
node tests/v15.test.js || exit 1
python3 tests/css_check.py index.html || exit 1
python3 -m http.server 8767 >/dev/null 2>&1 & SRV=$!
sleep 1
python3 tests/e2e_fi.py; A=$?
python3 tests/e2e_inv.py; B=$?
python3 tests/e2e_ux.py; U=$?
python3 tests/e2e_auto.py; P=$?
python3 tests/e2e_debt.py; D=$?
python3 tests/e2e_bal.py; L=$?
python3 tests/e2e_inc.py; I=$?
python3 tests/e2e_xbank.py; K=$?
python3 tests/e2e_credit.py; R=$?
python3 tests/e2e_v12.py; W=$?
python3 tests/e2e_loanrecv.py; N=$?
python3 tests/e2e_v14.py; F=$?
python3 tests/e2e_v15.py; G=$?
python3 tests/e2e_v15b.py; H=$?
# مقایسه با نسخه‌ی قبل: اگه نسخه‌ی قبلی روی پورت ۸۷۶۸ در دسترس باشه (OLD_VERSION=۱۳ برای نسخه‌ی ۱۳)
M=0; if curl -s -o /dev/null http://localhost:8768/index.html; then python3 tests/e2e_migrate.py; M=$?; fi
python3 tests/audit.py; X=$?
kill $SRV; exit $(( A || B || U || P || D || L || I || K || R || W || N || F || G || H || M || X ))
