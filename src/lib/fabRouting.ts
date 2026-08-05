// ============================================================================
// Nutrimind — FAB (Ekle / Tara / Egzersiz Kaydet) yönlendirme kararı.
// ============================================================================
import type { TabType } from "../components/BottomNav";

/** FAB aksiyonları hangi giriş noktasını kullanmalı:
 *
 *  - "daily-local": "Bugün" sekmesindeyken `DayView`'ın WeekStrip'te seçili
 *    tarihe bağlı YEREL tetikleyicisi kullanılır (`triggerAddMeal` /
 *    `triggerScan` / `triggerExercise`) — böylece FAB, WeekStrip'te farklı bir
 *    güne gidilmişken bile DOĞRU tarihe yazar.
 *  - "global-today": diğer sekmelerde (İlerleme/Hafıza/Ayarlar) WeekStrip
 *    bağlamı yok; `App.tsx`'in global modalları (`globalAddMealOpen` /
 *    `globalScanOpen` / `globalExerciseOpen`) bugünün tarihini kullanır.
 *
 *  Egzersiz kaydı bu ayrımı ATLIYORDU: FAB > "Egzersiz Kaydet" her zaman
 *  `todayISO()` yazıyordu, "Bugün" sekmesinde WeekStrip'ten dünkü güne
 *  gidilmişken bile — kayıt sessizce yanlış güne düşüyordu. */
export function fabTarget(tab: TabType): "daily-local" | "global-today" {
  return tab === "daily" ? "daily-local" : "global-today";
}
