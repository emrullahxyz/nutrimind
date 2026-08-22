---
name: verify-gate
description: Run the full validation gate (typecheck + test + build) before declaring any task complete
---

CLAUDE.md, Projeye özgü doğrulama kapısını şöyle tanımlar: `pnpm typecheck` (0 hata) + `pnpm test` (tüm test süiti geçmeli) + `pnpm build` (✓ built). Bir görevi tamamlamadan önce bu üç komut sırayla çalıştırılmalıdır.

Adımlar:

1. `pnpm typecheck` — 0 hata olmalı.
2. `pnpm test` — tüm testler geçmeli (tek bir başarısız test bile kapıyı kapatır).
3. `pnpm build` — başarılı olmalı.

Her hangisi başarısız olursa kök nedeni düzelt, sonra bozulan adımdan(aşamadan) yeniden başlat. Düzeltilmeden görevi tamamlanmış sayma.