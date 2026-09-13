---
name: deploy-nutri
description: Deploy to nutri.emrullah.xyz — run the full validation gate first, then deploy.sh. User-invoked only.
disable-model-invocation: true
---

Canlıya çıkmadan önce üretim derlemesinin sağlam olduğunu ve çalışma ağacının temiz olduğunu doğrula, sonra deploy et.

Adımlar:

1. Doğrulama kapısı: `pnpm typecheck` (0 hata) → `pnpm test` (tüm testler geçmeli) → `pnpm check:i18n` (PARITY OK) → `pnpm build` (başarılı). Herhangi biri başarısız olursa DUR, düzelt, baştan başla.
2. `git status` çalıştır. Kaydedilmemiş (uncommitted) değişiklik varsa kullanıcıyı uyar — deploy tartışmasız şekilde istenmedikçe devam edilmemeli.
3. `pnpm run deploy` (çıplak `pnpm deploy` pnpm'in kendi alt komutuna gittiği için `run` şart).
4. Doğrula: https://nutri.emrullah.xyz yükleniyor mu kontrol et (tarayıcı ağı ya da curl), ayrıca
   canlı `index.html`'in yeni bundle'a baktığını teyit et (hash değişmiş olmalı).

Bu skill yalnızca kullanıcı tarafından çağrılmalıdır (`disable-model-invocation`). Ajan bir deploy
önermek yerine kullanıcıyı `/deploy-nutri`'yi çağırmaya yönlendirmeli.