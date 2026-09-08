KhonjiTrade PWA v1.1 TABLET PRO

مبنای اطلاعات تغییر نکرده است:
localStorage key = khonji_pwa_v1

بنابراین اطلاعات نسخه قبلی PWA روی همان iPad حفظ می‌شوند.

بهبودهای مخصوص تبلت:
- داشبورد دو ستونه در حالت افقی
- پنل وضعیت لحظه‌ای طلا/سکه/ارز
- آخرین معاملات در کنار داشبورد
- کارت‌های بزرگ‌تر و حرفه‌ای‌تر
- فرم دو ستونه برای مبلغ/نرخ و طرف حساب/توضیحات
- مثبت در سمت راست و منفی در سمت چپ
- عدد مقدار وسط و واضح
- فوکوس و اسکرول چندمرحله‌ای هنگام باز شدن کیبورد
- کنتراست بهتر فیلد فعال
- نوار پایین بزرگ‌تر و مناسب تبلت
- cache جدید برای دریافت نسخه تازه در iPad


v1.1.1 BALANCE DISPLAY FIX
- Fixed DOM/function name collision for goldBalance.
- Balance calculation data was correct; only the dashboard card stayed at zero.
- Dashboard element access now uses explicit getElementById calls.
- localStorage key remains khonji_pwa_v1, so existing iPad data is preserved.


v1.1.2 FORCE UPDATE
- Static assets use version query strings.
- Service worker uses skipWaiting + clientsClaim.
- index/app/css use network-first with no-store.
- Old caches are deleted on activation.
- Existing localStorage data remains unchanged.


v1.2.0 INTERNAL BALANCE SETTLEMENT
- پیشنهاد کوتاه «از طلا پوشش بده» برای کسری سکه وقتی طلای وزنی مثبت است.
- پیشنهاد کوتاه «از سکه پوشش بده» برای کسری طلا وقتی سکه مثبت است.
- تأیید دو مرحله‌ای قبل از ثبت.
- ثبت به صورت رکورد مستقل نوع SETTLEMENT.
- نمایش تسویه داخلی در دفتر امروز.
- نمایش تاریخچه تسویه‌ها در گزارش.
- بالانس کل 18 عیار با تبدیل داخلی تغییر مصنوعی نمی‌کند؛ فقط ترکیب دارایی‌ها تغییر می‌کند.
- localStorage key unchanged: khonji_pwa_v1


v1.2.1 TABLET BALANCE UI CLEANUP
- پیشنهاد پوشش از ردیف شلوغ جدا و خواناتر شد.
- متن دکمه دقیق‌تر شده: مقدار طلا/سکه‌ای که برای پوشش استفاده می‌شود داخل خود دکمه نمایش داده می‌شود.
- کارت بالانس کل 18 عیار در تبلت فضای بیشتری دارد.
- نمایش وضعیت لحظه‌ای فشرده‌تر و خواناتر شده.
- storage key unchanged: khonji_pwa_v1
