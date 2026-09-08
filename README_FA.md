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
