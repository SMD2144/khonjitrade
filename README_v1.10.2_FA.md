# KhonjiTrade PWA v1.10.2 — Delete Sync Fix

رفع باگ مهم همگام‌سازی حذف:
- حذف معامله یا حذف گروه پوشش در PWA اکنون Tombstone را درست در همان متادیتای Sync ذخیره می‌کند.
- Tombstone دیگر در انتهای `save()` به‌اشتباه با نسخه قدیمی متادیتا overwrite نمی‌شود.
- حذف از PWA باید به Server برسد و سپس Android در Pull بعدی همان رکوردها را حذف کند.
- منطق Revision / Generation / Delta Sync دست نخورده است.
- کلید داده اصلی `khonji_pwa_v1` تغییر نکرده است.

نسخه: 1.10.2
